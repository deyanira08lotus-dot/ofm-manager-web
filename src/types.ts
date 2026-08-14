/**
 * src/types.ts
 * Modelo de datos compartido cliente <-> Firestore <-> Cloud Functions.
 * Mantener sincronizado con firebase/functions/index.js
 */

export type PositionCode =
  | "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";

export type PositionGroup = "POR" | "DEF" | "MED" | "DEL";

export type PlayerClass = "SS" | "S" | "A" | "B" | "C" | "D";

export type Foot = "Derecho" | "Izquierdo" | "Ambidiestro";

export interface Attributes {
  // Técnicas
  finishing: number;
  passing: number;
  dribbling: number;
  crossing: number;
  firstTouch: number;
  heading: number;
  tackling: number;
  marking: number;
  longShots: number;
  setPieces: number;
  // Físicas
  pace: number;
  acceleration: number;
  stamina: number;
  strength: number;
  agility: number;
  jumping: number;
  // Mentales
  vision: number;
  composure: number;
  workRate: number;
  positioning: number;
  decisions: number;
  leadership: number;
  aggression: number;
  concentration: number;
  // Portero
  reflexes: number;
  handling: number;
  aerialReach: number;
  kicking: number;
  oneOnOne: number;
  communication: number;
}

export type AttributeKey = keyof Attributes;

export interface Contract {
  /** Fecha (ISO) de fin de contrato en tiempo de juego */
  expires: string;
  /** Salario semanal */
  wage: number;
  /** Cláusula de rescisión */
  releaseClause: number;
  /** Prima por gol/partido */
  bonusPerGoal: number;
  signedOn: string;
}

export interface PlayerSeasonStats {
  seasonId: string;
  clubId: string;
  apps: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellow: number;
  red: number;
  minutes: number;
  avgRating: number;
}

export interface HistoryEntry {
  date: string;
  type: "transfer" | "debut" | "injury" | "award" | "contract" | "milestone" | "academy" | "draft" | "generated";
  text: string;
}

export interface Injury {
  name: string;
  daysOut: number;
  since: string;
}

export interface Player {
  id: string;
  clubId: string | null;
  ownerUid: string | null;
  name: string;
  nationality: string;         // código país
  secondNationality?: string | null;
  birthDate: string;           // ISO (tiempo de juego)
  age: number;
  position: PositionCode;
  secondaryPositions: PositionCode[];
  foot: Foot;
  attributes: Attributes;
  overall: number;             // nivel actual (1-99)
  potential: number;           // potencial (1-99)
  potentialClass: PlayerClass;
  personality: string;
  playStyle: string;
  form: number;                // 0-100
  morale: number;              // 0-100
  fitness: number;             // 0-100 (fatiga inversa)
  experience: number;          // 0-100
  reputation: number;          // 0-100
  popularity: { local: number; national: number; international: number };
  value: number;
  contract: Contract;
  injury: Injury | null;
  trainingFocus?: AttributeKey | null;
  squadRole: "Estrella" | "Titular" | "Rotación" | "Suplente" | "Promesa";
  stats: PlayerSeasonStats;
  careerTotals: { apps: number; goals: number; assists: number; trophies: number };
  history: HistoryEntry[];
  status: "active" | "retired" | "free";
  createdAt: number;
  /** Origen: para trazabilidad anti-duplicación */
  origin: "generated" | "academy" | "draft" | "transfer" | "free";
  seed: string;
}

export interface FacilityState {
  key: string;
  level: number;
  maxLevel: number;
  upgrading: null | { toLevel: number; finishesAt: string; cost: number };
}

export interface Stadium {
  name: string;
  capacity: number;
  level: number;
  pitchQuality: number;
  ticketPrice: number;
  seats: { general: number; premium: number; vip: number };
  upgrading: null | { toLevel: number; finishesAt: string; cost: number };
}

export interface StaffMember {
  id: string;
  role: string;
  name: string;
  nationality: string;
  age: number;
  level: number;      // 1-99
  potential: number;
  experience: number;
  specialities: string[];
  personality: string;
  wage: number;
  contractExpires: string;
}

export interface Finances {
  balance: number;
  wageBudget: number;
  transferBudget: number;
  weeklyIncome: number;
  weeklyExpense: number;
  sponsorship: { name: string; weekly: number; expires: string } | null;
  ledger: { date: string; concept: string; amount: number; type: "in" | "out" }[];
  /** Momento (ms de tiempo de juego) hasta el que se han cobrado las semanas */
  lastProcessedAt?: number;
}

export interface Fanbase {
  followers: number;
  loyalty: number;       // 0-100
  satisfaction: number;  // 0-100
  expectation: string;
  favouritePlayerIds: string[];
}

export interface Tactics {
  formation: string;
  mentality: "Muy defensiva" | "Defensiva" | "Equilibrada" | "Ofensiva" | "Muy ofensiva";
  tempo: number;        // 0-100
  pressing: number;     // 0-100
  width: number;        // 0-100
  passingStyle: "Corto" | "Mixto" | "Directo";
  lineup: Record<string, string | null>; // slot -> playerId
  bench: string[];
  captainId: string | null;
  penaltyTakerId: string | null;
}

export interface Club {
  id: string;
  ownerUid: string;
  managerName: string;
  name: string;
  shortName: string;
  country: string;
  leagueId: string;
  division: number;
  founded: number;
  colors: { primary: string; secondary: string };
  reputation: number;      // 0-100
  stadium: Stadium;
  facilities: Record<string, FacilityState>;
  finances: Finances;
  fanbase: Fanbase;
  tactics: Tactics;
  board: { confidence: number; objective: string; patience: number; chairman: string };
  training: { intensity: number; focus: string };
  squadSize: number;
  seasonId: string;
  record: { played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number };
  trophies: { competition: string; season: string }[];
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  managerName: string;
  clubId: string | null;
  country: string | null;
  managerLevel: number;
  managerXp: number;
  reputation: number;
  achievements: string[];
  createdAt: number;
  lastSeen: number;
}

export interface NewsItem {
  id: string;
  clubId: string;
  date: string;
  category: "club" | "mercado" | "partido" | "academia" | "draft" | "finanzas" | "seleccion" | "sistema";
  title: string;
  body: string;
  read: boolean;
  important?: boolean;
}
