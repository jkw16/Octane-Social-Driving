import React from 'react';
import { Trophy, Shield, Activity, Flame } from 'lucide-react';
import { USER_STATS } from '../constants';
import { UserProfile } from '../types';

interface DashboardProps {
  user: UserProfile;
  onProfileClick: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onProfileClick }) => {
  return (
    <div className="p-4 space-y-6 pb-24">
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

      {/* Main Stats Card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-octane-dark rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Flame className="w-12 h-12 text-octane-danger" />
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Weekly Distance</p>
            <h3 className="text-3xl font-display font-bold text-white">{USER_STATS.weeklyMileage}<span className="text-sm font-sans text-gray-500 ml-1">mi</span></h3>
            <div className="mt-2 text-xs text-octane-success flex items-center gap-1">
                <Activity className="w-3 h-3" /> +12% vs last week
            </div>
        </div>

        <div className="bg-octane-dark rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Shield className="w-12 h-12 text-octane-success" />
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Safety Score</p>
            <h3 className="text-3xl font-display font-bold text-white">{USER_STATS.safetyScore}</h3>
            <div className="mt-2 w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                <div className="bg-octane-success h-full" style={{ width: `${USER_STATS.safetyScore}%` }}></div>
            </div>
        </div>
      </div>

      {/* Featured Event */}
      <div className="bg-gradient-to-r from-indigo-900 to-octane-dark rounded-2xl p-5 border border-indigo-500/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
          <div className="relative z-10">
              <div className="flex justify-between items-start mb-2">
                  <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Event</span>
                  <span className="text-indigo-200 text-xs font-mono">2h 15m left</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Midnight Tokyo Run</h3>
              <p className="text-indigo-200 text-sm mb-4">Complete 50 safe miles on highway routes to unlock the Neon Decal.</p>
              <button className="w-full py-2 bg-white text-indigo-900 font-bold text-sm rounded-lg hover:bg-indigo-50 transition-colors">
                  Join Event
              </button>
          </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">Leaderboards</h3>
        <div className="space-y-3">
            {[
                { label: 'Track Records', icon: Trophy, color: 'text-yellow-500', val: '#4 Region' },
                { label: 'Safety Streak', icon: Shield, color: 'text-octane-success', val: 'Top 10%' },
            ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-octane-dark border border-white/5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${item.color}`} />
                        <span className="font-medium text-white">{item.label}</span>
                    </div>
                    <span className="text-sm font-mono text-gray-400">{item.val}</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
