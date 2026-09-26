// Shared Life360 connector — auth + data fetch + credential crypto.
//
// Used by the connect-life360 and sync-life360 Edge Functions.
//
// REALITY: Life360 has no official API. These are the community
// reverse-engineered v3/v4 endpoints (pnbruckner/life360, kaylathedev/
// life360-node-api). They can be Cloudflare-blocked, rotated, or require 2FA at
// any time. The connect step is the make-or-break gate: if auth returns a
// Cloudflare challenge, the feature is non-viable until an official path
// exists. Scope is strictly the owner's OWN member — never family.

// --- Config (overridable via function secrets) -------------------------------
// Dec 2023 mobile-app basic client token (base64). Rotatable via the
// LIFE360_CLIENT_TOKEN secret if Life360 rotates it.
const DEFAULT_CLIENT_TOKEN =
  'Y2F0aGFwYWNyQVBoZUtVc3RlOGV2ZXZldnVjSGFmZVRydVl1ZnJhYzpkOEM5ZVlVdkE2dUZ1YnJ1SmVnZXRyZVZ1dFJlQ1JVWQ==';
// User-Agent must match the current mobile app or Cloudflare 403s.
const DEFAULT_USER_AGENT = 'com.life360.android.safetymapd/KOKO/23.49.0 android/13';

const BASE_V3 = 'https://api.life360.com/v3';
const BASE_V4 = 'https://api.life360.com/v4';

const clientToken = Deno.env.get('LIFE360_CLIENT_TOKEN') ?? DEFAULT_CLIENT_TOKEN;
const userAgent = Deno.env.get('LIFE360_USER_AGENT') ?? DEFAULT_USER_AGENT;

export class Life360Error extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// --- Credential crypto (AES-GCM, key never leaves the Edge Function) ----------
// Stored column: password_enc text = base64(iv(12) || ciphertext+tag).
const encKeyPromise = (async () => {
  const raw = Deno.env.get('LIFE360_ENC_KEY');
  if (!raw) throw new Error('LIFE360_ENC_KEY secret not set');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
})();

export async function encrypt(plain: string): Promise<string> {
  const key = await encKeyPromise;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decrypt(b64: string): Promise<string> {
  const key = await encKeyPromise;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = bin.slice(0, 12);
  const ct = bin.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// --- HTTP helpers -----------------------------------------------------------
const api = async (path: string, token: string | null, init?: RequestInit) => {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': userAgent,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path.startsWith('http') ? path : `${BASE_V3}${path}`, {
    ...init,
    headers,
  });
  if (res.status === 403) {
    throw new Life360Error('blocked_by_cloudflare', 403, await res.text().catch(() => null));
  }
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { detail = await res.text().catch(() => null); }
    throw new Life360Error(`life360_http_${res.status}`, res.status, detail);
  }
  return res.json();
};

// --- Auth -------------------------------------------------------------------
export interface Life360Me { id: string; loginEmail?: string; firstName?: string }

export const authenticate = async (email: string, password: string): Promise<{ token: string; me: Life360Me }> => {
  const body = new URLSearchParams({ grant_type: 'password', username: email, password });
  const res = await fetch(`${BASE_V3}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${clientToken}`,
      'User-Agent': userAgent,
    },
    body,
  });
  if (res.status === 403) {
    throw new Life360Error('blocked_by_cloudflare', 403, await res.text().catch(() => null));
  }
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { detail = await res.text().catch(() => null); }
    // 401/400 usually = bad credentials or 2FA required.
    throw new Life360Error('auth_failed', res.status, detail);
  }
  const data = await res.json();
  const token: string | undefined = data?.access_token;
  if (!token) throw new Life360Error('auth_failed', 401, data);
  const u = data?.user ?? {};
  return { token, me: { id: String(u.id ?? ''), loginEmail: u.loginEmail, firstName: u.firstName } };
};

// --- Circles (v4 per pnbruckner; fall back to v3) ----------------------------
export const getCircles = async (token: string): Promise<any[]> => {
  let data = await api(`${BASE_V4}/circles`, token).catch(async () => {
    return api(`${BASE_V3}/circles`, token); // v3 fallback
  });
  return Array.isArray(data?.circles) ? data.circles : [];
};

