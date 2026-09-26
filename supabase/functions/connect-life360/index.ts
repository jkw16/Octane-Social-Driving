// Supabase Edge Function: connect-life360
//
// Validates a user's Life360 credentials, stores them encrypted (AES-GCM, key
// in Deno env — never in the client bundle, never sent to the DB as a key),
// and flips profiles.life360_connected. Also handles {action:'disconnect'}.
//
// This is the make-or-break GATE: if Life360 blocks auth (Cloudflare/2FA/bad
// creds) we return a clear error and store nothing — the feature cannot
// proceed until auth works against the owner's real account.
//
// Deploy:
//   supabase functions deploy connect-life360 --no-verify-jwt --project-ref <ref>
// Requires secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// LIFE360_ENC_KEY (and optionally LIFE360_CLIENT_TOKEN / LIFE360_USER_AGENT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authenticate,
  findOwnerCircleMember,
  encrypt,
  Life360Error,
} from '../_shared/life360.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server not configured (missing Supabase env).' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing auth token.' }, 401);

  // Resolve the signed-in user from their JWT (same pattern as submit-drive).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }

  const admin = createClient(supabaseUrl, serviceKey);

  // --- Disconnect ----------------------------------------------------------
  if (body?.action === 'disconnect') {
    await admin.from('life360_credentials').delete().eq('user_id', user.id);
    await admin.from('profiles').update({ life360_connected: false }).eq('id', user.id);
    return json({ ok: true, connected: false });
  }

  // --- Connect (validate + store) -----------------------------------------
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return json({ error: 'Email and password required.' }, 400);

  // GATE: actually authenticate against Life360 and locate the owner's own
  // circle/member before storing anything. If this fails, we learn it here.
  let circleId: string, memberId: string, circleName: string;
  try {
    const { token, me } = await authenticate(email, password);
    if (!me.id) throw new Life360Error('auth_failed', 401, { note: 'no user id in token response' });
    const found = await findOwnerCircleMember(token, me);
    circleId = found.circleId;
    memberId = found.memberId;
    circleName = found.circleName;
  } catch (e: any) {
    const code = e instanceof Life360Error ? e.message : 'auth_failed';
    return json(
      {
        error: code,
        detail: e?.detail ?? undefined,
        userMessage:
          code === 'blocked_by_cloudflare'
            ? 'Life360 is blocking automated access (Cloudflare). The connector cannot proceed right now.'
            : code === 'auth_failed'
            ? 'Life360 rejected the login. Check your email/password — note SMS 2FA breaks this flow.'
            : code === 'no_circles' || code === 'no_member_found'
            ? 'Connected, but no circle/member was found for this account.'
            : 'Could not connect to Life360.',
      },
      502
    );
  }

  // Store encrypted creds + the owner's own circle/member.
  const passwordEnc = await encrypt(password);
  const { error: upErr } = await admin.from('life360_credentials').upsert(
    {
      user_id: user.id,
      email,
      password_enc: passwordEnc,
      circle_id: circleId,
      member_id: memberId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (upErr) return json({ error: 'Failed to store credentials.', detail: upErr.message }, 500);

  await admin.from('profiles').update({ life360_connected: true }).eq('id', user.id);

  return json({ ok: true, connected: true, circle: circleName });
});