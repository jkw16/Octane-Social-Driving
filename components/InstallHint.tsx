import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// A small dismissible banner that nudges testers to install the PWA.
// - Android/Chrome desktop: capture `beforeinstallprompt` and show an
//   "Install" button that triggers the native prompt.
// - iOS Safari: there's no beforeinstallprompt event, so show a one-line
//   "Share → Add to Home Screen" hint instead.
// Dismissed state is remembered in localStorage so it doesn't nag on every load.
const DISMISS_KEY = 'octane:install-hint-dismissed';

export const InstallHint: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  const [deferred, setDeferred] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') { setDismissed(true); return; }
    } catch { /* private mode */ }

    const ua = navigator.userAgent || '';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    // Don't show once the app is already installed/standalone.
    if (isStandalone) { setDismissed(true); return; }
    // iOS Safari has no beforeinstallprompt.
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    setIsIOS(ios);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  if (dismissed) return null;
  // Show the iOS hint, or the install button only once we have a deferred prompt.
  if (!isIOS && !deferred) return null;

  return (
    <div className="flex items-center gap-3 bg-octane-dark/80 border border-white/10 rounded-xl p-3">
      <Download className="w-5 h-5 text-octane-accent shrink-0" />
      <div className="flex-1 text-xs text-gray-300 leading-relaxed">
        {isIOS
          ? <>Install Octane: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</>
          : <>Install Octane to your home screen for the full-screen app experience.</>}
      </div>
      {!isIOS && deferred && (
        <button onClick={install} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-octane-accent text-black">
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-gray-500 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};