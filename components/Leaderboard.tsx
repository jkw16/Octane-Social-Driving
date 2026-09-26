import React, { useEffect, useState } from 'react';
import { Flag, Route, Shield, RefreshCw, Trophy } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { UserProfile, LeaderboardEntry } from '../types';

// Monday of today (UTC) — matches Postgres date_trunc('week').
const currentWeekMonday = (): string => {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
};

type Mode = 'Track' | 'Endurance' | 'Safety';

const BOARDS: { mode: Mode; label: string; unit: string; icon: React.ElementType; color: string }[] = [
  { mode: 'Track', label: 'Track Speed', unit: 'mph', icon: Flag, color: 'text-octane-danger' },
  { mode: 'Endurance', label: 'Endurance', unit: 'mi', icon: Route, color: 'text-octane-accent' },
  { mode: 'Safety', label: 'Safety Score', unit: 'pts', icon: Shield, color: 'text-octane-success' },
];

const formatScore = (mode: Mode, score: number): string => {
  if (mode === 'Track') return `${Math.round(score)}`;
  if (mode === 'Endurance') return score < 10 ? score.toFixed(1) : `${Math.round(score)}`;
  return `${Math.round(score)}`; // Safety 0–1000
};

interface LeaderboardProps {
  user: UserProfile;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ user }) => {
  const [active, setActive] = useState<Mode>('Track');
  const [entries, setEntries] = useState<Record<Mode, LeaderboardEntry[]>>({ Track: [], Endurance: [], Safety: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true); setError(null);
    const { data, error: err } = await supabase
      .from('leaderboard_entries')
      .select('rank, score, mode, profiles(username, avatar, car)')
      .eq('week_start', currentWeekMonday())
      .order('mode')
      .order('rank', { ascending: true });

    if (err) { setError(err.message); setLoading(false); return; }

    const grouped: Record<Mode, LeaderboardEntry[]> = { Track: [], Endurance: [], Safety: [] };
    (data ?? []).forEach((row: any) => {
      const mode = row.mode as Mode;
      if (!grouped[mode]) return;
      grouped[mode].push({
        rank: row.rank,
        mode,
        score: Number(row.score),
        username: row.profiles?.username ?? 'Driver',
        avatar: row.profiles?.avatar ?? '',
        car: row.profiles?.car ?? '',
      });
    });
    setEntries(grouped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="p-4 space-y-6 pb-24">
        <h2 className="text-2xl font-display font-bold text-white">Weekly Rankings</h2>
        <div className="bg-octane-dark rounded-xl border border-white/5 p-6 text-center">
          <p className="text-gray-500 text-sm">
            Leaderboard isn’t configured yet. Add <code className="text-gray-400">SUPABASE_URL</code> and{' '}
            <code className="text-gray-400">SUPABASE_ANON_KEY</code> to <code className="text-gray-400">.env.local</code>, run the migration,
            and deploy the <code className="text-gray-400">submit-drive</code> function.
          </p>
        </div>
      </div>
    );
  }

  const board = BOARDS.find((b) => b.mode === active)!;
  const list = entries[active];
  const ActiveIcon = board.icon;

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-white">Weekly Rankings</h2>
        <button onClick={load} className="text-gray-500 hover:text-white" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Board tabs */}
      <div className="grid grid-cols-3 gap-2">
        {BOARDS.map((b) => {
          const Icon = b.icon;
          const selected = b.mode === active;
          return (
            <button
              key={b.mode}
              onClick={() => setActive(b.mode)}
              className={`py-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-colors ${
                selected ? 'bg-white/5 border-white/20 text-white' : 'bg-octane-dark border-white/5 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${selected ? b.color : ''}`} />
              {b.label}
            </button>
          );
        })}
      </div>

      {/* Active board */}
      <div>
        <h3 className={`font-bold uppercase text-sm mb-3 tracking-wider flex items-center gap-2 ${board.color}`}>
          <ActiveIcon className="w-4 h-4" /> {board.label}
        </h3>

        {error && (
          <div className="bg-octane-dark rounded-xl border border-white/5 p-6 text-center">
            <p className="text-red-400 text-sm">Couldn’t load rankings: {error}</p>
          </div>
        )}

        {!error && !loading && list.length === 0 && (
          <div className="bg-octane-dark rounded-xl border border-white/5 p-6 text-center">
            <p className="text-gray-500 text-sm">
              No {board.label.toLowerCase()} rankings posted yet this week. Record a session on the Track page to claim a spot.
            </p>
          </div>
        )}

        {!error && list.length > 0 && (
          <div className="space-y-2">
            {list.map((e) => {
              const mine = user.isSignedIn && e.username === user.username;
              const podium = e.rank <= 3;
              return (
                <div
                  key={`${e.mode}-${e.rank}`}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    mine ? 'bg-octane-accent/10 border-octane-accent/40' : 'bg-octane-dark border-white/5'
                  }`}
                >
                  <div className={`w-8 text-center font-display font-black ${podium ? 'text-octane-accent' : 'text-gray-500'}`}>
                    {e.rank === 1 ? <Trophy className="w-5 h-5 mx-auto text-yellow-400" /> : e.rank}
                  </div>
                  <img
                    src={e.avatar || 'https://picsum.photos/100'}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover bg-octane-black border border-white/10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-bold text-sm truncate flex items-center gap-1.5">
                      {e.username}
                      {mine && <span className="text-[9px] uppercase font-mono text-octane-accent">You</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{e.car || '—'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-mono font-bold text-white tabular-nums">{formatScore(active, e.score)}</span>
                    <span className="text-[10px] text-gray-500 ml-1 uppercase">{board.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};