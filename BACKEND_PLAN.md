# Octane: Social Driving — Backend Scoping Document

This document scopes the backend needed to turn the Octane front-end prototype
into a working app. It is written for the app's owner, who knows the product
but is not a backend developer. Concrete table definitions and function
signatures are included so an implementer can act on them, but nothing here is
over-engineered — this is a hobbyist project, not an enterprise build.

---

## 1. Goal & non-goals

### Goal for v1 — "working properly"

Make the social and competitive features that are currently fake actually work
and persist across refresh, sessions, and devices. Specifically:

- A real user account that survives a page refresh. The "Sign In" button does
  something real; the "Progress stored locally" label becomes truthful because
  progress is stored in the cloud.
- Groups you create/join are real rows in a database, not items pushed into a
  React array that vanish on reload.
- Chat messages are persisted and delivered live to anyone in the group — no
  `setTimeout` canned "Nice ride!" reply.
- Leaderboard reflects real driving data with a weekly reset, not a hardcoded
  array of three people.
- Track Mode unlocks when the device is physically inside a known circuit's
  geofence — not only via a "Simulate" toggle or "Admin Override" button.
- Dashboard stats come from the user's actual driving history, not the
  literals in `USER_STATS`.
- Meetups can be created by an organizer and optionally populated by the AI
  "Live Event Scout."

### Non-goals (defer to later)

- A mobile native app. v1 stays a React/Vite SPA.
- A custom backend server you have to host and patch. v1 uses a managed BaaS.
- Anti-cheat beyond server-side validation of submitted scores. Full
  telemetry integrity (signed sensor reads, device attestation) is later.
- Paid billing/subscription tiers, content moderation tooling, or an admin
  dashboard. v1 assumes a single owner-admin and a small trust circle.
- The voice "crew chief" (Gemini Live audio) being production-hardened. It is
  treated as an opt-in extra (see open questions).

---

## 2. Recommended stack

**Recommendation: Supabase.** One product gives Postgres, Auth, Realtime
(WebSocket subscription to table changes), Storage, and Edge Functions
(serverless Deno functions) on a generous free tier. It has a first-class
JavaScript client that drops straight into a React/Vite app, so the owner
writes SQL and React, not DevOps. RLS (Row Level Security) policies in
Postgres replace a lot of hand-written authorization code.

**Closest alternative: Firebase.** Firebase is the other obvious choice and is
slightly easier to get started with. It is *not* recommended here because:

- Firestore is a NoSQL document database. Octane's data is naturally
  relational (groups have members, messages belong to groups, leaderboard
  entries reference users and tracks). Modeling that in Firestore is doable
  but awkward; in Postgres it is one `JOIN`.
- Supabase gives you a real Postgres instance. You can run arbitrary SQL,
  `pg_cron` jobs, and aggregate queries for the leaderboard — exactly what
  Firebase lacks without adding Cloud Functions + BigQuery.
- Realtime chat maps cleanly to Supabase Realtime's `postgres_changes`
  channel, which is simpler than wiring Firestore listeners across
  collections.

Commit to Supabase for v1. Do not list five options — pick one and move.

---

## 3. Data model

Derived directly from `types.ts`. Each table maps to a TypeScript interface
the UI already consumes. Column names are snake_case in Postgres; the Supabase
client can be configured to camelCase if desired, but keeping snake_case in
the DB is standard.

### `profiles` — backs `UserProfile`

The auth user (Supabase Auth) owns the identity; this row holds the
app-specific profile fields the user edits on the Profile screen.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | = `auth.users.id`. FK to `auth.users`. |
| `username` | `text` not null unique | the "Driver Handle" |
| `car` | `text` not null default `''` | "Vehicle Model" |
| `avatar` | `text` not null default `''` | URL |
| `created_at` | `timestamptz` default `now()` | |

RLS: a row is readable by any authenticated user (leaderboards/profiles are
public within the app) and writable only by its owner.

