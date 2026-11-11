export type GamePhase =
  | 'Login'
  | 'WaitingRoom'
  | 'Playing'
  | 'EliminationReport'
  | 'Spectator'
  | 'Podium';

export type UserRole = 'student' | 'admin';

export type AvatarId = 'Rimbi' | 'Samudra' | 'Surya' | 'Kirana';

export interface AvatarPreset {
  id: AvatarId;
  displayName: string;
  roleTitle: string;
  shirtHex: number;
  shirtCss: string;
  pantsHex: number;
  hatHex: number;
  skinHex: number;
  accentHex: number;
}

export interface LevelConfig {
  index: 1 | 2 | 3;
  name: string;
  subtitle: string;
  cognitiveTier: string;
  durationSeconds: number;
  pointsPerCorrect: number;
  activeBoxCount: number;
  skyColor: number;
  fogColor: number;
  groundColor: number;
  platformColor: number;
  accentColor: number;
}

export type QuestionSubject = 'Matematika' | 'Bahasa Indonesia' | 'IPA' | 'PPKn' | 'IPS';

export interface QuizQuestion {
  id: string;
  level: 1 | 2 | 3;
  subject: QuestionSubject;
  cognitiveTag: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

export type QuestionBankMap = Record<1 | 2 | 3, QuizQuestion[]>;

export interface ClientQuizQuestion {
  id: string;
  level: 1 | 2 | 3;
  subject: QuestionSubject;
  cognitiveTag: string;
  question: string;
  options: [string, string, string, string];
}

export interface PlayerRecord {
  id: string;
  name: string;
  avatarId: AvatarId;
  score: number;
  status: 'Playing' | 'Eliminated';
  correctCount: number;
  eliminatedAtLevel?: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  moving: boolean;
  grounded: boolean;
}

export interface ActiveQuizSession {
  boxId: string;
  question: ClientQuizQuestion;
}

export interface QuizFeedbackState {
  id: number;
  isCorrect: boolean;
  title: string;
  detail: string;
}

export interface EliminationSummary {
  completedLevel: 1 | 2;
  nextLevel: 2 | 3;
  eliminatedPlayers: PlayerRecord[];
  survivorCount: number;
}

export interface ServerRoomSnapshot {
  serverPhase: 'WaitingRoom' | 'Playing' | 'EliminationReport' | 'Podium';
  currentLevel: 1 | 2 | 3;
  timeLeft: number;
  players: PlayerRecord[];
  adminConnectedCount: number;
  eliminationSummary: EliminationSummary | null;
  topThree: PlayerRecord[];
  openedBoxIds: string[];
  questionCounts: Record<1 | 2 | 3, number>;
}

export interface RadarPlatformRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RadarBoxPoint {
  id: string;
  x: number;
  z: number;
  opened: boolean;
}

export interface RadarPlayerPoint {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface RadarSnapshot {
  localPlayer: { x: number; z: number; yaw: number } | null;
  remotePlayers: RadarPlayerPoint[];
  boxes: RadarBoxPoint[];
  platforms: RadarPlatformRect[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  timestamp: number;
}
