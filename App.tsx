import React, { useEffect, useState } from 'react';
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

  // iOS home-screen web app: WebKit under-fills the layout viewport by the
  // phantom bottom-toolbar height (bug 254868 family — innerHeight/100dvh
  // are short in standalone on iOS 26), which floats the tab bar above the
  // physical bottom edge. Measure the lie and push the bar down onto the
  // real screen bottom; see index.css "standalone viewport-gap fix".
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (!standalone) return;
    const apply = () => {
      const gap = Math.round((screen as Screen).height - window.innerHeight);
      if (gap > 8) {
        document.documentElement.style.setProperty('--viewport-gap', `${gap}px`);
        document.documentElement.classList.add('standalone-fix');
      } else {
        document.documentElement.classList.remove('standalone-fix');
      }
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('focus', apply);
    document.addEventListener('visibilitychange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('focus', apply);
      document.removeEventListener('visibilitychange', apply);
      document.documentElement.classList.remove('standalone-fix');
    };
  }, []);
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


  return (
    /* Scroll fix: .app-shell gives a definite 100dvh height (was
       min-h-screen → indefinite flex height, which made <main>'s
       overflow-y-auto ambiguous and let the WKWebView's native
       document scroll layer take over — the iOS rubber-band
       snap-back-to-top. See index.css "iOS WKWebView scroll fix". */
    <div className="app-shell bg-octane-black font-sans text-slate-50 overflow-hidden flex flex-col">

      {/* Main Content Area */}
      <main className="app-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain relative pt-safe">
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
        <nav className="tab-bar fixed bottom-0 left-0 right-0 bg-octane-dark/90 backdrop-blur-lg border-t border-white/5 pb-safe z-50">
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