> **Type extension:** `UserProfile.isSignedIn` and `UserProfile.email` are no
> longer columns — they come from the Supabase auth session
> (`session.user.email`, `session !== null`). The `isSignedIn` boolean becomes
> a derived client value, not stored data.

### `groups` — backs `Group`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `name` | `text` not null | |
| `description` | `text` not null default `''` | |
| `image` | `text` not null default `''` | |
| `is_private` | `boolean` not null default `false` | `Group.isPrivate` |
| `invite_code` | `text` nullable | set only when `is_private`; unique |
| `created_by` | `uuid` not null FK → `profiles.id` | the founder |
| `created_at` | `timestamptz` default `now()` | |

RLS: public groups readable by any authenticated user; private groups readable
only to members (via a join on `group_members`). Writes (create/update/delete)
restricted to the `created_by` owner. `invite_code` is selectable only to
members and to a join function (see §4).

> **Type changes:** `Group.members` (count) and `Group.isJoined`,
> `Group.userRank` are derived per-request, not stored on the group row.
> `members` = `count(*)` of `group_members` for that group; `isJoined` and
> `userRank` come from the current user's `group_members` row.

### `group_members` — new (no TS type; backs `Group.isJoined`/`userRank`)

| column | type | notes |
|---|---|---|
| `group_id` | `uuid` FK → `groups.id` on delete cascade | |
| `user_id` | `uuid` FK → `profiles.id` on delete cascade | |
| `rank` | `text` not null default `'Rookie'` | `Founder`/`Veteran`/`Moderator`/`Rookie` |
| `joined_at` | `timestamptz` default `now()` | |
| | PK = `(group_id, user_id)` | |

RLS: members of a group can read all rows for that group; a user can insert
their own row (join) and update/delete only their own row. Promoting another
user's rank is restricted to the group owner (policy compares
`groups.created_by` to `auth.uid()` via a subquery).

### `messages` — backs `ChatMessage`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `group_id` | `uuid` FK → `groups.id` on delete cascade | |
| `sender_id` | `uuid` FK → `profiles.id` on delete cascade | **new — replaces `sender` string** |
| `text` | `text` not null | |
| `created_at` | `timestamptz` default `now()` | replaces string `timestamp` |
| | index on `(group_id, created_at)` | |

RLS: readable by group members (membership check via `group_members`);
insertable by group members with `sender_id = auth.uid()`. No updates/deletes
in v1 (no message editing).

> **Type changes:** `ChatMessage.sender`, `avatar`, `isMe`, `senderRank` are
> all derived on the client by joining `sender_id` → `profiles`. `isMe` =
> `sender_id === session.user.id`. `timestamp` is `created_at` formatted
> client-side. The canned `setTimeout` reply is deleted entirely — see §5.

### `tracks` — backs `Track`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | keep existing string ids or migrate to uuid |
| `name` | `text` not null | |
| `location` | `text` not null | |
| `lat` | `double precision` not null | **used for geofence — currently unused** |
| `lng` | `double precision` not null | **used for geofence — currently unused** |
| `radius` | `integer` not null | meters |
| `record_holder` | `text` | denormalized; could be a FK to `profiles.username` later |
| `record_speed` | `integer` | mph |

RLS: readable by everyone (public catalog). Writable only by the
owner-admin (a `profiles.is_admin` flag or a hardcoded owner id in v1).

### `meetups` — backs `Meetup`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` not null | |
| `location` | `text` not null | |
| `time` | `timestamptz` not null | **upgrade from free-text string to a real timestamp** |
| `attendees` | `integer` not null default `0` | maintained by a trigger or app logic |
| `type` | `text` not null check in (`'Chill'`,`'Race'`,`'Show'`) | |
| `lat` | `double precision` not null | |
| `lng` | `double precision` not null | |
| `description` | `text` not null default `''` | |
| `created_by` | `uuid` FK → `profiles.id` | organizer |
| `created_at` | `timestamptz` default `now()` | |

RLS: readable by all authenticated users; creatable/updatable only by
owner-admin or a designated organizer role.

