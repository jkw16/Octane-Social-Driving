
import React, { useState, useEffect, useRef } from 'react';
import { Users, Search, Plus, Send, ChevronLeft, MessageSquare, MoreVertical, Shield, Lock, Globe, Key, UserPlus } from 'lucide-react';
import { Group, ChatMessage, UserProfile } from '../types';
import { MOCK_GROUPS, MOCK_CHAT_MESSAGES } from '../constants';

interface GroupsProps {
  user: UserProfile;
}

export const Groups: React.FC<GroupsProps> = ({ user }) => {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>(MOCK_GROUPS);
  
  // UI States
  const [isCreating, setIsCreating] = useState(false);
  const [isJoiningPrivate, setIsJoiningPrivate] = useState(false);
  
  // Create Group State
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrivacy, setNewGroupPrivacy] = useState<'public' | 'private'>('public');

  // Join Group State
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_CHAT_MESSAGES);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeGroup = groups.find(g => g.id === activeGroupId);

  useEffect(() => {
    if (activeGroupId) {
      scrollToBottom();
    }
  }, [messages, activeGroupId]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getRankStyle = (rank: string) => {
    switch(rank.toLowerCase()) {
        case 'founder': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
        case 'veteran': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
        case 'moderator': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
        case 'rookie': return 'text-green-400 border-green-400/30 bg-green-400/10';
        default: return 'text-gray-400 border-gray-400/30 bg-gray-400/10';
    }
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const isPrivate = newGroupPrivacy === 'private';
    const newGroup: Group = {
      id: `g${Date.now()}`,
      name: newGroupName,
      members: 1,
      image: `https://picsum.photos/200/200?random=${Date.now()}`,
      description: isPrivate ? 'Private Group.' : 'New crew on the block.',
      isJoined: true,
      userRank: 'Founder',
      isPrivate: isPrivate,
      inviteCode: isPrivate ? Math.random().toString(36).substring(7).toUpperCase() : undefined
    };
    setGroups([newGroup, ...groups]);
    setNewGroupName('');
    setNewGroupPrivacy('public');
    setIsCreating(false);
    setActiveGroupId(newGroup.id);
  };

  const handleJoinPrivateGroup = () => {
    const code = joinCode.trim();
    if (!code) return;
    
    // Find group with matching code (mock logic, in real app would be API call)
    // For demo, checking against MOCK_GROUPS or just simulating a success if code is valid length
    const foundGroup = groups.find(g => g.isPrivate && g.inviteCode === code);
    
    if (foundGroup) {
        if (foundGroup.isJoined) {
            setJoinError("You are already in this group.");
        } else {
            setGroups(prev => prev.map(g => g.id === foundGroup.id ? { ...g, isJoined: true, userRank: 'Rookie' } : g));
            setActiveGroupId(foundGroup.id);
            setJoinCode('');
            setIsJoiningPrivate(false);
            setJoinError(null);
        }
    } else {
        // Fallback for demo: allow joining a "Hidden" group if code is "VIP" (if not already in list) or just show error
        setJoinError("Invalid invite code.");
    }
  };

  const handleJoinPublic = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setGroups(prev => prev.map(g => g.id === id ? { ...g, isJoined: true, userRank: 'Rookie' } : g));
    setActiveGroupId(id);
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: user.username,
      avatar: user.avatar,
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
      senderRank: activeGroup?.userRank || 'Rookie'
    };
    setMessages([...messages, newMessage]);
    setInputText('');

    // Simulate response
    setTimeout(() => {
        const reply: ChatMessage = {
            id: (Date.now()+1).toString(),
            sender: 'DriftKing',
            avatar: 'https://picsum.photos/32/32?random=1',
            text: 'Nice ride!',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isMe: false,
            senderRank: 'Legend'
        };
        setMessages(prev => [...prev, reply]);
    }, 2000);
  };

  // --- Render Views ---

  // 1. Chat View
  if (activeGroupId && activeGroup) {
    return (
      <div className="h-full flex flex-col bg-octane-black pb-20">
        {/* Chat Header */}
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
          <button className="text-gray-400">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center text-xs text-gray-500 my-4 uppercase tracking-widest">Today</div>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!msg.isMe && <img src={msg.avatar} className="w-6 h-6 rounded-full mb-1" alt={msg.sender} />}
              <div className="flex flex-col gap-1 max-w-[80%]">
                  {!msg.isMe && (
                      <div className="flex items-center gap-2 px-1">
                          <p className="text-[10px] font-bold text-gray-400">{msg.sender}</p>
                          {msg.senderRank && (
                              <span className={`text-[9px] font-mono font-bold px-1 rounded border ${getRankStyle(msg.senderRank)}`}>
                                  {msg.senderRank}
                              </span>
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

        {/* Input Area */}
        <div className="p-4 border-t border-white/5 bg-octane-dark pb-24">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={`Message ${activeGroup.name}...`}
              className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-3 text-white text-sm focus:outline-none focus:border-octane-accent"
            />
            <button 
              onClick={handleSendMessage}
              className="w-12 h-12 rounded-full bg-octane-accent text-octane-black flex items-center justify-center font-bold hover:opacity-90 transition-opacity"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Groups List View
  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="flex justify-between items-center">
        <div>
           <h1 className="text-3xl font-display font-black text-white">Groups</h1>
           <p className="text-gray-400 text-sm">Find your crew.</p>
        </div>
        <div className="flex gap-2">
            {/* Create Group Button */}
            <button 
                onClick={() => { setIsCreating(!isCreating); setIsJoiningPrivate(false); }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isCreating ? 'bg-white text-black' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}
                title="Create Group"
            >
                <Plus className={`w-5 h-5 ${isCreating ? 'rotate-45' : ''} transition-transform`} />
            </button>

            {/* Join Private Group Button (Green Plus) */}
            <button 
                onClick={() => { setIsJoiningPrivate(!isJoiningPrivate); setIsCreating(false); }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${isJoiningPrivate ? 'bg-octane-success/80 text-black border-octane-success' : 'bg-octane-success text-black border-octane-success hover:bg-octane-success/90 shadow-[0_0_15px_rgba(34,197,94,0.3)]'}`}
                title="Join via Code"
            >
                {isJoiningPrivate ? <ChevronLeft className="w-5 h-5" /> : <Plus className="w-6 h-6" />}
            </button>
        </div>
      </header>

      {/* Join Private Group Form */}
      {isJoiningPrivate && (
          <div className="bg-octane-dark p-4 rounded-xl border border-octane-success animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2 mb-3 text-octane-success">
                  <Key className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">Join Private Crew</span>
              </div>
              <div className="flex gap-2">
                  <input 
                      type="text" 
                      value={joinCode} 
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ENTER CODE (e.g. VIP)"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-octane-success"
                  />
                  <button 
                      onClick={handleJoinPrivateGroup}
                      className="px-4 py-2 bg-octane-success text-black font-bold rounded-lg text-sm"
                  >
                      Join
                  </button>
              </div>
              {joinError && <p className="text-octane-danger text-xs mt-2">{joinError}</p>}
          </div>
      )}

      {/* Create Group Form */}
      {isCreating && (
          <div className="bg-octane-dark p-4 rounded-xl border border-white/20 animate-in slide-in-from-top-4 duration-300 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">New Crew Name</label>
                <input 
                    type="text" 
                    value={newGroupName} 
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Midnight Club"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-white/50"
                />
              </div>
              
              <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Privacy</label>
                  <div className="flex gap-2">
                      <button 
                          onClick={() => setNewGroupPrivacy('public')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border ${newGroupPrivacy === 'public' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10'}`}
                      >
                          <Globe className="w-3 h-3" /> Public
                      </button>
                      <button 
                          onClick={() => setNewGroupPrivacy('private')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border ${newGroupPrivacy === 'private' ? 'bg-octane-success text-black border-octane-success' : 'bg-transparent text-gray-500 border-white/10'}`}
                      >
                          <Lock className="w-3 h-3" /> Private
                      </button>
                  </div>
              </div>

              <button 
                  onClick={handleCreateGroup}
                  className="w-full py-3 bg-white/10 text-white font-bold rounded-lg text-sm hover:bg-white/20"
              >
                  Create {newGroupPrivacy === 'private' ? 'Private' : 'Public'} Crew
              </button>
          </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input 
            type="text" 
            placeholder="Search communities..." 
            className="w-full bg-octane-dark border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20"
        />
      </div>

      {/* My Groups Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Your Crews</h3>
        {groups.filter(g => g.isJoined).map(group => (
            <div 
                key={group.id} 
                onClick={() => setActiveGroupId(group.id)}
                className="bg-octane-dark p-3 rounded-xl border border-octane-accent/30 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
            >
                <img src={group.image} alt={group.name} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-white">{group.name}</h4>
                            {group.isPrivate && <Lock className="w-3 h-3 text-gray-400" />}
                        </div>
                        {group.userRank && (
                            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border font-bold ${getRankStyle(group.userRank)}`}>
                                {group.userRank}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MessageSquare className="w-3 h-3" /> Active Now
                    </p>
                </div>
                <div className="w-2 h-2 rounded-full bg-octane-accent animate-pulse"></div>
            </div>
        ))}
        {groups.filter(g => g.isJoined).length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-white/10 rounded-xl">
                No active crews. Join one above!
            </div>
        )}
      </div>

      {/* Discover Section (Only showing Public groups) */}
      <div className="space-y-4">
         <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Discover Public Crews</h3>
         <div className="grid gap-4">
            {groups.filter(g => !g.isJoined && !g.isPrivate).map(group => (
                <div key={group.id} className="bg-octane-dark rounded-xl overflow-hidden border border-white/5 group">
                    <div className="h-24 relative">
                        <img src={group.image} alt="cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1">
                            <Users className="w-3 h-3" /> {group.members}
                        </div>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                        <div>
                            <h4 className="font-bold text-white text-lg">{group.name}</h4>
                            <p className="text-xs text-gray-400 line-clamp-1">{group.description}</p>
                        </div>
                        <button 
                            onClick={(e) => handleJoinPublic(e, group.id)}
                            className="px-4 py-2 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-octane-accent hover:text-black transition-colors"
                        >
                            Join
                        </button>
                    </div>
                </div>
            ))}
            {groups.filter(g => !g.isJoined && !g.isPrivate).length === 0 && (
                <p className="text-gray-500 text-xs italic">No public groups available.</p>
            )}
         </div>
      </div>
    </div>
  );
};
