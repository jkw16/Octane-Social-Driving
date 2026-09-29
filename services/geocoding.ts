// Places lookup — one swappable module for map/places queries.
//
// Today every AI places lookup goes through the Gemini proxy Edge Function
// with the `googleMaps` grounding tool (requires sign-in). Centralizing the
// prompt, session check and response parsing here means a future provider
// (SerpAPI, Nominatim, Supabase RPC over OSM) is a change to one file, not
// one rewrite per screen.

import { supabase } from '../supabase/client';
import { geminiGenerate, responseText, responseChunks } from '../supabase/gemini';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ResolvedPlace {
  name: string;
  uri: string;
  /** Human-readable driving distance, when the provider reports one. */
  distance?: string;
}

const sessionLatLng = (loc?: LatLng) =>
  loc ? { latitude: loc.lat, longitude: loc.lng } : undefined;

/** Pick the first maps/web grounding chunk, falling back to first text line. */
const fromGrounding = (
  response: Parameters<typeof responseText>[0],
  fallbackName: string
): { name: string; uri: string; text: string } => {
  const chunks = responseChunks(response);
  const mapChunk = chunks?.find((c: any) => c.web?.title || c.web?.uri);
  const text = responseText(response);
  if (mapChunk?.web) {
    return { name: mapChunk.web.title || fallbackName, uri: mapChunk.web.uri || '', text };
  }
  return { name: text.split('\n')[0] || fallbackName, uri: '', text };
};

/** Search a free-text place, biased to `loc` when provided. */
export async function resolvePlaceNear(
  query: string,
  loc?: LatLng
): Promise<ResolvedPlace> {
  const response = await geminiGenerate({
    contents: `Find the specific location for: "${query}". If it's a generic term like "gas" or "coffee", find the nearest one. Provide the name and address.`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: { retrievalConfig: { latLng: sessionLatLng(loc) } },
    },
  });
  const { name, uri } = fromGrounding(response, query);
  return { name, uri };
}

/**
 * Nearest real automotive race circuit — road course or closed circuit for
 * full-size cars (never karts, karting centers, fun centers, amusement parks).
 */
export async function findNearestRaceTrack(loc: LatLng): Promise<ResolvedPlace> {
  const response = await geminiGenerate({
    contents:
      'Find the single nearest automotive race track — a real road course or racing ' +
      'circuit built for full-size automobiles (cars), not karts. Strictly EXCLUDE ' +
      'go-kart tracks, karting centers, family fun centers (like Bob-O’s), amusement ' +
      'parks, and anything that is not an automotive road course or closed circuit for ' +
      'cars. Calculate the driving distance.',
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: { retrievalConfig: { latLng: sessionLatLng(loc) } },
    },
  });
  const { name, uri, text } = fromGrounding(response, 'Nearest Circuit');
  const distanceMatch = text.match(/(\d+(\.\d+)?)\s*(miles|mi|km)/i);
  return { name, uri, distance: distanceMatch ? distanceMatch[0] : undefined };
}

/**
 * True when a signed-in session exists — AI places calls are proxied through
 * the gemini-proxy Edge Function, which verifies the Supabase JWT. Guests
 * skip the lookup silently (screens treat "null" as "no data").
 */
export async function hasAiPlacesSession(): Promise<boolean> {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}