### `leaderboard_entries` — backs `LeaderboardEntry`

Aggregated, not raw events. One row per `(user_id, mode, week_start)`.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles.id` | |
| `mode` | `text` not null check in (`'Track'`,`'Safety'`,`'Endurance'`) | `LeaderboardEntry.mode` |
| `score` | `integer` not null | `LeaderboardEntry.score` |
| `week_start` | `date` not null | the Monday of the scoring week |
| `rank` | `integer` | computed at aggregation time |
| | unique `(user_id, mode, week_start)` | |

RLS: readable by all authenticated users; no client writes at all — this
table is populated only by the scheduled aggregation job (see §6).

> **Type change:** `username`, `avatar`, `car` are joined from `profiles` on
> read. `rank` is computed by the aggregation job and stored, so the client
> just sorts.

### `user_stats` — backs `UserStats`

Live counters for the Dashboard.

| column | type | notes |
|---|---|---|
| `user_id` | `uuid` PK FK → `profiles.id` on delete cascade | |
| `weekly_mileage` | `numeric` default `0` | reset weekly by the job |
| `safety_score` | `integer` default `0` | 0–100 |
| `top_speed` | `integer` default `0` | mph |
| `track_days` | `integer` default `0` | |
| `week_start` | `date` not null default `date_trunc('week', now())::date` | for weekly reset bookkeeping |
| `updated_at` | `timestamptz` default `now()` | |

RLS: readable by the owner only (personal stats); writable by the owner via
a controlled RPC (see §7 — score submission is validated server-side), or by
the aggregation job.

> The Profile screen's "Progress stored locally" label becomes accurate:
> these values live in Postgres and follow the user across devices.

### `drive_events` — new (no TS type; raw input for stats + leaderboard)

A append-only log of driving sessions submitted from Track Mode. The source
of truth for all aggregations.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles.id` | |
| `track_id` | `uuid` FK → `tracks.id` | nullable (for cruise sessions) |
| `started_at` | `timestamptz` not null | |
| `ended_at` | `timestamptz` | |
| `distance_mi` | `numeric` not null | |
| `top_speed_mph` | `integer` not null | |
| `avg_speed_mph` | `integer` | |
| `max_g_force` | `numeric` | |
| `lap_time_ms` | `integer` | nullable |
| `safety_events` | `integer` default `0` | harsh braking/cornering counts |
| | index on `(user_id, started_at)` | |

RLS: readable only by owner; insertable only by owner via a validated
server-side function (see §7).

---

## 4. Auth

### Replacing the fake toggle

`Profile.tsx` currently has `handleToggleSignIn` which flips a boolean in
local React state and writes a fake `driver@octane.app` email. Replace it
with **Supabase Auth**, starting with **email/password** (zero-config,
no external provider setup) and optionally **Google OAuth** later (one-click
in the Supabase dashboard).

Client shape:

```ts
// on "Sign In" button: open Supabase auth UI or your own form
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
// on "Sign Out":
await supabase.auth.signOut();
// subscribe to session changes — replaces the local `user` state in App.tsx
supabase.auth.onAuthStateChange((_event, session) => {
  setUser(session ? profileFromSession(session) : guestUser);
});
```

`profileFromSession` fetches the `profiles` row for `session.user.id` and
returns the `UserProfile` the UI expects. If no profile row exists yet (first
sign-in), create one from the auth user's email + a default username.

### Why `UserProfile` is derived, not stored as-is

`UserProfile.isSignedIn` → `session !== null`.
`UserProfile.email` → `session.user.email`.
`UserProfile.username/car/avatar` → the `profiles` row.

So the `profiles` table only stores the three editable fields; everything
else is the auth session.

### The API-key-in-client problem (important)

Two places currently read `process.env.API_KEY` and call Gemini directly from
the browser:

- `components/Meetups.tsx` — `handleScoutEvents` (text search via Gemini 2.5
  Flash with Google Search grounding).
