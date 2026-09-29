import React, { useEffect, useState } from 'react';
import { X, Mail, KeyRound, LogIn, Check, AlertCircle, Loader2, User } from 'lucide-react';
import type { AuthState } from '../hooks/useAuth';

interface AuthRecoveryModalProps {
  open: boolean;
  onClose: () => void;
  // Passed down from Profile (which already holds the useAuth instance) so
  // the modal shares one auth subscription instead of creating its own.
  auth?: AuthState;
}

type Mode = 'password' | 'signin';
type Step = 'email' | 'code' | 'newPassword' | 'done';

/**
 * Account recovery flow, opened from the Profile screen's "Forgot password?"
 * button. Covers both halves of the recovery story:
 *
 *  - Forgot PASSWORD:   email step -> 6-digit recovery code step -> set a new
 *    password. The code comes from the "Reset Password" email ({{ .Token }}).
 *
 *  - Forgot USERNAME:   "Email me a sign-in code" sends a magic-link email;
 *    typing its 6-digit code signs the user in without a password. Once signed
 *    in, the driver handle is displayed on the Profile screen, which recovers
 *    the username.
 *
 * Both paths verify via supabase.auth.verifyOtp — deliberately code-first
 * because the iOS WebView build registers no custom URL scheme, so a link
 * redirect can never land back inside the app. The emails still contain the
 * links for PWA users on the hosted web origin.
 */
export const AuthRecoveryModal: React.FC<AuthRecoveryModalProps> = ({ open, onClose, auth }) => {
  const [mode, setMode] = useState<Mode>('password');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const cloudOn = !!auth?.configured;

  useEffect(() => {
    if (open) {
      setMode('password'); setStep('email');
      setEmail(''); setCode(''); setNewPassword(''); setConfirmPassword('');
      setError(null); setNote(null);
    }
  }, [open]);

  if (!open) return null;

  const request = async (mode: Mode) => {
    if (!auth) return;
    setMode(mode); setStep('email'); setError(null); setNote(null);
  };

  // Step 1 — send the email for the chosen mode.
  const handleSend = async () => {
    if (!auth) return;
    setBusy(true); setError(null); setNote(null);
    const r = mode === 'password'
      ? await auth.requestPasswordReset(email.trim())
      : await auth.requestSignInCode(email.trim());
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setStep('code');
    setNote(mode === 'password'
      ? 'Check your email for the reset message. It contains a 6-digit code — enter it below.'
      : 'Check your email for the sign-in message. It contains a 6-digit code — enter it below. Your username will then be shown in Profile.');
  };

  // Step 2 — verify the 6-digit code.
  const handleVerifyCode = async () => {
    if (!auth) return;
    setBusy(true); setError(null);
    const r = await auth.verifyOtpCode(
      email.trim(),
      code.trim(),
      mode === 'password' ? 'recovery' : 'email',
    );
    setBusy(false);
    if (r.error || !r.hasSession) {
      setError(r.error ?? 'Verification failed — no session was created. Try the code again.');
      return;
    }
    if (mode === 'password') {
      setStep('newPassword');
    } else {
      // Signed in via code; the Profile screen now shows the driver handle.
      setStep('done');
    }
  };

  // Step 3 (password mode only) — set the new password.
  const handleSetPassword = async () => {
    if (!auth) return;
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError(null);
    const r = await auth.updatePassword(newPassword);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setStep('done');
  };

  const resend = async () => { await handleSend(); };

  const title = mode === 'password' ? 'Reset Password' : 'Sign In With Code';
  const inputCls = 'w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-octane-accent';

  const renderBody = () => {
    if (!cloudOn) {
      return (
        <p className="text-xs text-gray-500 leading-relaxed">
          Cloud sync isn’t configured yet, so account recovery is unavailable. Add
          <code className="text-gray-400"> SUPABASE_URL </code> and
          <code className="text-gray-400"> SUPABASE_ANON_KEY </code> to <code className="text-gray-400">.env.local</code> first.
        </p>
      );
    }
    switch (step) {
      case 'email':
        return (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              {mode === 'password'
                ? 'Enter the email on your account and we’ll send a 6-digit code you can use to set a new password.'
                : 'Enter your email and we’ll send a 6-digit sign-in code — no password needed. Your username will then be shown in Profile, which also recovers a forgotten username.'}
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter' && email) void handleSend(); }}
            />
            <button
              onClick={handleSend}
              disabled={busy || !email}
              className="w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent text-black disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {busy ? 'Sending…' : (mode === 'password' ? 'Email Me a Reset Code' : 'Email Me a Sign-In Code')}
            </button>
            <div className="pt-1 text-center">
              {mode === 'password' ? (
                <button
                  onClick={() => request('signin')}
                  className="text-[11px] text-gray-500 hover:text-octane-accent transition-colors"
                >
                  Forgot your username too? <span className="text-octane-accent">Email me a sign-in code instead.</span>
                </button>
              ) : (
                <button
                  onClick={() => request('password')}
                  className="text-[11px] text-gray-500 hover:text-octane-accent transition-colors"
                >
                  Actually remember your password? <span className="text-octane-accent">Reset it instead.</span>
                </button>
              )}
            </div>
          </div>
        );
      case 'code':
        return (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">{note}</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className={`${inputCls} tracking-[0.4em] text-center font-mono text-base`}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 6) void handleVerifyCode(); }}
            />
            <button
              onClick={handleVerifyCode}
              disabled={busy || code.length < 6}
              className="w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent text-black disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {busy ? 'Verifying…' : 'Verify Code'}
            </button>
            <div className="flex justify-between pt-1">
              <button onClick={() => { setStep('email'); setCode(''); setError(null); }} className="text-[11px] text-gray-500 hover:text-white transition-colors">
                Wrong email? Go back
              </button>
              <button onClick={resend} disabled={busy} className="text-[11px] text-gray-500 hover:text-octane-accent transition-colors disabled:opacity-40">
                Resend email
              </button>
            </div>
          </div>
        );
      case 'newPassword':
        return (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              Code verified — you’re now signed in. Choose a new password below.
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              className={inputCls}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputCls}
            />
            <button
              onClick={handleSetPassword}
              disabled={busy || !newPassword || !confirmPassword}
              className="w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-octane-accent text-black disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {busy ? 'Saving…' : 'Set New Password'}
            </button>
          </div>
        );
      case 'done':
        return (
          <div className="space-y-3 text-center py-2">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-octane-success/20 text-octane-success">
              <Check className="w-6 h-6" />
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {mode === 'password'
                ? 'Password updated. You’re signed in — your username is shown on the Profile screen.'
                : 'You’re signed in! Your username is now shown on the Profile screen.'}
            </p>
            <button
              onClick={onClose}
              className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${
                mode === 'password'
                  ? 'bg-octane-accent/10 text-octane-accent border border-octane-accent/30'
                  : 'bg-octane-accent text-black'
              }`}
            >
              {mode === 'password' ? <KeyRound className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {mode === 'password' ? 'Back to Profile' : 'View Profile'}
            </button>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pt-safe pb-safe"
      onClick={onClose}
    >
      <div
        className="octane-modal-panel bg-octane-dark w-full max-w-md rounded-2xl border border-white/10 p-5 animate-in slide-in-from-bottom-4 duration-300 min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
            {mode === 'password' ? <KeyRound className="w-5 h-5 text-octane-accent" /> : <User className="w-5 h-5 text-octane-accent" />}
            {title}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        {renderBody()}
        {error && (
          <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>
    </div>
  );
};