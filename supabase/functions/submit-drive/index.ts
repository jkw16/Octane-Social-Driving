// Supabase Edge Function: submit-drive
// Validates and persists a recorded drive session, updates user_stats, and
// refreshes the leaderboard for the session's week. Mirrors BACKEND_PLAN.md §7.
//
// Deploy:
//   supabase functions deploy submit-drive --no-verify-jwt
// (or via the Dashboard). Set SUPABASE_SERVICE_ROLE_KEY as the function's
// secret if it isn't auto-injected. The service role key is used only here,
// server-side — it never ships in the client bundle.
//
// Auth: the caller's JWT is read from the Authorization header. The anon key
// client + that token resolves the user; inserts use a service-role client
// that bypasses RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Monday of the given UTC timestamp (matches Postgres date_trunc('week')).
const weekMonday = (iso: string): string => {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
};

interface WitnessPoint { lat: number; lng: number; ts: string }
interface SubmitBody {
  trackId?: string | null;
  startedAt: string;
  endedAt: string;
  distanceMi: number;
  topSpeedMph: number;
  avgSpeedMph: number;
  safetyEvents: number;
  witness?: WitnessPoint[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Server not configured (missing Supabase env).' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing auth token.' }, 401);

  // Client scoped to the caller's JWT — resolves the authenticated user.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const {
    trackId = null,
    startedAt,
    endedAt,
    distanceMi,
    topSpeedMph,
    avgSpeedMph,
    safetyEvents = 0,
    witness = [],
  } = body;

  // --- Field sanity checks ---
  if (!startedAt) return json({ error: 'startedAt required.' }, 400);
  if (!Number.isFinite(distanceMi) || distanceMi <= 0 || distanceMi > 1000)
    return json({ error: 'distanceMi out of plausible range (0, 1000].' }, 400);
  if (!Number.isFinite(topSpeedMph) || topSpeedMph < 0)
    return json({ error: 'topSpeedMph required and >= 0.' }, 400);
  if (topSpeedMph > 250) return json({ error: 'topSpeedMph exceeds 250 mph cap.' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // --- Geofence validation for track sessions ---
  let validatedTrackId: string | null = null;
  if (trackId) {
    const { data: track, error: trackErr } = await admin
      .from('tracks')
      .select('lat, lng, radius, record_speed')
      .eq('id', trackId)
      .single();
    if (trackErr || !track) return json({ error: 'Unknown trackId.' }, 400);

    if (witness.length < 2)
      return json({ error: 'Track sessions require >= 2 witness GPS points.' }, 400);

    const inside = witness.filter(
      (p) => haversineMeters(track.lat, track.lng, p.lat, p.lng) <= track.radius
    );
    // Require a majority of sampled fixes inside the circuit geofence.
    if (inside.length < Math.ceil(witness.length / 2))
      return json({ error: 'Witness points are not within the track geofence.' }, 400);

    // Per-track plausibility: don't accept a top speed way past the circuit record.
    if (track.record_speed && topSpeedMph > track.record_speed * 1.2)
      return json({ error: 'topSpeedMph implausible for this circuit.' }, 400);

    validatedTrackId = trackId;
  }

  // --- Abuse cap: max 20 sessions per user per rolling hour ---
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await admin
    .from('drive_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('started_at', since);
  if (countErr) return json({ error: 'Rate-limit check failed.', detail: countErr.message }, 500);
  if ((count ?? 0) >= 20)
    return json({ error: 'Too many sessions submitted this hour. Try again later.' }, 429);

  // --- Insert the drive event ---
  const { error: insertErr } = await admin.from('drive_events').insert({
    user_id: user.id,
    track_id: validatedTrackId,
    started_at: startedAt,
    ended_at: endedAt,
    distance_mi: distanceMi,
    top_speed_mph: Math.round(topSpeedMph),
    avg_speed_mph: Math.round(avgSpeedMph || 0),
    safety_events: Math.max(0, Math.round(safetyEvents)),
    witness: witness.length ? witness : null,
  });
  if (insertErr) return json({ error: 'Failed to store drive event.', detail: insertErr.message }, 500);

  // --- Recompute this week's user_stats from all the week's events ---
  const weekStart = weekMonday(startedAt);
  const { data: agg } = await admin.rpc('aggregate_user_week', { p_user: user.id, p_week: weekStart });

  const weeklyMileage = Number(agg?.distance_mi ?? distanceMi);
  const weeklyTop = Number(agg?.top_speed ?? Math.round(topSpeedMph));
  const trackDays = Number(agg?.track_days ?? (validatedTrackId ? 1 : 0));
  const safetyScore = agg?.safety_score ?? 100; // 0–100 for the Dashboard bar

  await admin.from('user_stats').upsert(
    {
      user_id: user.id,
      weekly_mileage: weeklyMileage,
      top_speed: weeklyTop,
      track_days: trackDays,
      safety_score: Math.round(safetyScore),
      week_start: weekStart,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  // --- Refresh leaderboard ranks for the week (immediate, no cron wait) ---
  await admin.rpc('recompute_leaderboard', { p_week: weekStart });

  // Pull the user's resulting scores for a friendly response.
  const { data: ranks } = await admin
    .from('leaderboard_entries')
    .select('mode, score, rank')
    .eq('user_id', user.id)
    .eq('week_start', weekStart);
  const scores: Record<string, { score: number; rank: number | null }> = {};
  (ranks ?? []).forEach((r: any) => { scores[r.mode] = { score: Number(r.score), rank: r.rank }; });

  return json({ ok: true, weekStart, scores });
});