- `components/TrackMode.tsx` — `findNearestTrack` (Gemini + Google Maps
  grounding).
- `services/liveService.ts` — the voice crew chief (Gemini Live audio).

In a Vite SPA, `process.env.API_KEY` is inlined into the client bundle at
build time. Anyone can read it from the served JavaScript. That is both a
**security hole** (anyone can steal the key and run up your bill) and a
**cost-control hole** (no rate limiting, no per-user quota). This must be
fixed before the app is public.

### Recommended fix: a Supabase Edge Function proxy

Write one Edge Function that proxies Gemini so the key lives only in the
function's environment (Supabase secrets), never in the client.

```
POST /functions/v1/gemini-proxy
 body: { task: "scout-events" | "nearest-track", lat?: number, lng?: number }
 response: { summary: string, sources: [{title, uri}] }
```

The function holds `GEMINI_API_KEY` as a Supabase secret, calls Gemini with
the same model and grounding config the client uses today, and returns the
parsed result. The client calls the function via the Supabase SDK
(`supabase.functions.invoke('gemini-proxy', { body })`) — no key shipped.

For the **Live audio crew chief**, the key-in-client problem is harder
because the Live API is a bidirectional WebSocket that expects the client to
stream audio. Two options:

1. **Keep it client-side but gate it behind the proxy** — the Edge Function
   mints a short-lived token and returns it to the client, which then opens
   the Live session. (Gemini doesn't currently issue per-session tokens, so
   this may require the function to relay audio — heavier.)
2. **Relay audio through the Edge Function** — the function holds the key
   and proxies audio frames. More complex; consider this later.

For v1, recommend: **do not ship the voice crew chief with an embedded key.**
Either run it only in a personal/local build where the owner pastes their key
into a local env file that is not bundled, or defer the feature until a
proper relay exists. See open questions.

---

## 5. Realtime chat

Replace the `setTimeout` canned reply with Supabase Realtime. The current
`handleSendMessage` in `Groups.tsx` pushes a message into local state and then
2 seconds later pushes a fake "Nice ride!" from "DriftKing". Delete the
fake-reply block entirely.

### Client integration

```ts
// on opening a group chat:
const channel = supabase
  .channel(`group:${groupId}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages',
      filter: `group_id=eq.${groupId}` },
    (payload) => {
      // payload.new is the inserted row; join sender_id → profiles on client
      // (or use a Postgres view / RPC that returns the joined row)
      setMessages(prev => [...prev, hydrateMessage(payload.new)]);
    }
  )
  .subscribe();

// on send:
await supabase.from('messages').insert({
  group_id: groupId,
  sender_id: session.user.id,
  text: inputText,
});
// do NOT push to local state — the realtime event will add it.
```

To get `sender`/`avatar`/`senderRank` for display, either:

- Create a **view** `messages_with_sender` joining `messages` to `profiles`
  and subscribe to inserts on the view (Supabase Realtime supports views in
  recent versions), or
- Have the client fetch the group's member profiles once on join and look
  up `sender_id` locally. Simpler for v1.

No canned replies. Other human members' messages arrive via the realtime
channel.

---

## 6. Leaderboard

The current `MOCK_LEADERBOARD_SPEED` and `MOCK_LEADERBOARD_SAFETY` are
hardcoded arrays in `App.tsx`. Replace with a scheduled aggregation job.

### Job

Use **pg_cron** (Supabase supports it) or a **daily Supabase Edge Function**
triggered by a Supabase scheduled function. Recommended cadence:

- **Daily at 00:05 UTC**: recompute `leaderboard_entries` for the current
  week from `drive_events` accumulated since the week's Monday. This keeps
  ranks fresh without a user-triggered query.
- **Weekly on Monday 00:00 UTC**: start a new `week_start` partition. The
  previous week's rows stay for history; the current week starts empty. This
  is the "weekly reset" the UI implies.

### Mode → scoring mapping

The `LeaderboardEntry.mode` is `'Track' | 'Safety' | 'Endurance'`. Map each
to an aggregation over `drive_events`:

- **Track** → `max(top_speed_mph)` per user for the week, for events where
  `track_id is not null`. Score = top speed (mph). Rank desc.
- **Safety** → a safety score derived from `safety_events` and distance:
  `score = clamp(1000 - 10 * safety_events_per_100mi, 0, 1000)`. Rank desc.
- **Endurance** → `sum(distance_mi)` per user for the week. Rank desc.

The job writes one `leaderboard_entries` row per `(user_id, mode, week_start)`
and sets `rank` via a window function (`rank() over (order by score desc)`).

### Client read

```ts
const { data } = await supabase
  .from('leaderboard_entries')
  .select('rank, score, mode, profiles(username, avatar, car)')
  .eq('week_start', currentWeekMonday)
  .order('mode')
  .order('rank', { ascending: true });
