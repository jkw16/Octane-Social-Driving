import { supabase } from './client';
import { GEMINI_MODEL } from '../constants';

// Client wrapper for the gemini-proxy Edge Function. The Gemini key lives
// server-side (as a function secret); the client never sees it. Requires a
// signed-in session (the deployed function has JWT verification ON).
export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> };
  }>;
  [k: string]: unknown;
}

export async function geminiGenerate(opts: {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
}): Promise<GeminiResponse> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: {
      model: opts.model ?? GEMINI_MODEL,
      contents: opts.contents,
      config: opts.config,
    },
  });
  if (error) throw error;
  if (data && (data as any).error) throw new Error((data as any).error);
  return data as GeminiResponse;
}

// Replaces the SDK's response.text getter (which doesn't survive JSON).
export const responseText = (resp: GeminiResponse): string =>
  resp.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

export const responseChunks = (resp: GeminiResponse): Array<{ web?: { title?: string; uri?: string } }> =>
  resp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];