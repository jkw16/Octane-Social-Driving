import React, { useState } from 'react';
import { LayoutDashboard, Map, Gauge, Users, Flag, MessagesSquare } from 'lucide-react';
import { AppMode, UserProfile } from './types';
import { Dashboard } from './components/Dashboard';
import { TrackMode } from './components/TrackMode';
import { CruiseMode } from './components/CruiseMode';
import { Profile } from './components/Profile';
import { Groups } from './components/Groups';
import { Meetups } from './components/Meetups';
import { MOCK_LEADERBOARD_SPEED, MOCK_LEADERBOARD_SAFETY } from './constants';

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [user, setUser] = useState<UserProfile>({
    username: 'StreetDriver',
    car: 'Subaru WRX STI',
    avatar: 'https://picsum.photos/200',
    isSignedIn: false
  });

  const handleSaveProfile = (updatedProfile: UserProfile) => {
    setUser(updatedProfile);
    setMode(AppMode.DASHBOARD);
  };

  const LeaderboardView = () => (
      <div className="p-4 space-y-6 pb-24">
        <h2 className="text-2xl font-display font-bold text-white">Weekly Rankings</h2>
        
        <div>
            <h3 className="text-octane-danger font-bold uppercase text-sm mb-3 tracking-wider flex items-center gap-2">
                <Flag className="w-4 h-4" /> Track Speed (Closed Circuit)
            </h3>
            <div className="space-y-2">
                {MOCK_LEADERBOARD_SPEED.map((entry, i) => (
                    <div key={i} className="flex items-center p-3 bg-octane-dark rounded-lg border border-white/5">
                        <div className={`w-8 font-display font-bold text-lg ${i===0 ? 'text-yellow-400' : 'text-gray-500'}`}>#{entry.rank}</div>
                        <img src={entry.avatar} className="w-8 h-8 rounded-full mr-3" alt="avatar" />
                        <div className="flex-1">
                            <div className="text-white font-medium">{entry.username}</div>
                            <div className="text-xs text-gray-500">{entry.car}</div>
                        </div>
                        <div className="font-mono font-bold text-octane-accent">{entry.score} <span className="text-[10px] text-gray-500">MPH</span></div>
                    </div>
                ))}
            </div>
        </div>

        <div>
            <h3 className="text-octane-success font-bold uppercase text-sm mb-3 tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4" /> Safety Score (Public)
            </h3>
            <div className="space-y-2">
                {MOCK_LEADERBOARD_SAFETY.map((entry, i) => (
                    <div key={i} className="flex items-center p-3 bg-octane-dark rounded-lg border border-white/5">
                        <div className={`w-8 font-display font-bold text-lg ${i===0 ? 'text-yellow-400' : 'text-gray-500'}`}>#{entry.rank}</div>
                        <img src={entry.avatar} className="w-8 h-8 rounded-full mr-3" alt="avatar" />
                        <div className="flex-1">
                            <div className="text-white font-medium">{entry.username}</div>
                            <div className="text-xs text-gray-500">{entry.car}</div>
                        </div>
                        <div className="font-mono font-bold text-octane-success">{entry.score} <span className="text-[10px] text-gray-500">PTS</span></div>
                    </div>
                ))}
            </div>
        </div>
      </div>
  );

  return (
    <div className="bg-octane-black min-h-screen font-sans text-slate-50 overflow-hidden flex flex-col">
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        {mode === AppMode.DASHBOARD && <Dashboard user={user} onProfileClick={() => setMode(AppMode.PROFILE)} />}
        {mode === AppMode.TRACK && <TrackMode />}
        {mode === AppMode.MEETUPS && <Meetups />}
        {mode === AppMode.LEADERBOARD && <LeaderboardView />}
        {mode === AppMode.CRUISE && <CruiseMode />}
        {mode === AppMode.GROUPS && <Groups user={user} />}
        {mode === AppMode.PROFILE && <Profile user={user} onSave={handleSaveProfile} onCancel={() => setMode(AppMode.DASHBOARD)} />}
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