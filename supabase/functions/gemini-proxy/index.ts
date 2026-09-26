// Supabase Edge Function: gemini-proxy
// Holds the Gemini API key server-side and forwards generateContent calls from
// the client, so the key never ships in the client bundle. Deploy with JWT
// verification ON (default) — only signed-in users can reach Gemini, which is
// the v1 abuse control.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=<your key> --project-ref <ref>
//   supabase functions deploy gemini-proxy --project-ref <ref> --use-api
//
// Body: { model: string, contents: string | Content[], config?: object }
// Returns: the raw GenerateContentResponse JSON (candidates, groundingMetadata).
// The client extracts text via responseText() and chunks via responseChunks()
// (see supabase/gemini.ts) — the SDK's `.text` getter does not survive JSON.

import { GoogleGenAI } from 'https://esm.sh/@google/genai';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'Server missing GEMINI_API_KEY secret.' }, 500);

  let body: { model?: string; contents: unknown; config?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!body.contents) return json({ error: 'contents required.' }, 400);

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: body.model ?? 'gemini-3.6-flash',
      contents: body.contents as any,
      config: body.config as any,
    });
    // Serialize the real data fields (candidates, groundingMetadata). The SDK's
    // `.text` getter is not enumerable and is dropped by JSON.stringify, so the
    // client reads candidates[].content.parts[].text instead.
    return json(response);
  } catch (e: any) {
    return json({ error: 'Gemini call failed.', detail: e?.message ?? String(e) }, 502);
  }
});