```

The `LeaderboardView` in `App.tsx` then groups by `mode` and renders — same
UI, real data.

---

## 7. Track geofence

This is the missing piece called out in the prior audit. `Track.lat`,
`Track.lng`, and `Track.radius` exist in the type and in `MOCK_TRACKS` but
are **never used**. `TrackMode.tsx` only sets `inGeofence = true` via
`toggleSimulation` (the "[DEMO] Simulate Arriving" button) or
`handleAdminOverride`. Real GPS is wired (`navigator.geolocation.watchPosition`)
but the geofence check against `tracks` is never computed.

### v1 approach: client-side point-in-circle

No server needed for the unlock decision. On each GPS update, compute the
haversine distance from the device to every track center and compare to
`radius`:

```ts
function isInAnyTrackGeofence(lat: number, lng: number): Track | null {
  for (const t of tracks) {
    const d = haversineMeters(lat, lng, t.lat, t.lng);
    if (d <= t.radius) return t;
  }
  return null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

In the `watchPosition` callback, replace the `if (simulatedTrack)` branch with
a real check: set `inGeofence = true` and `activeTrack = foundTrack` when a
track is found, and `inGeofence = false` when none match. Keep the "Simulate"
button visible only in a dev build (gate behind `import.meta.env.DEV`) so a
real user can't fake it.

### Server-side validation for score submission

Client-side geofence unlock is fine for *showing* the telemetry UI, but any
score submitted to the leaderboard must be validated server-side, because a
client can be modified. Provide an **Edge Function** (or a Postgres RPC with
`security definer`) that the client calls to submit a `drive_event`:

```
POST /functions/v1/submit-drive
 body: { trackId, startedAt, endedAt, distanceMi, topSpeedMph,
         maxGForce, lapTimeMs, safetyEvents,
         witness: { lat, lng, ts }[] }   // a few sampled GPS points during the session
```

The function:
1. Authenticates the user (Supabase passes the JWT automatically).
2. Checks the sampled GPS points actually fall within `trackId`'s geofence
   (server-side haversine). Rejects if not.
3. Sanity-checks the claimed `topSpeedMph`/`lapTimeMs` against plausible
   bounds for the track (e.g. no 300 mph at Laguna Seca).
4. Inserts a `drive_events` row.
5. Bumps `user_stats` (top speed, track days, weekly mileage) and lets the
   daily leaderboard job pick it up.

This is the minimum anti-cheat for v1. Full telemetry integrity is a later
non-goal.

### Hardcoded telemetry to replace

`TrackMode.tsx` shows `1.2 G` (lat G-force) and `1:42.05` (lap time) as
literals. Replace with values computed from the GPS stream (or, for v1,
with `null`/"—" until real derivation exists). At minimum, make them clearly
placeholders so they don't pretend to be real.

---

## 8. Meetups

`Meetups.tsx` renders `MOCK_MEETUPS` and has a read-only "Live Event Scout"
that calls Gemini directly (key-in-client problem — see §4). Plan:

- Create the `meetups` table (§3). Seed it with the current `MOCK_MEETUPS`
  rows (adjust `time` from strings like `"Tonight, 10:00 PM"` to real
  `timestamptz`).
- Make the table **writable by admins/organizers** (RLS: all authenticated
  can read; owner-admin or a designated `is_organizer` profile flag can
  write). The UI for creating a meetup is out of scope for v1 — the owner can
  insert via the Supabase dashboard or a simple admin form later. The list
  the app shows becomes real data.
- The **AI "Live Event Scout"** stays a read-only Gemini call, but routed
  through the `gemini-proxy` Edge Function (§4). Add an optional "Save to
  Meetups" affordance: when the proxy returns scouted events, the UI can call
  a second function or RPC that inserts them as `meetups` rows (marked with
  a source flag, e.g. `created_by = <admin>`, so the owner can review). This
  turns the scout from a novelty into a real event-discovery tool.

---

## 9. Persistence

`user_stats` and `profiles` live in Postgres. Concretely:

- `Dashboard.tsx` currently imports `USER_STATS` (hardcoded) and renders
  `{USER_STATS.weeklyMileage}` etc. Replace the import with a Supabase
  query on the current user's `user_stats` row. If no row exists (new user),
  treat all values as 0.
- `App.tsx` holds `user` in `useState` and `handleSaveProfile` writes it to
  local state. Replace with: on auth state change, load the `profiles` row;
  `handleSaveProfile` does `supabase.from('profiles').update({...}).eq('id',
  session.user.id)` and updates local state from the returned row.
- The Profile screen's **"Progress stored locally"** label (shown when
  `!isSignedIn`) becomes truthful: once signed in, stats are cloud-synced.
  When signed out, the guest has no `profiles` row and the label can read
  "Sign in to save progress" — accurate, not false.

