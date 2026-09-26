// Supabase Edge Function: sync-life360
//
// Pulls the owner's OWN recent Life360 trips, derives a harsh-event count +
// distance per trip, and inserts them as drive_events rows tagged
// source='life360'. The weekly Safety leaderboard is a pure SQL aggregate
// over drive_events(safety_events, distance_mi), so these rows join the board
// automatically once we call recompute_leaderboard for each affected week.
//
// Deploy:
//   supabase functions deploy sync-life360 --no-verify-jwt --project-ref <ref>
// Requires secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// LIFE360_ENC_KEY (+ optional LIFE360_CLIENT_TOKEN / LIFE360_USER_AGENT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authenticate,
  getTrips,
  scoreTrip,
  decrypt,
  Life360Error,
} from '../_shared/life360.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

// Monday of the given UTC timestamp (matches Postgres date_trunc('week')).
const weekMonday = (iso: string): string => {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
    .toISOString()
    .slice(0, 10);
};

const MAX_TRIPS_PER_SYNC = 50; // cap a single sync to keep imports sane

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server not configured (missing Supabase env).' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing auth token.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  // --- Load + decrypt stored credentials (service role bypasses RLS) -------
  const { data: cred, error: credErr } = await admin
    .from('life360_credentials')
    .select('email, password_enc, circle_id, member_id')
    .eq('user_id', user.id)
    .single();
  if (credErr || !cred || !cred.circle_id || !cred.member_id)
    return json({ error: 'Life360 not connected. Use Connect first.' }, 400);

  let token: string;
  try {
    const password = await decrypt(cred.password_enc);
    ({ token } = await authenticate(cred.email, password));
  } catch (e: any) {
    const code = e instanceof Life360Error ? e.message : 'auth_failed';
    return json(
      {
        error: code,
        userMessage:
          code === 'blocked_by_cloudflare'
            ? 'Life360 is blocking automated access (Cloudflare). Try again later.'
            : 'Life360 rejected the stored login. Your password may have changed or 2FA was enabled — reconnect.',
      },
      502
    );
  }

  // --- Fetch + score trips -------------------------------------------------
  const trips = await getTrips(token, cred.circle_id, cred.member_id);
  const scored = trips.map(scoreTrip).filter((t): t is NonNullable<typeof t> => t !== null).slice(0, MAX_TRIPS_PER_SYNC);

  if (!scored.length) {
    await admin.from('profiles').update({ life360_synced_at: new Date().toISOString() }).eq('id', user.id);
    return json({ ok: true, imported: 0, skipped: trips.length, note: 'No trips with drive-behavior data found.' });
  }

  // --- Dedup against already-imported external ids ------------------------
  const { data: existing } = await admin
    .from('drive_events')
    .select('external_id')
    .eq('user_id', user.id)
    .not('external_id', 'is', null);
  const seen = new Set((existing ?? []).map((r: any) => r.external_id));
  const fresh = scored.filter((t) => !seen.has(t.externalId));

  if (!fresh.length) {
    await admin.from('profiles').update({ life360_synced_at: new Date().toISOString() }).eq('id', user.id);
    return json({ ok: true, imported: 0, skipped: scored.length, note: 'Already up to date.' });
  }

  // --- Insert as drive_events (source='life360', external_id for dedup) ----
  const rows = fresh.map((t) => ({
    user_id: user.id,
    track_id: null, // Life360 trips are not circuit sessions
    started_at: t.startedAt,
    ended_at: t.endedAt,
    distance_mi: t.distanceMi,
    top_speed_mph: t.topSpeedMph,
    avg_speed_mph: t.avgSpeedMph,
    safety_events: t.safetyEvents,
    witness: null,
    source: 'life360',
    external_id: t.externalId,
  }));
  const { error: insertErr } = await admin.from('drive_events').insert(rows);
  if (insertErr) return json({ error: 'Failed to import trips.', detail: insertErr.message }, 500);

  // --- Recompute every affected week's leaderboard + current-week snapshot -
  const weeks = Array.from(new Set(fresh.map((t) => weekMonday(t.startedAt))));
  for (const w of weeks) {
    await admin.rpc('recompute_leaderboard', { p_week: w });
  }
  const currentWeek = weekMonday(new Date().toISOString());
  const { data: agg } = await admin.rpc('aggregate_user_week', { p_user: user.id, p_week: currentWeek });
  if (agg) {
    await admin.from('user_stats').upsert(
      {
        user_id: user.id,
        weekly_mileage: Number(agg?.distance_mi ?? 0),
        top_speed: Number(agg?.top_speed ?? 0),
        track_days: Number(agg?.track_days ?? 0),
        safety_score: Math.round(Number(agg?.safety_score ?? 100)),
        week_start: currentWeek,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  }

  await admin.from('profiles').update({ life360_synced_at: new Date().toISOString() }).eq('id', user.id);

  // Pull the user's resulting Safety rank for a friendly response.
  const { data: ranks } = await admin
    .from('leaderboard_entries')
    .select('mode, score, rank')
    .eq('user_id', user.id)
    .eq('week_start', currentWeek);
  const scores: Record<string, { score: number; rank: number | null }> = {};
  (ranks ?? []).forEach((r: any) => { scores[r.mode] = { score: Number(r.score), rank: r.rank }; });

  return json({
    ok: true,
    imported: fresh.length,
    skipped: scored.length - fresh.length,
    scores,
  });
});