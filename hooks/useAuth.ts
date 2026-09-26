import { useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { UserProfile } from '../types';

interface CloudProfile {
  username: string;
  car: string;
  avatar: string;
  life360Connected: boolean;
  life360SyncedAt: string | null;
}

export interface AuthState {
  ready: boolean;                       // finished first session hydration
  configured: boolean;                  // is a Supabase project wired up?
  session: Session | null;
  user: User | null;                    // Supabase auth user
  profile: UserProfile | null;          // cloud-backed profile when signed in
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, handle: string, car: string, avatar: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Pick<UserProfile, 'username' | 'car' | 'avatar'>) => Promise<{ error: string | null }>;
}

const fetchProfile = async (userId: string): Promise<CloudProfile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('username, car, avatar, life360_connected, life360_synced_at')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    username: data.username,
    car: data.car ?? '',
    avatar: data.avatar ?? '',
    life360Connected: !!data.life360_connected,
    life360SyncedAt: data.life360_synced_at ?? null,
  };
};

const toUserProfile = (user: User, cloud: CloudProfile): UserProfile => ({
  username: cloud.username,
  car: cloud.car,
  avatar: cloud.avatar,
  isSignedIn: true,
  email: user.email,
  life360Connected: cloud.life360Connected,
  life360SyncedAt: cloud.life360SyncedAt,
});

export const useAuth = (): AuthState => {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cloudProfile, setCloudProfile] = useState<CloudProfile | null>(null);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }

    // Hydrate the existing session, then subscribe to changes.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchProfile(data.session.user.id).then(setCloudProfile).finally(() => setReady(true));
      } else {
        setReady(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setCloudProfile(await fetchProfile(newSession.user.id));
      } else {
        setCloudProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Cloud sync is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, handle: string, car: string, avatar: string) => {
    if (!supabase) return { error: 'Cloud sync is not configured.', needsConfirmation: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: handle, car, avatar } },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    // signUp may return a session immediately (if email confirmation is off) or
    // require confirmation. If we have a user, upsert the profile row now so the
    // handle_new_user trigger has the requested values even if it already ran.
    if (data.user) {
      await supabase.from('profiles').upsert(
        { id: data.user.id, username: handle, car, avatar },
        { onConflict: 'id' }
      );
    }
    // No session back means Supabase is waiting for email confirmation.
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudProfile(null);
  }, []);

  const updateProfile = useCallback(async (patch: Pick<UserProfile, 'username' | 'car' | 'avatar'>) => {
    if (!supabase || !session?.user) return { error: 'Not signed in.' };
    const { error } = await supabase.from('profiles').upsert(
      { id: session.user.id, ...patch },
      { onConflict: 'id' }
    );
    if (!error) setCloudProfile(prev => prev ? { ...prev, ...patch } : prev);
    return { error: error?.message ?? null };
  }, [session]);

  const profile: UserProfile | null =
    session?.user && cloudProfile ? toUserProfile(session.user, cloudProfile) : null;

  return {
    ready,
    configured: isSupabaseConfigured,
    session,
    user: session?.user ?? null,
    profile,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };
};