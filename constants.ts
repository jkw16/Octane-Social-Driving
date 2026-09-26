import { UserStats } from './types';

// === Gemini model config ===
// Centralized so a model deprecation is a one-line fix, not a multi-file hunt.
// Verify available models with:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
export const GEMINI_MODEL = 'gemini-3.6-flash'; // generateContent: Event Scout, Smart Search, Nearest Track
export const GEMINI_LIVE_AUDIO_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'; // bidiGenerateContent: Live Voice

// Default user stats. All zero until real trip tracking lands — no fabricated numbers.
export const USER_STATS: UserStats = {
  weeklyMileage: 0,
  safetyScore: 0,
  topSpeed: 0,
  trackDays: 0
};