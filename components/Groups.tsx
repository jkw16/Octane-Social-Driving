import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Search, Plus, Send, ChevronLeft, MessageSquare, MoreVertical, Shield, Lock, Globe, Key, LogIn } from 'lucide-react';
import { Group, ChatMessage, UserProfile } from '../types';
import { supabase } from '../supabase/client';

interface GroupsProps {
  user: UserProfile;
}

interface MemberInfo { username: string; avatar: string; rank: string }

// Hydrate a list_groups() row into the app's Group shape.
const toGroup = (r: any): Group => ({
  id: r.id,
  name: r.name,
  members: Number(r.member_count ?? 0),
  image: r.image || `https://picsum.photos/200/200?random=${r.id.slice(0, 8)}`,
  description: r.description || (r.is_private ? 'Private crew.' : 'New crew on the block.'),
  isJoined: !!r.is_joined,
  userRank: r.user_rank ?? undefined,
  isPrivate: !!r.is_private,
  inviteCode: r.invite_code ?? undefined,
});

export const Groups: React.FC<GroupsProps> = ({ user }) => {
  const [myId, setMyId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [isJoiningPrivate, setIsJoiningPrivate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrivacy, setNewGroupPrivacy] = useState<'public' | 'private'>('public');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Record<string, MemberInfo>>({});
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  const activeGroup = groups.find(g => g.id === activeGroupId);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (group: Group) =>
    normalizedQuery === '' || group.name.toLowerCase().includes(normalizedQuery);

  // --- Auth (need auth.uid() for inserts / RLS) ---
  useEffect(() => {
    if (!supabase) { setAuthChecked(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setMyId(data.session?.user.id ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMyId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Load the groups list (joined + discover) ---
  const loadGroups = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('list_groups');
    if (!error && Array.isArray(data)) setGroups(data.map(toGroup));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (myId) void loadGroups();
    else setGroups([]);
  }, [myId, loadGroups]);

  // Scroll chat to bottom on new messages / group change.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeGroupId]);

  // Open a group: fetch members + messages, subscribe to live inserts.
  const openGroup = useCallback(async (gid: string) => {
    if (!supabase) return;
    // teardown any previous channel
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }

    // members (for sender name/avatar/rank) via the group_members -> profiles FK
    const { data: memRows } = await supabase
      .from('group_members')
      .select('user_id, rank, profiles:profiles(username, avatar)')
      .eq('group_id', gid);
    const map: Record<string, MemberInfo> = {};
    (memRows ?? []).forEach((r: any) => {
      map[r.user_id] = { username: r.profiles?.username ?? 'Driver', avatar: r.profiles?.avatar ?? '', rank: r.rank ?? 'Rookie' };
    });
    setMembers(map);

    const { data: msgRows } = await supabase
      .from('messages')
      .select('id, sender_id, text, created_at')
      .eq('group_id', gid)
      .order('created_at', { ascending: true });
    setMessages((msgRows ?? []).map((m: any) => toChat(m, map, myId)));

    // realtime inserts
    const ch = supabase
      .channel(`group:${gid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${gid}` }, (payload) => {
        const row = payload.new as any;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev; // dedupe (own optimistic insert)
          return [...prev, toChat(row, map, myId)];
        });
      })
      .subscribe();
    channelRef.current = ch;
  }, [myId]);

  // When the active group changes, load it; on leave/unmount, drop the channel.
  useEffect(() => {
    if (activeGroupId) void openGroup(activeGroupId);
    return () => {
      if (channelRef.current && supabase) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [activeGroupId, openGroup]);

  // Clear the draft on group switch.
  useEffect(() => { setInputText(''); }, [activeGroupId]);

  const toChat = (row: any, map: Record<string, MemberInfo>, meId: string | null): ChatMessage => ({
    id: row.id,
    sender: map[row.sender_id]?.username ?? 'Driver',
    avatar: map[row.sender_id]?.avatar ?? '',
    text: row.text,
    timestamp: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMe: row.sender_id === meId,
    senderRank: map[row.sender_id]?.rank ?? 'Rookie',
  });

  const getRankStyle = (rank: string) => {
    switch (rank.toLowerCase()) {
      case 'founder': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
      case 'veteran': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
      case 'moderator': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
      case 'rookie': return 'text-green-400 border-green-400/30 bg-green-400/10';
      default: return 'text-gray-400 border-gray-400/30 bg-gray-400/10';
    }
  };

  const handleCreateGroup = async () => {
    if (!supabase || !myId || !newGroupName.trim()) return;
    const isPrivate = newGroupPrivacy === 'private';
    const inviteCode = isPrivate ? Math.random().toString(36).substring(2, 8).toUpperCase() : null;
    const { data: g, error } = await supabase.from('groups').insert({
      name: newGroupName.trim(),
      description: isPrivate ? 'Private crew.' : 'New crew on the block.',
      image: `https://picsum.photos/200/200?random=${Date.now()}`,
      is_private: isPrivate,
      invite_code: inviteCode,
      created_by: myId,
    }).select().single();
    if (error || !g) return;
    await supabase.from('group_members').insert({ group_id: g.id, user_id: myId, rank: 'Founder' });
    setNewGroupName(''); setNewGroupPrivacy('public'); setIsCreating(false);
    await loadGroups();
    setActiveGroupId(g.id);
  };

  const handleJoinPublic = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!supabase || !myId) return;
    await supabase.from('group_members').insert({ group_id: id, user_id: myId, rank: 'Rookie' });
    await loadGroups();
    setActiveGroupId(id);
  };

  const handleJoinByCode = async () => {
    if (!supabase || !joinCode.trim()) return;
    const { data } = await supabase.rpc('join_group_by_code', { p_code: joinCode.trim() });
    if (data) { await loadGroups(); setActiveGroupId(data); setJoinCode(''); setIsJoiningPrivate(false); setJoinError(null); }
    else setJoinError('Invalid invite code.');
  };

  const handleSendMessage = async () => {
    if (!supabase || !myId || !activeGroupId || !inputText.trim()) return;
    const text = inputText.trim();
    // Optimistic: show your message immediately (realtime dedupes by id).
    const tempId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId, sender: user.username, avatar: user.avatar, text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true, senderRank: activeGroup?.userRank ?? 'Rookie',
    }]);
    setInputText('');
    const { data } = await supabase.from('messages').insert({ group_id: activeGroupId, sender_id: myId, text }).select().single();
    if (data) {
      // Replace the temp id with the real one so the realtime event dedupes correctly.
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m)));
    }
  };

  // --- Sign-in gate ---
  if (authChecked && !myId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 pb-24">
        <Users className="w-12 h-12 text-octane-accent mb-4" />
        <h2 className="text-xl font-display font-bold text-white mb-2">Sign in to join crews</h2>
        <p className="text-sm text-gray-400 max-w-xs">
          Groups + chat now sync across your devices. Create an account or sign in from the Profile tab to find your crew.
        </p>
      </div>
    );
  }

  // --- Chat View ---
  if (activeGroupId && activeGroup) {
    return (
      <div className="h-full flex flex-col bg-octane-black pb-20">
        <div className="p-4 border-b border-white/5 bg-octane-dark/50 backdrop-blur flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveGroupId(null)} className="p-2 -ml-2 text-gray-400 hover:text-white">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <img src={activeGroup.image} className="w-10 h-10 rounded-full border border-white/10" alt={activeGroup.name} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white leading-tight">{activeGroup.name}</h2>
                {activeGroup.isPrivate && <Lock className="w-3 h-3 text-gray-500" />}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {activeGroup.userRank && (
                  <span className={`text-[10px] font-bold uppercase border px-1.5 rounded flex items-center gap-1 ${getRankStyle(activeGroup.userRank)}`}>
                    <Shield className="w-2 h-2" /> {activeGroup.userRank}
                  </span>
                )}
                {activeGroup.isPrivate && activeGroup.userRank === 'Founder' && (
                  <span className="text-gray-500 font-mono">Code: {activeGroup.inviteCode}</span>
                )}
              </div>
            </div>
          </div>
          <button className="text-gray-400"><MoreVertical className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center text-xs text-gray-500 my-4 uppercase tracking-widest">Today</div>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!msg.isMe && <img src={msg.avatar || 'https://picsum.photos/40'} className="w-6 h-6 rounded-full mb-1" alt={msg.sender} />}
              <div className="flex flex-col gap-1 max-w-[80%]">
                {!msg.isMe && (
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-[10px] font-bold text-gray-400">{msg.sender}</p>
                    {msg.senderRank && (
                      <span className={`text-[9px] font-mono font-bold px-1 rounded border ${getRankStyle(msg.senderRank)}`}>{msg.senderRank}</span>
                    )}
                  </div>
                )}
                <div className={`p-3 rounded-2xl text-sm ${msg.isMe ? 'bg-octane-accent text-octane-black rounded-br-none font-medium' : 'bg-gray-800 text-gray-200 rounded-bl-none'}`}>
                  {msg.text}
                  <p className={`text-[9px] mt-1 text-right ${msg.isMe ? 'text-black/60' : 'text-gray-500'}`}>{msg.timestamp}</p>
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-white/5 bg-octane-dark pb-24">
          <div className="flex gap-2">
            <input type="text" value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={`Message ${activeGroup.name}...`}
              className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-3 text-white text-sm focus:outline-none focus:border-octane-accent"
            />
            <button onClick={handleSendMessage} className="w-12 h-12 rounded-full bg-octane-accent text-octane-black flex items-center justify-center font-bold hover:opacity-90 transition-opacity">
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Groups List View ---
  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-black text-white">Groups</h1>
          <p className="text-gray-400 text-sm">Find your crew.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setIsCreating(!isCreating); setIsJoiningPrivate(false); }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isCreating ? 'bg-white text-black' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}
            title="Create Group">
            <Plus className={`w-5 h-5 ${isCreating ? 'rotate-45' : ''} transition-transform`} />
          </button>
          <button onClick={() => { setIsJoiningPrivate(!isJoiningPrivate); setIsCreating(false); }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${isJoiningPrivate ? 'bg-octane-success/80 text-black border-octane-success' : 'bg-octane-success text-black border-octane-success hover:bg-octane-success/90 shadow-[0_0_15px_rgba(34,197,94,0.3)]'}`}
            title="Join via Code">
            {isJoiningPrivate ? <ChevronLeft className="w-5 h-5" /> : <Plus className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {isJoiningPrivate && (
        <div className="bg-octane-dark p-4 rounded-xl border border-octane-success animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2 mb-3 text-octane-success"><Key className="w-4 h-4" /><span className="text-xs font-bold uppercase">Join Private Crew</span></div>
          <div className="flex gap-2">
            <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ENTER CODE" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-octane-success" />
            <button onClick={handleJoinByCode} className="px-4 py-2 bg-octane-success text-black font-bold rounded-lg text-sm">Join</button>
          </div>
          {joinError && <p className="text-octane-danger text-xs mt-2">{joinError}</p>}
        </div>
      )}

      {isCreating && (
        <div className="bg-octane-dark p-4 rounded-xl border border-white/20 animate-in slide-in-from-top-4 duration-300 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">New Crew Name</label>
            <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Midnight Club" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-white/50" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Privacy</label>
            <div className="flex gap-2">
              <button onClick={() => setNewGroupPrivacy('public')} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border ${newGroupPrivacy === 'public' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10'}`}>
                <Globe className="w-3 h-3" /> Public
              </button>
              <button onClick={() => setNewGroupPrivacy('private')} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border ${newGroupPrivacy === 'private' ? 'bg-octane-success text-black border-octane-success' : 'bg-transparent text-gray-500 border-white/10'}`}>
                <Lock className="w-3 h-3" /> Private
              </button>
            </div>
          </div>
          <button onClick={handleCreateGroup} className="w-full py-3 bg-white/10 text-white font-bold rounded-lg text-sm hover:bg-white/20">
            Create {newGroupPrivacy === 'private' ? 'Private' : 'Public'} Crew
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type="text" placeholder="Search communities..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-octane-dark border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20" />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Your Crews</h3>
        {loading ? (
          <p className="text-center text-gray-500 text-sm">Loading…</p>
        ) : groups.filter(g => g.isJoined && matchesSearch(g)).map(group => (
          <div key={group.id} onClick={() => setActiveGroupId(group.id)} className="bg-octane-dark p-3 rounded-xl border border-octane-accent/30 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors">
            <img src={group.image} alt={group.name} className="w-12 h-12 rounded-lg object-cover" />
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-white">{group.name}</h4>
                  {group.isPrivate && <Lock className="w-3 h-3 text-gray-400" />}
                </div>
                {group.userRank && (
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border font-bold ${getRankStyle(group.userRank)}`}>{group.userRank}</span>
                )}
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-2 mt-0.5"><MessageSquare className="w-3 h-3" /> {group.members} member{group.members === 1 ? '' : 's'}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-octane-accent animate-pulse"></div>
          </div>
        ))}
        {!loading && groups.filter(g => g.isJoined && matchesSearch(g)).length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-white/10 rounded-xl">No crews yet — create or join one above.</div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Discover Public Crews</h3>
        <div className="grid gap-4">
          {groups.filter(g => !g.isJoined && !g.isPrivate && matchesSearch(g)).map(group => (
            <div key={group.id} className="bg-octane-dark rounded-xl overflow-hidden border border-white/5 group">
              <div className="h-24 relative">
                <img src={group.image} alt="cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1"><Users className="w-3 h-3" /> {group.members}</div>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-lg">{group.name}</h4>
                  <p className="text-xs text-gray-400 line-clamp-1">{group.description}</p>
                </div>
                <button onClick={(e) => handleJoinPublic(e, group.id)} className="px-4 py-2 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-octane-accent hover:text-black transition-colors">Join</button>
              </div>
            </div>
          ))}
          {groups.filter(g => !g.isJoined && !g.isPrivate && matchesSearch(g)).length === 0 && (
            <p className="text-gray-500 text-xs italic">No public groups available — create one!</p>
          )}
        </div>
      </div>
    </div>
  );
};