
import { LeaderboardEntry, Meetup, Track, UserStats, Group, ChatMessage } from './types';

// Mock Tracks (using generic coordinates for demo purposes)
export const MOCK_TRACKS: Track[] = [
  {
    id: 't1',
    name: 'Silverstone Circuit',
    location: 'Towcester, UK',
    lat: 52.0733,
    lng: -1.0147,
    radius: 2000,
    recordHolder: 'SpeedDemon99',
    recordSpeed: 184
  },
  {
    id: 't2',
    name: 'Laguna Seca',
    location: 'Salinas, CA',
    lat: 36.5841,
    lng: -121.7535,
    radius: 1500,
    recordHolder: 'ApexHunter',
    recordSpeed: 142
  }
];

export const MOCK_MEETUPS: Meetup[] = [
  {
    id: 'm1',
    title: 'Midnight Runners Meet',
    location: 'Downtown Docklands',
    time: 'Tonight, 10:00 PM',
    attendees: 42,
    type: 'Chill',
    lat: 34.0522,
    lng: -118.2437,
    description: 'Casual meetup for JDM enthusiasts. No revving, strict rules.'
  },
  {
    id: 'm2',
    title: 'Sunday Morning Drive',
    location: 'Canyon Cafe',
    time: 'Sun, 7:00 AM',
    attendees: 15,
    type: 'Race',
    lat: 34.0622,
    lng: -118.2537,
    description: 'Spirited drive through the canyons. Euro cars preferred.'
  },
  {
    id: 'm3',
    title: 'Cars & Coffee',
    location: 'Westside Plaza',
    time: 'Sat, 8:00 AM',
    attendees: 120,
    type: 'Show',
    lat: 34.0722,
    lng: -118.2637,
    description: 'The big monthly show. Bring your classics.'
  }
];

export const MOCK_LEADERBOARD_SPEED: LeaderboardEntry[] = [
  { rank: 1, username: 'DriftKing', avatar: 'https://picsum.photos/32/32?random=1', car: 'Nissan GT-R', score: 195, mode: 'Track' },
  { rank: 2, username: 'V8Master', avatar: 'https://picsum.photos/32/32?random=2', car: 'Mustang GT', score: 188, mode: 'Track' },
  { rank: 3, username: 'RotaryHead', avatar: 'https://picsum.photos/32/32?random=3', car: 'RX-7 FD', score: 182, mode: 'Track' },
];

export const MOCK_LEADERBOARD_SAFETY: LeaderboardEntry[] = [
  { rank: 1, username: 'CaptainSlow', avatar: 'https://picsum.photos/32/32?random=4', car: 'Volvo 240', score: 998, mode: 'Safety' },
  { rank: 2, username: 'SafeDriver22', avatar: 'https://picsum.photos/32/32?random=5', car: 'Honda Civic', score: 950, mode: 'Safety' },
  { rank: 3, username: 'SmoothOperator', avatar: 'https://picsum.photos/32/32?random=6', car: 'Lexus LS', score: 945, mode: 'Safety' },
];

export const USER_STATS: UserStats = {
  weeklyMileage: 342,
  safetyScore: 89, // Out of 100
  topSpeed: 145,
  trackDays: 4
};

export const MOCK_GROUPS: Group[] = [
  {
    id: 'g1',
    name: 'NightRunners',
    members: 128,
    image: 'https://picsum.photos/200/200?random=100',
    description: 'Late night highway cruises. High vibes, low gears.',
    isJoined: true,
    userRank: 'Veteran',
    isPrivate: false
  },
  {
    id: 'g2',
    name: 'Euro Spec Club',
    members: 450,
    image: 'https://picsum.photos/200/200?random=101',
    description: 'BMW, Audi, Mercedes owners only. Weekly track days.',
    isJoined: false,
    isPrivate: false
  },
  {
    id: 'g3',
    name: 'JDM Legends',
    members: 89,
    image: 'https://picsum.photos/200/200?random=102',
    description: 'Celebrating 90s Japanese engineering.',
    isJoined: false,
    isPrivate: false
  },
  {
    id: 'g4',
    name: 'Midnight VIP',
    members: 12,
    image: 'https://picsum.photos/200/200?random=105',
    description: 'Invite only. Top speed runs.',
    isJoined: false,
    isPrivate: true,
    inviteCode: 'VIP'
  }
];

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  { id: '1', sender: 'TurboTom', avatar: 'https://picsum.photos/32/32?random=20', text: 'Who is heading out to the canyons tonight?', timestamp: '8:42 PM', isMe: false, senderRank: 'Moderator' },
  { id: '2', sender: 'ApexGirl', avatar: 'https://picsum.photos/32/32?random=21', text: 'I might be down if I can get my tires changed in time.', timestamp: '8:45 PM', isMe: false, senderRank: 'Veteran' },
];
