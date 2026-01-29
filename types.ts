
export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  TRACK = 'TRACK',
  CRUISE = 'CRUISE',
  MEETUPS = 'MEETUPS',
  LEADERBOARD = 'LEADERBOARD',
  PROFILE = 'PROFILE',
  GROUPS = 'GROUPS',
}

export interface UserProfile {
  username: string;
  car: string;
  avatar: string;
  isSignedIn: boolean;
  email?: string;
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
