import React, { useState, useRef, useEffect } from 'react';
import { User, Car, Save, X, LogIn, LogOut, Sparkles, ImagePlus, Shuffle, Check, AlertCircle, Shield, RefreshCw, Link2, Unlink } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { UserProfile, VehicleClass } from '../types';
import type { AuthState } from '../hooks/useAuth';
import { supabase } from '../supabase/client';

const VEHICLE_CLASSES: VehicleClass[] = [
  'Muscle Car',
  'Euro',
  'JDM',
  'Overlander',
  'Baja Built',
  'Supercar',
  'Hypercar',
  'Stance Car',
  'Other',
];

interface ProfileProps {
  user: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  onCancel: () => void;
  auth?: AuthState;
}

export const Profile: React.FC<ProfileProps> = ({ user, onSave, onCancel, auth }) => {
  const [formData, setFormData] = useState<UserProfile>(user);
  const [isAnimating, setIsAnimating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const handleCheckTimer = useRef<number | null>(null);

  // Generated once per component instance; stays stable across re-renders.
  const playerIdRef = useRef<string>(
    Math.random().toString(36).substr(2, 9).toUpperCase()
  );

  const handleInputChange = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const cloudOn = !!auth?.configured;
  const signedIn = !!auth?.profile;

  // Live-check driver-handle availability when signing up. profiles.username
  // is UNIQUE, so a duplicate handle makes the signup trigger throw — which
  // Supabase masks as the opaque "Database error saving new user". Checking
  // up front lets us show a clear "taken" message instead.
  useEffect(() => {
    if (signedIn || !cloudOn || !supabase) { setHandleStatus('idle'); return; }
    const handle = formData.username.trim();
    if (!handle) { setHandleStatus('idle'); return; }
    setHandleStatus('checking');
    if (handleCheckTimer.current) window.clearTimeout(handleCheckTimer.current);
    handleCheckTimer.current = window.setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', handle).limit(1);
      setHandleStatus(data && data.length > 0 ? 'taken' : 'available');
    }, 350);
    return () => { if (handleCheckTimer.current) window.clearTimeout(handleCheckTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.username, signedIn, cloudOn]);

  const handleSignIn = async () => {
    if (!auth) return;
    setAuthBusy(true); setAuthError(null); setConfirmPending(false);
    const { error } = await auth.signIn(email, password);
    setAuthBusy(false);
    if (error) setAuthError(error);
    else { setEmail(''); setPassword(''); }
  };

  const handleSignUp = async () => {
    if (!auth) return;
    // The driver handle must be unique (profiles.username is UNIQUE). Block
    // signup with a clear message instead of letting the trigger throw.
    if (!formData.username.trim()) { setAuthError('Pick a driver handle first.'); return; }
    if (handleStatus === 'taken') { setAuthError('That driver handle is taken — pick another.'); return; }
    if (handleStatus === 'checking') { setAuthError('Hold on — checking that handle…'); return; }
    setAuthBusy(true); setAuthError(null); setConfirmPending(false);
    const { error, needsConfirmation } = await auth.signUp(email, password, formData.username, formData.car, formData.avatar);
    setAuthBusy(false);
    if (error) {
      // Supabase masks a duplicate-handle trigger failure as "Database error
      // saving new user" — surface a helpful message in that case.
      setAuthError(/database error saving new user/i.test(error)
        ? 'Sign-up failed — that driver handle may already be taken. Try another.'
        : error);
    } else { setEmail(''); setPassword(''); if (needsConfirmation) setConfirmPending(true); }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    setAuthBusy(true);
    await auth.signOut();
    setAuthBusy(false);
  };

  // --- Life360 connector (Safety Score import) ------------------------------
  // Credentials are sent to the connect-life360 Edge Function, which validates
  // them against Life360 and stores them encrypted server-side — they never
  // touch the client bundle or localStorage. The card only reflects the
  // server-managed life360_connected / life360_synced_at flags on profiles.
  const [l360Email, setL360Email] = useState('');
  const [l360Password, setL360Password] = useState('');
  const [l360Status, setL360Status] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });
  const [l360Connected, setL360Connected] = useState<boolean>(!!user.life360Connected);
  const [l360SyncedAt, setL360SyncedAt] = useState<string | null>(user.life360SyncedAt ?? null);

  const refreshLife360 = async () => {
    if (!supabase || !auth?.user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('life360_connected, life360_synced_at')
      .eq('id', auth.user.id)
      .single();
    if (data) {
      setL360Connected(!!data.life360_connected);
      setL360SyncedAt(data.life360_synced_at ?? null);
    }
  };

  useEffect(() => {
    if (signedIn && cloudOn) refreshLife360();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, cloudOn, auth?.user?.id]);

  // Raw fetch (not supabase-js invoke) so we can read the function's own
  // userMessage from a 502 body — that's how the connect gate surfaces
  // "Life360 blocked / bad credentials / 2FA" cleanly.
  const l360Invoke = async (fn: string, body: unknown): Promise<{ ok: boolean; data?: any; userMessage?: string }> => {
    if (!supabase) return { ok: false, userMessage: 'Cloud sync is not configured.' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, userMessage: 'Sign in first.' };
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, userMessage: json?.userMessage ?? json?.error ?? 'Request failed.' };
      return { ok: true, data: json };
    } catch (e: any) {
      return { ok: false, userMessage: e?.message ?? 'Network error.' };
    }
  };

  const handleLife360Connect = async () => {
    setL360Status({ kind: 'busy' });
    const r = await l360Invoke('connect-life360', { email: l360Email.trim(), password: l360Password });
    if (r.ok) {
      setL360Connected(true);
      setL360Email(''); setL360Password('');
      setL360Status({ kind: 'ok', msg: `Connected to Life360 (${r.data?.circle ?? 'circle'})` });
      refreshLife360();
    } else {
      setL360Status({ kind: 'error', msg: r.userMessage ?? 'Could not connect.' });
    }
  };

  const handleLife360Sync = async () => {
    setL360Status({ kind: 'busy' });
    const r = await l360Invoke('sync-life360', {});
    if (r.ok) {
      const n = r.data?.imported ?? 0;
      setL360Status({ kind: 'ok', msg: n > 0 ? `Imported ${n} trip${n === 1 ? '' : 's'} from Life360.` : 'Up to date — no new trips.' });
      refreshLife360();
    } else {
      setL360Status({ kind: 'error', msg: r.userMessage ?? 'Sync failed.' });
    }
  };

  const handleLife360Disconnect = async () => {
    setL360Status({ kind: 'busy' });
    const r = await l360Invoke('connect-life360', { action: 'disconnect' });
    if (r.ok) {
      setL360Connected(false);
      setL360Status({ kind: 'idle' });
      refreshLife360();
    } else {
      setL360Status({ kind: 'error', msg: r.userMessage ?? 'Could not disconnect.' });
    }
  };

  const randomizeAvatar = () => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
    const randomId = Math.floor(Math.random() * 1000);
    setFormData(prev => ({ ...prev, avatar: `https://picsum.photos/200?random=${randomId}` }));
  };

  // Downscale a photo data URL to a centered square of `size`px and re-encode
  // as JPEG, so the avatar stays small enough for localStorage/Keychain
  // persistence (the whole profile is JSON-stringified into secure storage).
  // Rejects on decode/canvas failure so the caller never persists the original
  // (potentially multi-MB) image as the avatar.
  const downscaleToSquare = (dataUrl: string, size = 256): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const min = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - min) / 2;
        const sy = (img.naturalHeight - min) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          // SecurityError on a tainted canvas — shouldn't happen with data URLs,
          // but don't leave the promise pending if it does.
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode selected image'));
      img.src = dataUrl;
    });

  // Import a profile picture from the device photo library (native iOS picker,
  // or a hidden <input type=file> on the PWA). Result is a downscaled data URL.
  const handlePickPhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });
      if (!photo.dataUrl) return;
      const square = await downscaleToSquare(photo.dataUrl, 256);
      setFormData(prev => ({ ...prev, avatar: square }));
    } catch (err) {
      // User cancelled, denied permission, or the image failed to decode —
      // leave the avatar unchanged rather than storing an unbounded original.
      console.warn('Photo pick failed:', err);
    }
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
              onClick={handlePickPhoto}
              aria-label="Choose profile photo from your library"
              className="absolute bottom-0 right-0 p-2 bg-octane-dark rounded-full border border-white/20 text-white hover:bg-octane-accent hover:text-black transition-colors shadow-lg"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={randomizeAvatar}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-octane-accent transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Randomize visual ID
          </button>
        </div>

        {/* Account Status */}
        <div className="bg-octane-dark rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${signedIn ? 'bg-octane-success/20 text-octane-success' : 'bg-gray-700 text-gray-400'}`}>
                        {signedIn ? <Sparkles className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">{signedIn ? 'Cloud Sync Active' : 'Guest Driver'}</h3>
                        <p className="text-xs text-gray-500">{signedIn ? (auth?.profile?.email ?? 'Signed in') : (cloudOn ? 'Sign in to post scores & sync' : 'Progress stored locally')}</p>
                    </div>
                </div>
                {signedIn && (
                    <button
                        onClick={handleSignOut}
                        disabled={authBusy}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                    >
                        <LogOut className="w-3 h-3" /> Sign Out
                    </button>
                )}
            </div>

            {!signedIn && cloudOn && (
                <div className="space-y-2 pt-1">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-octane-accent"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-octane-accent"
                    />
                    {authError && <p className="text-xs text-red-400">{authError}</p>}
                    <div className="flex gap-2">
                        <button
                            onClick={handleSignIn}
                            disabled={authBusy || !email || !password}
                            className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent text-black disabled:opacity-40"
                        >
                            <LogIn className="w-3.5 h-3.5" /> {authBusy ? '…' : 'Sign In'}
                        </button>
                        <button
                            onClick={handleSignUp}
                            disabled={authBusy || !email || !password || handleStatus === 'taken' || handleStatus === 'checking'}
                            className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent/10 text-octane-accent border border-octane-accent/30 disabled:opacity-40"
                        >
                            {authBusy ? '…' : 'Create Account'}
                        </button>
                    </div>
                    {confirmPending && (
                        <div className="mt-1 rounded-lg bg-octane-accent/10 border border-octane-accent/30 p-3 text-xs text-octane-accent leading-relaxed">
                            Account created — <strong>check your email</strong> for a confirmation link from Supabase, then come back and Sign In.
                        </div>
                    )}
                </div>
            )}
            {!signedIn && !cloudOn && (
                <p className="text-[11px] text-gray-600 leading-relaxed">
                    Cloud sync isn’t configured yet. Add <code className="text-gray-500">SUPABASE_URL</code> and <code className="text-gray-500">SUPABASE_ANON_KEY</code> to <code className="text-gray-500">.env.local</code> to enable accounts, the leaderboard, and cross-device progress.
                </p>
            )}
        </div>

        {/* Life360 connector — imports real driving trips into the Safety leaderboard. */}
        {signedIn && cloudOn && (
          <div className="bg-octane-dark rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${l360Connected ? 'bg-octane-accent/20 text-octane-accent' : 'bg-gray-700 text-gray-400'}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Life360</h3>
                  <p className="text-xs text-gray-500">
                    {l360Connected ? 'Connected — import real trips to Safety' : 'Import real driving trips'}
                  </p>
                </div>
              </div>
              {l360Connected && (
                <button
                  onClick={handleLife360Disconnect}
                  disabled={l360Status.kind === 'busy'}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <Unlink className="w-3 h-3" /> Disconnect
                </button>
              )}
            </div>

            {!l360Connected ? (
              <div className="space-y-2 pt-1">
                <input
                  type="email"
                  value={l360Email}
                  onChange={(e) => setL360Email(e.target.value)}
                  placeholder="Life360 email"
                  className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-octane-accent"
                />
                <input
                  type="password"
                  value={l360Password}
                  onChange={(e) => setL360Password(e.target.value)}
                  placeholder="Life360 password"
                  className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-octane-accent"
                />
                <button
                  onClick={handleLife360Connect}
                  disabled={l360Status.kind === 'busy' || !l360Email || !l360Password}
                  className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent text-black disabled:opacity-40"
                >
                  <Link2 className="w-3.5 h-3.5" /> {l360Status.kind === 'busy' ? 'Connecting…' : 'Connect Life360'}
                </button>
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  Credentials are validated and stored encrypted on the server — never in the app. Life360 has no official API, so this uses their private endpoints and may break if they block it. Connects to your own driving member only.
                </p>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleLife360Sync}
                  disabled={l360Status.kind === 'busy'}
                  className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent text-black disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${l360Status.kind === 'busy' ? 'animate-spin' : ''}`} />
                  {l360Status.kind === 'busy' ? 'Syncing…' : 'Sync Now'}
                </button>
                {l360SyncedAt && (
                  <p className="text-[10px] text-gray-600">Last synced {new Date(l360SyncedAt).toLocaleString()}</p>
                )}
              </div>
            )}

            {l360Status.kind === 'ok' && l360Status.msg && (
              <p className="text-xs text-octane-success flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> {l360Status.msg}</p>
            )}
            {l360Status.kind === 'error' && l360Status.msg && (
              <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {l360Status.msg}</p>
            )}
          </div>
        )}

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
              placeholder="Enter a unique handle"
            />
            {!signedIn && cloudOn && handleStatus !== 'idle' && (
              <div className={`flex items-center gap-1.5 text-xs ${handleStatus === 'available' ? 'text-octane-success' : handleStatus === 'taken' ? 'text-octane-danger' : 'text-gray-500'}`}>
                {handleStatus === 'available' && <><Check className="w-3.5 h-3.5" /> Available</>}
                {handleStatus === 'taken' && <><AlertCircle className="w-3.5 h-3.5" /> Already taken — pick another</>}
                {handleStatus === 'checking' && <>Checking…</>}
              </div>
            )}
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
          
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
               <Car className="w-4 h-4" /> Vehicle Class
             </label>
             <div className="flex flex-wrap gap-2">
                 {VEHICLE_CLASSES.map((vc) => {
                     const selected = formData.vehicleClass === vc;
                     return (
                         <button
                            key={vc}
                            onClick={() => handleInputChange('vehicleClass', vc)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                selected
                                    ? 'bg-octane-accent/15 border-octane-accent text-octane-accent'
                                    : 'bg-octane-dark border-white/10 text-gray-400 hover:border-white/30'
                            }`}
                         >
                            {vc === 'Other' ? 'Other (classify your own)' : vc}
                         </button>
                     );
                 })}
             </div>
             {formData.vehicleClass === 'Other' && (
                <input
                    type="text"
                    value={formData.customVehicleClass ?? ''}
                    onChange={(e) => handleInputChange('customVehicleClass', e.target.value)}
                    className="w-full bg-octane-dark border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-octane-accent focus:ring-1 focus:ring-octane-accent transition-all"
                    placeholder="Describe your build (e.g. Restomod, Kei Truck, Kit Car)"
                />
             )}
          </div>
        </div>
      </div>
      
      <div className="mt-auto pt-6 text-center text-[10px] text-gray-600">
          Player ID: {playerIdRef.current}
      </div>
    </div>
  );
};
