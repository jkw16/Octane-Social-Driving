import React, { useState, useEffect } from 'react';
import { Trophy, Shield, Activity, Flame, Calendar, Check, Users, Plus, Flag, Archive } from 'lucide-react';
import { USER_STATS } from '../constants';
import { UserProfile, Meetup, UserStats } from '../types';
import { HostEventModal } from './HostEventModal';
import { EventManagerModal } from './EventManagerModal';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { InstallHint } from './InstallHint';

interface DashboardProps {
  user: UserProfile;
  onProfileClick: () => void;
  currentEvents: Meetup[];
  onToggleJoin: (eventId: string) => void;
  onHostEvent: (event: Meetup) => void;
  hostedEvents: Meetup[];
  onUpdateEvent: (event: Meetup) => void;
  onRemoveEvent: (eventId: string) => void;
  pastEvents: Meetup[];
  onEndEvent: (eventId: string) => void;
  onRestoreEvent: (eventId: string) => void;
  onDeletePast: (eventId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onProfileClick, currentEvents, onToggleJoin, onHostEvent, hostedEvents, onUpdateEvent, onRemoveEvent, pastEvents, onEndEvent, onRestoreEvent, onDeletePast }) => {
  const [isHosting, setIsHosting] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [manageTab, setManageTab] = useState<'active' | 'past'>('active');
  const featured = currentEvents[0];

  // Live stats from the cloud when signed in; fall back to all-zero defaults
  // for guests (no fabricated numbers — see constants.ts USER_STATS).
  const [stats, setStats] = useState<UserStats>(USER_STATS);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user.isSignedIn) { setStats(USER_STATS); return; }
    let active = true;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase
        .from('user_stats')
        .select('weekly_mileage, safety_score, top_speed, track_days')
        .eq('user_id', authUser.id)
        .single();
      if (active && data) {
        setStats({
          weeklyMileage: Math.round(Number(data.weekly_mileage ?? 0)),
          safetyScore: Number(data.safety_score ?? 0),
          topSpeed: Number(data.top_speed ?? 0),
          trackDays: Number(data.track_days ?? 0),
        });
      }
    })();
    return () => { active = false; };
  }, [user.isSignedIn]);

  return (
    /* Scroll fix: pb-24 (96px) was just short of the fixed bottom tab
       bar's height (~66px bar + env(safe-area-inset-bottom) home
       indicator) on Apple devices, so the last row of content could rest
       behind the tab bar. Clear it dynamically instead. */
    <div className="p-4 space-y-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <header className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-3xl font-display font-black text-white">
            OCTANE
          </h1>
          <p className="text-gray-400 text-sm">
            {user.isSignedIn ? `Welcome back, ${user.username}.` : 'Welcome, Guest Driver.'}
          </p>
        </div>
        <button 
          onClick={onProfileClick}
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-octane-accent to-blue-600 p-[2px] transition-transform active:scale-95 shadow-lg shadow-octane-accent/20"
        >
            <img src={user.avatar} className="rounded-full w-full h-full object-cover border-2 border-octane-black bg-octane-dark" alt="Profile" />
        </button>
      </header>

      {/* PWA install nudge (Add to Home Screen) */}
      <InstallHint />

      {/* Main Stats Card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-octane-dark rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Flame className="w-12 h-12 text-octane-danger" />
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Weekly Distance</p>
            <h3 className="text-3xl font-display font-bold text-white">{stats.weeklyMileage}<span className="text-sm font-sans text-gray-500 ml-1">mi</span></h3>
            <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Start a cruise to log miles
            </div>
        </div>

        <div className="bg-octane-dark rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Shield className="w-12 h-12 text-octane-success" />
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Safety Score</p>
            <h3 className="text-3xl font-display font-bold text-white">{stats.safetyScore || '—'}</h3>
            <div className="mt-2 w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                <div className="bg-octane-success h-full" style={{ width: `${stats.safetyScore}%` }}></div>
            </div>
        </div>
      </div>

      {/* Current Events */}
      <div className="bg-gradient-to-r from-indigo-900 to-octane-dark rounded-2xl p-5 border border-indigo-500/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
          <div className="relative z-10">
              <div className="flex justify-between items-start mb-3">
                  <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Current Events
                  </span>
                  <span className="text-indigo-200 text-xs font-mono">{currentEvents.length} live</span>
              </div>

              {currentEvents.length === 0 ? (
                  <div className="mb-4">
                      <h3 className="text-lg font-bold text-white mb-1">No current events</h3>
                      <p className="text-indigo-200 text-sm">Create one and it'll show up here live.</p>
                  </div>
              ) : (
                  <div className="mb-4">
                      <div className="flex items-start justify-between gap-3 mb-1">
                          <h3 className="text-xl font-bold text-white leading-tight">{featured.title}</h3>
                          <span className="flex items-center gap-1 text-indigo-200 text-xs font-mono whitespace-nowrap">
                              <Users className="w-3 h-3" /> {featured.attendees}
                          </span>
                      </div>
                      <p className="text-indigo-200 text-sm">
                          {currentEvents.length === 1
                              ? '1 event happening now.'
                              : `${currentEvents.length} events happening now — tap Car Meets to view them.`}
                      </p>
                  </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                  <button
                      onClick={() => setIsHosting(true)}
                      className="py-2.5 bg-white text-indigo-900 font-bold text-sm rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                  >
                      <Plus className="w-4 h-4" /> Create
                  </button>
                  <button
                      onClick={() => featured && onToggleJoin(featured.id)}
                      disabled={!featured}
                      className={`py-2.5 font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                          featured?.isJoined
                              ? 'bg-octane-success/20 text-octane-success border border-octane-success/50 hover:bg-octane-success/30'
                              : 'bg-octane-accent text-black hover:bg-octane-accent/90'
                      }`}
                  >
                      {featured?.isJoined ? (
                          <><Check className="w-4 h-4" /> Leave</>
                      ) : (
                          'Join Event'
                      )}
                  </button>
              </div>
          </div>
      </div>

      <HostEventModal open={isHosting} onClose={() => setIsHosting(false)} onSubmit={onHostEvent} />

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">Leaderboards</h3>
        <div className="space-y-3">
            {[
                { label: 'Track Records', icon: Trophy, color: 'text-yellow-500', val: 'Not ranked yet', hint: 'Check back after your next track day' },
                { label: 'Safety Streak', icon: Shield, color: 'text-octane-success', val: 'Not ranked yet', hint: 'Drive safely to claim a spot' },
            ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-octane-dark border border-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${item.color}`} />
                        <div>
                            <span className="font-medium text-white">{item.label}</span>
                            <div className="text-xs text-gray-500">{item.hint}</div>
                        </div>
                    </div>
                    <span className="text-sm font-mono text-gray-400">{item.val}</span>
                </div>
            ))}

            {/* Host-only: manage events the current user created (under Safety Streak) */}
            {hostedEvents.length > 0 && (
                <button
                    onClick={() => { setManageTab('active'); setIsManaging(true); }}
                    className="w-full flex items-center justify-between p-4 bg-octane-dark border border-octane-accent/30 rounded-xl hover:bg-white/5 transition-colors text-left"
                >
                    <div className="flex items-center gap-3">
                        <Flag className="w-5 h-5 text-octane-accent" />
                        <div>
                            <div className="font-medium text-white">Manage My Event</div>
                            <div className="text-xs text-gray-500">
                                {hostedEvents.length === 1 ? 'Edit, end, or delete your event' : `${hostedEvents.length} events hosted`}
                            </div>
                        </div>
                    </div>
                    <span className="text-xs font-bold text-octane-accent">Open</span>
                </button>
            )}

            {/* Archive of ended events — reachable even after all events are ended. */}
            {pastEvents.length > 0 && (
                <button
                    onClick={() => { setManageTab('past'); setIsManaging(true); }}
                    className="w-full flex items-center justify-between p-4 bg-octane-dark border border-white/10 rounded-xl hover:bg-white/5 transition-colors text-left"
                >
                    <div className="flex items-center gap-3">
                        <Archive className="w-5 h-5 text-gray-400" />
                        <div>
                            <div className="font-medium text-white">Past Events</div>
                            <div className="text-xs text-gray-500">
                                {pastEvents.length === 1 ? '1 ended event archived' : `${pastEvents.length} ended events archived`}
                            </div>
                        </div>
                    </div>
                    <span className="text-xs font-bold text-gray-400">View</span>
                </button>
            )}
        </div>
      </div>

      <EventManagerModal
        open={isManaging}
        onClose={() => setIsManaging(false)}
        hostedEvents={hostedEvents}
        pastEvents={pastEvents}
        onUpdate={onUpdateEvent}
        onEnd={onEndEvent}
        onDelete={onRemoveEvent}
        onRestore={onRestoreEvent}
        onDeletePast={onDeletePast}
        initialTab={manageTab}
      />
    </div>
  );
};
