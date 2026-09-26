
export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  TRACK = 'TRACK',
  CRUISE = 'CRUISE',
  MEETUPS = 'MEETUPS',
  LEADERBOARD = 'LEADERBOARD',
  PROFILE = 'PROFILE',
  GROUPS = 'GROUPS',
  VOICE = 'VOICE',
}

export type VehicleClass =
  | 'Muscle Car'
  | 'Euro'
  | 'JDM'
  | 'Overlander'
  | 'Baja Built'
  | 'Supercar'
  | 'Hypercar'
  | 'Stance Car'
  | 'Other';

export interface UserProfile {
  username: string;
  car: string;
  avatar: string;
  isSignedIn: boolean;
  email?: string;
  vehicleClass?: VehicleClass;
  customVehicleClass?: string;
  // Life360 connector state (server-managed; surfaced for the Connect card).
  life360Connected?: boolean;
  life360SyncedAt?: string | null;
}

export interface Track {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  radius: number; // in meters
  recordHolder: string;
  recordSpeed: number;
}

export interface Meetup {
  id: string;
  title: string;
  location: string;
  time: string;
  attendees: number;
  type: 'Chill' | 'Race' | 'Show';
  lat: number;
  lng: number;
  description: string;
  isJoined?: boolean;
  isHost?: boolean;
  endedAt?: string; // set when the host ends the event (moved to the archive)
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar: string;
  car: string;
  score: number; // Can be speed or safety points
  mode: 'Track' | 'Safety' | 'Endurance';
}

export interface UserStats {
  weeklyMileage: number;
  safetyScore: number;
  topSpeed: number;
  trackDays: number;
}

// A single recorded track/drive session. Built by the Session Recorder on the
// Track page from one Start → Stop cycle of the GPS watch.
export interface SessionResult {
  distance: number;  // miles travelled (Haversine between GPS fixes)
  duration: number;   // elapsed seconds
  topSpeed: number;   // fastest MPH observed during the session
  avgSpeed: number;   // MPH = distance / duration (0 if duration is 0)
  date: string;       // ISO timestamp of when the session was saved
}

export interface Group {
  id: string;
  name: string;
  members: number;
  image: string;
  description: string;
  isJoined: boolean;
  userRank?: string;
  isPrivate?: boolean; // New
  inviteCode?: string; // New (for private groups)
}

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: string;
  isMe: boolean;
  senderRank?: string;
}
