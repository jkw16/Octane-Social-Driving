import { registerPlugin } from '@capacitor/core';

/**
 * SecureStorage — a tiny Capacitor plugin (native: iOS Keychain) that keeps
 * persisted app state encrypted at rest instead of in the WebView's plaintext
 * localStorage.
 *
 * On iOS, calls proxy to SecureStoragePlugin (Swift, Keychain-backed).
 * On web (dev server / PWA), there is no Keychain, so we fall back to
 * localStorage. The iOS app — the primary target — gets real encryption.
 */

export interface SecureStorageGetResult {
  value: string | null;
}

export interface SecureStoragePlugin {
  get(options: { key: string }): Promise<SecureStorageGetResult>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

class WebSecureStorage {
  async get({ key }: { key: string }): Promise<SecureStorageGetResult> {
    return { value: localStorage.getItem(key) };
  }
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    localStorage.setItem(key, value);
  }
  async remove({ key }: { key: string }): Promise<void> {
    localStorage.removeItem(key);
  }
}

export const secureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage', {
  web: async () => new WebSecureStorage(),
});