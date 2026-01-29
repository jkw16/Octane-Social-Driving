import React, { useState } from 'react';
import { User, Car, Camera, Save, X, LogIn, LogOut, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileProps {
  user: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  onCancel: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState<UserProfile>(user);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleInputChange = (field: keyof UserProfile, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleToggleSignIn = () => {
    // Simulate sign in/out
    setFormData(prev => ({ 
      ...prev, 
      isSignedIn: !prev.isSignedIn,
      email: !prev.isSignedIn ? 'driver@octane.app' : undefined
    }));
  };

  const randomizeAvatar = () => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
    const randomId = Math.floor(Math.random() * 1000);
    setFormData(prev => ({ ...prev, avatar: `https://picsum.photos/200?random=${randomId}` }));
  };

  return (
    <div className="min-h-full p-4 flex flex-col animate-in slide-in-from-right duration-300">
      <header className="flex items-center justify-between mb-8">
        <button onClick={onCancel} className="p-2 -ml-2 text-gray-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-display font-bold text-white">Edit Profile</h1>
        <button onClick={() => onSave(formData)} className="p-2 -mr-2 text-octane-accent font-bold text-sm">
          Save
        </button>
      </header>

      <div className="flex-1 space-y-8">
        {/* Avatar Section */}
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className={`w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-octane-accent to-blue-600 ${isAnimating ? 'scale-95 opacity-80' : 'scale-100'} transition-all duration-300`}>
              <img 
                src={formData.avatar} 
                alt="Avatar" 
                className="w-full h-full rounded-full object-cover bg-octane-dark border-4 border-octane-black" 
              />
            </div>
            <button 
              onClick={randomizeAvatar}
              className="absolute bottom-0 right-0 p-2 bg-octane-dark rounded-full border border-white/20 text-white hover:bg-octane-accent hover:text-black transition-colors shadow-lg"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-500">Tap icon to randomize visual ID</p>
        </div>

        {/* Account Status */}
        <div className="bg-octane-dark rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.isSignedIn ? 'bg-octane-success/20 text-octane-success' : 'bg-gray-700 text-gray-400'}`}>
                    {formData.isSignedIn ? <Sparkles className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div>
                    <h3 className="font-bold text-white text-sm">{formData.isSignedIn ? 'Cloud Sync Active' : 'Guest Driver'}</h3>
                    <p className="text-xs text-gray-500">{formData.isSignedIn ? formData.email : 'Progress stored locally'}</p>
                </div>
            </div>
            <button 
                onClick={handleToggleSignIn}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${formData.isSignedIn ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-octane-accent/10 text-octane-accent hover:bg-octane-accent/20'}`}
            >
                {formData.isSignedIn ? <LogOut className="w-3 h-3" /> : <LogIn className="w-3 h-3" />}
                {formData.isSignedIn ? 'Sign Out' : 'Sign In'}
            </button>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
              <User className="w-4 h-4" /> Driver Handle
            </label>
            <input 
              type="text" 
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className="w-full bg-octane-dark border border-white/10 rounded-xl px-4 py-3 text-white font-display focus:outline-none focus:border-octane-accent focus:ring-1 focus:ring-octane-accent transition-all"
              placeholder="Enter username"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
              <Car className="w-4 h-4" /> Vehicle Model
            </label>
            <input 
              type="text" 
              value={formData.car}
              onChange={(e) => handleInputChange('car', e.target.value)}
              className="w-full bg-octane-dark border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-octane-accent focus:ring-1 focus:ring-octane-accent transition-all"
              placeholder="e.g. Nissan GT-R"
            />
          </div>
          
          <div className="space-y-2 opacity-50 pointer-events-none grayscale">
             <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
               Vehicle Class (Coming Soon)
             </label>
             <div className="flex gap-2">
                 <div className="bg-octane-dark border border-white/10 px-4 py-3 rounded-xl flex-1 text-center text-sm font-bold text-gray-400">Street</div>
                 <div className="bg-octane-dark border border-octane-accent/50 px-4 py-3 rounded-xl flex-1 text-center text-sm font-bold text-octane-accent">Sport</div>
                 <div className="bg-octane-dark border border-white/10 px-4 py-3 rounded-xl flex-1 text-center text-sm font-bold text-gray-400">Super</div>
             </div>
          </div>
        </div>
      </div>
      
      <div className="mt-auto pt-6 text-center text-[10px] text-gray-600">
          Player ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
      </div>
    </div>
  );
};