---

## 10. Implementation phases

Each phase is independently shippable. Effort tags: S = small (an evening),
M = medium (a weekend), L = large (a focused week).

### Phase 1 — Auth + profiles + persistence (M)

- Tables: `profiles`, `user_stats`.
- Supabase Auth (email/password). `onAuthStateChange` wiring in `App.tsx`.
- `Profile.tsx` "Sign In" button → real auth. Remove
  `handleToggleSignIn`'s fake toggle.
- `handleSaveProfile` writes to `profiles`.
- `Dashboard.tsx` reads `user_stats` instead of `USER_STATS`.
- **Becomes functional:** sign in persists across refresh; profile edits
  save to the cloud; dashboard stats are real (initially 0 until driving
  events exist).

### Phase 2 — Groups + realtime chat (M)

- Tables: `groups`, `group_members`, `messages`.
- `Groups.tsx`: `handleCreateGroup`, `handleJoinPublic`, and
  `handleJoinPrivateGroup` all become Supabase inserts. The "Your Crews" and
  "Discover Public Crews" lists become queries with the derived
  `isJoined`/`members`/`userRank` fields.
- Replace `handleSendMessage`'s `setTimeout` canned reply with a
  `supabase.from('messages').insert(...)` and a Realtime subscription.
- Remove `MOCK_GROUPS` and `MOCK_CHAT_MESSAGES`.
- **Becomes functional:** groups and chat survive refresh and work between
  two devices/users in real time.

### Phase 3 — Leaderboard + scoring (M)

- Tables: `leaderboard_entries`, `drive_events` (schema only; writes come in
  Phase 4).
- pg_cron / scheduled Edge Function for daily aggregation + weekly reset
  (§6).
- `App.tsx` `LeaderboardView` queries `leaderboard_entries` instead of
  `MOCK_LEADERBOARD_SPEED`/`SAFETY`.
- Until Phase 4 feeds real `drive_events`, the leaderboard will be empty —
  seed it with historical/mock rows or accept an empty state for the demo.
- **Becomes functional:** leaderboard reflects real data and resets weekly.

### Phase 4 — Geofence + track times (L)

- `tracks` table seeded from `MOCK_TRACKS` (already has lat/lng/radius).
- `TrackMode.tsx`: replace `toggleSimulation`/`handleAdminOverride` unlock
  with the client-side `isInAnyTrackGeofence` check (§7). Gate the old
  simulate button behind `import.meta.env.DEV`.