// --- Circle members ---------------------------------------------------------
export const getMembers = async (token: string, circleId: string): Promise<any[]> => {
  const data = await api(`/circles/${circleId}/members`, token);
  return Array.isArray(data?.members) ? data.members : [];
};

// Find the owner's OWN circle + member (never a family member). Matches the
// authenticated user's id against each member's userId field; falls back to
// the first member if the field is absent.
export const findOwnerCircleMember = async (
  token: string,
  me: Life360Me
): Promise<{ circleId: string; memberId: string; circleName: string }> => {
  const circles = await getCircles(token);
  if (!circles.length) throw new Life360Error('no_circles', 400);
  for (const c of circles) {
    const members = await getMembers(token, c.id);
    const owner = members.find((m: any) => m?.userId && String(m.userId) === me.id) ?? members[0];
    if (owner?.id) {
      return { circleId: c.id, memberId: owner.id, circleName: c.name ?? 'Circle' };
    }
  }
  throw new Life360Error('no_member_found', 400);
};

// --- Trips (best-guess endpoint; response shape varies — defensive parse) ---
export const getTrips = async (token: string, circleId: string, memberId: string): Promise<any[]> => {
  // Life360 trip endpoint is not in the public dissection docs. This is the
  // commonly-referenced path; if it 404s we return [] (sync no-ops) rather than
  // failing the whole connect. Validate against a real account at runtime.
  try {
    const data = await api(`/circles/${circleId}/members/${memberId}/trips`, token);
    if (Array.isArray(data?.trips)) return data.trips;
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
};

// --- Trip → drive_events mapping -------------------------------------------
export interface ScoredTrip {
  externalId: string;
  startedAt: string;
  endedAt: string;
  distanceMi: number;
  topSpeedMph: number;
  avgSpeedMph: number;
  safetyEvents: number;
}

const EVENT_TYPES_THAT_COUNT = new Set([
  'hard_brake', 'HARD_BRAKE', 'hardBrake',
  'rapid_accel', 'RAPID_ACCEL', 'rapidAccel',
  'high_speed', 'HIGH_SPEED', 'highSpeed',
]);

const num = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

const toIso = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === 'number') {
    // Life360 uses unix seconds (10 digits) or ms (13 digits).
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// Score one trip into a drive_event, or return null if it has no behavior data
// (we never fabricate a perfect 0-event score from trips we can't assess).
export const scoreTrip = (trip: any): ScoredTrip | null => {
  const externalId = trip?.tripId ?? trip?.id ?? trip?.uuid ?? null;
  const startedAt = toIso(trip?.startTime ?? trip?.startTimestamp ?? trip?.start_time);
  const endedAt = toIso(trip?.endTime ?? trip?.endTimestamp ?? trip?.end_time);
  if (!externalId || !startedAt) return null;

  const events =
    trip?.issues ?? trip?.events ??
    trip?.driveBehavior?.events ?? trip?.driveBehavior?.issues ??
    trip?.behavior?.events ?? null;
  if (!Array.isArray(events) || !events.length) return null; // no behavior data → skip

  let safetyEvents = 0;
  for (const e of events) {
    const t = e?.type ?? e?.issueType ?? e?.name ?? e;
    if (typeof t === 'string' && EVENT_TYPES_THAT_COUNT.has(t)) safetyEvents += 1;
  }

  // Life360 trip distance is in meters; convert to miles. (If a given account
  // returns miles, adjust this divisor — documented for runtime validation.)
  const distanceMi = Math.max(0, num(trip?.distance) / 1609.34);
  if (distanceMi <= 0) return null;
  const topSpeedMph = Math.min(250, Math.max(0, num(trip?.topSpeed ?? trip?.maxSpeed)));
  const durationS = num(trip?.duration);
  const avgSpeedMph = durationS > 0 ? distanceMi / (durationS / 3600) : 0;

  return {
    externalId: String(externalId),
    startedAt,
    endedAt: endedAt ?? startedAt,
    distanceMi: Math.round(distanceMi * 1000) / 1000,
    topSpeedMph: Math.round(topSpeedMph),
    avgSpeedMph: Math.round(avgSpeedMph),
    safetyEvents,
  };
};