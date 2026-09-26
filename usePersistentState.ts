import { useCallback, useEffect, useRef, useState } from 'react';
import { secureStorage } from './secureStorage';

/**
 * Like useState, but the value is mirrored to native secure storage
 * (iOS Keychain via the SecureStorage Capacitor plugin) so it survives
 * app relaunches AND is encrypted at rest. On web/dev it falls back to
 * localStorage (see secureStorage.ts).
 *
 * Because native storage is async, hydration happens after mount:
 *   - `state` starts at `defaultValue` and snaps to the stored value once
 *     the Keychain read resolves (usually within a tick).
 *   - `loaded` is false until that first read completes.
 *   - Writes are skipped until `loaded` is true, so we never overwrite
 *     stored data with the default before hydration finishes.
 *   - A `touched` guard ensures that if the user changes state before
 *     hydration completes, we don't clobber their change.
 *
 * Returns `[state, setState, loaded]`. Callers that don't care about
 * `loaded` can destructure just `[state, setState]`.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T
): readonly [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const [state, setStateRaw] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  // Hydrate once per key.
  useEffect(() => {
    let alive = true;
    touched.current = false;
    setLoaded(false);

    secureStorage
      .get({ key })
      .then(({ value }) => {
        if (!alive) return;
        if (touched.current) {
          // User already mutated state before we finished reading; keep theirs.
          setLoaded(true);
          return;
        }
        if (value != null) {
          try {
            setStateRaw(JSON.parse(value) as T);
          } catch (e) {
            console.warn(`[persist] failed to parse stored value for "${key}"`, e);
          }
        }
        setLoaded(true);
      })
      .catch((e) => {
        if (!alive) return;
        console.warn(`[persist] failed to load "${key}"`, e);
        setLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, [key]);

  // Wrap setState so we can tell hydration not to clobber a user change.
  const setState = useCallback<React.Dispatch<React.SetStateAction<T>>>((v) => {
    touched.current = true;
    setStateRaw(v);
  }, []);

  // Persist on change, but only after the initial hydration has settled.
  useEffect(() => {
    if (!loaded) return;
    // Only persist user-initiated changes — never write the default back over
    // stored data just because hydration finished. If the native read failed
    // (e.g. Keychain temporarily unreadable), `loaded` flips true but `state`
    // is still the default; writing now would clobber the real stored value.
    // `touched` flips true only via the wrapped setState below, and any such
    // change also updates `state` (a dep), so this effect re-runs with
    // touched=true exactly when it should.
    if (!touched.current) return;
    secureStorage
      .set({ key, value: JSON.stringify(state) })
      .catch((e) => console.warn(`[persist] failed to save "${key}"`, e));
  }, [key, state, loaded]);

  return [state, setState, loaded] as const;
}