- Replace hardcoded `1.2 G` and `1:42.05` with derived/placeholder values.
- `submit-drive` Edge Function for validated score submission (§7).
- `drive_events` inserts begin feeding `user_stats` and the leaderboard.
- **Becomes functional:** Track Mode unlocks only at real circuits; lap
  times and top speeds submit to the leaderboard with anti-cheat validation.

### Phase 5 — Gemini proxy + events (M)

- `gemini-proxy` Edge Function (§4).
- `Meetups.tsx` `handleScoutEvents` calls the proxy instead of
  `new GoogleGenAI({ apiKey: process.env.API_KEY })` in the browser.
- `TrackMode.tsx` `findNearestTrack` likewise routes through the proxy.
- `meetups` table seeded; the list the UI renders comes from the DB, not
  `MOCK_MEETUPS`. Optional "Save scouted event to meetups" RPC.
- Decide on the voice crew chief (see open questions) — either keep it
  client-local-only or build a relay. Do not ship the key in the bundle.
- **Becomes functional:** AI features work without leaking the Gemini key;
  meetups are real data.

---

## 11. Cost & limits

### Supabase free tier (as of writing)

- 500 MB Postgres, 1 GB bandwidth, 50,000 monthly active users (MAU) on Auth,
  200 concurrent Realtime connections, 500 MB Storage, 2 free Edge
  Functions, 2 scheduled functions. Plenty for a personal/small-community
  app. The first paid tier (~$25/mo) raises these substantially if needed.
- Risk: Realtime connections are the likely first ceiling if chat gets
  popular. Monitor the dashboard; upgrade only when necessary.

### Gemini API cost

- **Text (2.5 Flash, used by Meetups scout + TrackMode nearest-track):**
  cheap. Flash is the low-cost model; a scout or nearest-track call is a few
  hundred tokens. Even daily use by a handful of users is cents per month.
- **Live audio (crew chief, `gemini-2.5-flash-native-audio-preview`):**
  audio-in/audio-out streaming is materially more expensive than text. A
  10-minute voice session can cost more than hundreds of text searches.
  This is the feature most likely to surprise the owner with a bill.

### Key-abuse risk

Leaving `API_KEY` in the Vite bundle (current state) means anyone who opens
the app can extract it from the served JS and use it for their own Gemini
calls — including the expensive Live audio model. **This must be fixed
before the app is public.** The `gemini-proxy` Edge Function (Phase 5) is
the fix; until then, keep the app private (not deployed publicly) or remove
the Gemini calls from the build.

---

## 12. Open questions for the owner

These are decisions only you can make. They materially shape the build.

1. **Real accounts / public app, or just personal use?** Do you want this to
   be a real multi-user app anyone can sign up for, or a personal tool for
   you and a few friends? This changes whether RLS needs to be strict and
   whether the Gemini proxy is urgent. (If only you use it, the key-in-client
   is less catastrophic; if public, it's a blocker.)

2. **Is the voice crew chief worth the Gemini cost?** The Live audio model is
   the most expensive feature by far. Are you willing to pay for per-minute
   audio streaming, or should it stay a local-only demo / be cut from v1?

3. **Leaderboard scope: global or friend-only?** Should rankings be everyone
   on the app, or scoped to your groups/friends? Global is simpler to build
   but less interesting with few users; friend-only needs a social graph
   (which `group_members` partially provides).

4. **Who can create meetups?** Just you (single admin), or a broader set of
   organizers? This decides whether v1 needs an organizer role/flag or can
   use the Supabase dashboard for inserts.

5. **Real track catalog, or just the two in `MOCK_TRACKS`?** Geofence
   detection only works for tracks in the `tracks` table. Do you want to
   curate a larger list yourself, scrape a public catalog, or keep the two
   for now and add more as needed?

---

*End of document. This scopes the backend; it does not modify any source.*