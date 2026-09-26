import React, { useState, useRef } from 'react';
import { LayoutDashboard, Map, Gauge, Flag, MessagesSquare, Mic } from 'lucide-react';
import { AppMode, UserProfile, Meetup } from './types';
import { Dashboard } from './components/Dashboard';
import { TrackMode } from './components/TrackMode';
import { CruiseMode } from './components/CruiseMode';
import { Profile } from './components/Profile';
import { Groups } from './components/Groups';
import { Meetups } from './components/Meetups';
import { Leaderboard } from './components/Leaderboard';
import { VoiceChat } from './components/VoiceChat';
import { usePersistentState } from './usePersistentState';
import { useAuth } from './hooks/useAuth';

// Left-to-right order of the bottom-nav tabs. Swiping left/right moves to the
// adjacent tab in this list (with wrap-around). PROFILE is excluded (full-screen
// edit view, no nav bar).
const NAV_ORDER: AppMode[] = [
  AppMode.DASHBOARD,
  AppMode.GROUPS,
  AppMode.CRUISE,
  AppMode.LEADERBOARD,
  AppMode.TRACK,
  AppMode.VOICE,
];

// Default guest profile. The handle is randomized per-browser so two people
// signing up fresh don't both grab the same default handle and hit the
// profiles.username UNIQUE collision (which surfaces as "Database error
// saving new user"). They can change it on the Profile screen before signing up.
const DEFAULT_USER: UserProfile = {
  username: 'Driver-' + Math.random().toString(36).slice(2, 7),
  car: 'Subaru WRX STI',
  avatar: `https://picsum.photos/200?random=${Math.floor(Math.random() * 100000)}`,
  isSignedIn: false
};

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  // Cloud auth: when signed in, the profile comes from Supabase. When signed
  // out (or before Supabase is configured), we fall back to a local guest
  // profile persisted via secure storage so the app still works offline.
  const auth = useAuth();
  const [localUser, setLocalUser] = usePersistentState<UserProfile>('octane:user', DEFAULT_USER);
  const user: UserProfile = auth.profile
    ? { ...localUser, ...auth.profile, isSignedIn: true }
    : { ...localUser, isSignedIn: false };
  // Live "current events" — persisted so hosted events survive relaunch.
  const [currentEvents, setCurrentEvents] = usePersistentState<Meetup[]>('octane:currentEvents', []);
  // Archived events (ended by the host) — persisted, kept separate from the
  // live board. Delete removes permanently; End moves an event here instead.
  const [pastEvents, setPastEvents] = usePersistentState<Meetup[]>('octane:pastEvents', []);

  const handleSaveProfile = (updatedProfile: UserProfile) => {
    if (auth.profile) {
      // Signed in → push the editable cloud fields to the profiles table.
      void auth.updateProfile({
        username: updatedProfile.username,
        car: updatedProfile.car,
        avatar: updatedProfile.avatar,
      });
    }
    // Keep local prefs (incl. vehicleClass) in sync either way.
    setLocalUser(updatedProfile);
    setMode(AppMode.DASHBOARD);
  };

  const handleHostEvent = (event: Meetup) => {
    // The host creates the event; mark ownership so only they see management controls.
    setCurrentEvents((prev) => [{ ...event, isHost: true, isJoined: true }, ...prev]);
  };

  // Toggle RSVP on an event: flip isJoined and adjust the attendee count.
  const handleToggleJoin = (eventId: string) => {
    setCurrentEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, isJoined: !e.isJoined, attendees: Math.max(1, e.attendees + (e.isJoined ? -1 : 1)) }
          : e
      )
    );
  };

  // Update an existing event (edit title/location/type).
  const handleUpdateEvent = (updated: Meetup) => {
    setCurrentEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  // End: move an active hosted event to the archive (Past). NOT a delete.
  const handleEndEvent = (eventId: string) => {
    const ended = currentEvents.find((e) => e.id === eventId);
    if (!ended) return;
    setPastEvents((prev) => [{ ...ended, endedAt: new Date().toLocaleString() }, ...prev]);
    setCurrentEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  // Restore: move an archived event back to the live board.
  const handleRestoreEvent = (eventId: string) => {
    const ev = pastEvents.find((e) => e.id === eventId);
    if (!ev) return;
    const { endedAt: _endedAt, ...rest } = ev;
    void _endedAt;
    setCurrentEvents((prev) => [{ ...rest }, ...prev]);
    setPastEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  // Remove an event entirely (permanent Delete of an active event).
  const handleRemoveEvent = (eventId: string) => {
    setCurrentEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  // Permanently delete an archived event.
  const handleDeletePast = (eventId: string) => {
    setPastEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  // --- Swipe left/right to move between nav tabs ---
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Only horizontal swipes: enough distance and clearly more horizontal than
    // vertical, so ordinary vertical scrolling never triggers tab navigation.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const idx = NAV_ORDER.indexOf(mode);
    if (idx === -1) return; // PROFILE (not in NAV_ORDER) — no swipe nav.
    const next = (idx + (dx < 0 ? 1 : -1) + NAV_ORDER.length) % NAV_ORDER.length;
    setMode(NAV_ORDER[next]);
  };

  return (
    <div className="bg-octane-black min-h-screen font-sans text-slate-50 overflow-hidden flex flex-col">

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative pt-safe" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {mode === AppMode.DASHBOARD && <Dashboard user={user} onProfileClick={() => setMode(AppMode.PROFILE)} currentEvents={currentEvents} onToggleJoin={handleToggleJoin} onHostEvent={handleHostEvent} hostedEvents={currentEvents.filter((e) => e.isHost)} onUpdateEvent={handleUpdateEvent} onRemoveEvent={handleRemoveEvent} pastEvents={pastEvents} onEndEvent={handleEndEvent} onRestoreEvent={handleRestoreEvent} onDeletePast={handleDeletePast} />}
        {mode === AppMode.TRACK && <TrackMode />}
        {mode === AppMode.MEETUPS && <Meetups currentEvents={currentEvents} onHostEvent={handleHostEvent} />}
        {mode === AppMode.LEADERBOARD && <Leaderboard user={user} />}
        {mode === AppMode.CRUISE && <CruiseMode />}
        {mode === AppMode.GROUPS && <Groups user={user} />}
        {mode === AppMode.VOICE && <VoiceChat user={user} />}
        {mode === AppMode.PROFILE && <Profile user={user} onSave={handleSaveProfile} onCancel={() => setMode(AppMode.DASHBOARD)} auth={auth} />}
      </main>

      {/* Persistent Navigation */}
      {mode !== AppMode.PROFILE && (
        <nav className="fixed bottom-0 left-0 right-0 bg-octane-dark/90 backdrop-blur-lg border-t border-white/5 pb-safe z-50">
          <div className="flex justify-around items-center p-2">
            <NavButton 
              active={mode === AppMode.DASHBOARD} 
              onClick={() => setMode(AppMode.DASHBOARD)} 
              icon={LayoutDashboard} 
              label="Home" 
            />
            <NavButton 
              active={mode === AppMode.GROUPS} 
              onClick={() => setMode(AppMode.GROUPS)} 
              icon={MessagesSquare} 
              label="Groups" 
            />
            
            {/* Main Action Button */}
            <div className="relative -top-6">
              <button 
                  onClick={() => setMode(AppMode.CRUISE)}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg border-4 transition-all duration-300 ${mode === AppMode.CRUISE ? 'bg-octane-accent border-white text-black scale-110' : 'bg-gradient-to-br from-octane-accent to-blue-600 border-octane-black text-white'}`}
              >
                  <Map className="w-8 h-8" />
              </button>
            </div>

            <NavButton 
              active={mode === AppMode.LEADERBOARD} 
              onClick={() => setMode(AppMode.LEADERBOARD)} 
              icon={Flag} 
              label="Rank" 
            />
            <NavButton
              active={mode === AppMode.TRACK}
              onClick={() => setMode(AppMode.TRACK)}
              icon={Gauge}
              label="Track"
              danger
            />
            <NavButton
              active={mode === AppMode.VOICE}
              onClick={() => setMode(AppMode.VOICE)}
              icon={Mic}
              label="Voice"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

interface NavButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ElementType;
    label: string;
    danger?: boolean;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon: Icon, label, danger }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${active ? 'bg-white/5' : 'hover:bg-white/5'}`}
    >
        <Icon className={`w-6 h-6 mb-1 ${active ? (danger ? 'text-octane-danger' : 'text-octane-accent') : 'text-gray-500'}`} />
        <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
    </button>
);