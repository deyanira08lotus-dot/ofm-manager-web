/**
 * src/game/national.ts
 * SELECCIONES NACIONALES (FASE 8).
 * - Categorías Sub-15, Sub-17, Sub-20 y Absoluta.
 * - Elegibilidad por nacionalidad (principal o segunda).
 * - Candidaturas de seleccionador: los managers que cumplen requisitos se postulan.
 * - Votación entre managers; el más votado dirige durante un mandato.
 * - Convocatorias, amistosos, torneos y ranking mundial.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player, PositionCode, UserProfile } from "@/types";
import { COUNTRIES, COUNTRY_BY_CODE } from "./data/countries";
import { POSITION_MAP } from "./data/traits";
import { Rng, clamp, uid } from "./rng";
import { quickSim } from "./match";
import { addDays, gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type NtCategory = "U15" | "U17" | "U20" | "ABS";

export interface CategoryInfo {
  key: NtCategory;
  label: string;
  maxAge: number;
  /** Reputación mínima del manager para postularse */
  minReputation: number;
  squadSize: number;
}

export const NT_CATEGORIES: CategoryInfo[] = [
  { key: "U15", label: "Sub-15", maxAge: 15, minReputation: 10, squadSize: 18 },
  { key: "U17", label: "Sub-17", maxAge: 17, minReputation: 22, squadSize: 20 },
  { key: "U20", label: "Sub-20", maxAge: 20, minReputation: 38, squadSize: 22 },
  { key: "ABS", label: "Absoluta", maxAge: 99, minReputation: 55, squadSize: 23 },
];

export function categoryInfo(key: NtCategory): CategoryInfo {
  return NT_CATEGORIES.find((c) => c.key === key) ?? NT_CATEGORIES[0];
}

export interface Candidacy {
  id: string;
  uid: string;
  managerName: string;
  clubName: string;
  reputation: number;
  manifesto: string;
  votes: number;
  isUser: boolean;
}

export interface NtCoach {
  uid: string;
  managerName: string;
  clubName: string;
  isUser: boolean;
  /** Fin del mandato (ISO tiempo de juego) */
  termEnds: string;
  matches: number;
  won: number;
  drawn: number;
  lost: number;
}

export interface CallUp {
  playerId: string;
  name: string;
  position: PositionCode;
  overall: number;
  age: number;
  clubName: string;
  caps: number;
  goals: number;
}

export interface NtMatch {
  id: string;
  date: string;
  category: NtCategory;
  rivalCode: string;
  rivalName: string;
  competition: string;
  homeGoals: number;
  awayGoals: number;
  scorers: string[];
  home: boolean;
}

export interface NtTeamState {
  category: NtCategory;
  coach: NtCoach | null;
  /** Elección en curso */
  election: {
    id: string;
    closesAt: string;
    candidacies: Candidacy[];
    /** uid -> candidacyId */
    votedBy: Record<string, string>;
    resolved: boolean;
  } | null;
  callUps: string[];
  matches: NtMatch[];
  record: { played: number; won: number; drawn: number; lost: number; gf: number; ga: number };
  trophies: string[];
}

export interface NationalState {
  id: string;
  ownerUid: string;
  clubId: string;
  country: string;
  teams: Record<NtCategory, NtTeamState>;
  /** Estadísticas internacionales acumuladas por jugador */
  playerCaps: Record<string, { caps: number; goals: number }>;
  updatedAt: number;
}

export interface RankedNation {
  code: string;
  name: string;
  flag: string;
  points: number;
  trend: number;
}

/* ------------------------------------------------------------------ */
/* Ranking mundial                                                     */
/* ------------------------------------------------------------------ */

export function worldRanking(state: NationalState | null, country: string): RankedNation[] {
  const rng = new Rng(`worldrank:${Math.floor(gameNow().getTime() / (30 * 86400000))}`);
  const rows = COUNTRIES.map((c) => {
    const base = c.strength * 18 + rng.int(-90, 90);
    let points = base;
    // El rendimiento de la absoluta del usuario mueve su selección
    if (state && c.code === country) {
      const abs = state.teams.ABS.record;
      points += abs.won * 26 + abs.drawn * 8 - abs.lost * 14;
    }
    return { code: c.code, name: c.name, flag: c.flag, points: Math.max(120, Math.round(points)), trend: rng.int(-3, 3) };
  });
  return rows.sort((a, b) => b.points - a.points);
}

/* ------------------------------------------------------------------ */
/* Creación de estado                                                  */
/* ------------------------------------------------------------------ */

const MANIFESTOS = [
  "Apostaré por la cantera y un bloque joven y valiente.",
  "Bloque sólido, presión alta y resultados desde el primer día.",
  "Recuperaremos la identidad de nuestro fútbol.",
  "Convocatorias por mérito: quien rinda, juega.",
  "Proyecto a largo plazo con vistas al próximo ciclo.",
  "Máxima exigencia física y disciplina táctica.",
];

function aiCandidacies(rng: Rng, country: string, category: NtCategory, count: number): Candidacy[] {
  const c = COUNTRY_BY_CODE[country] ?? COUNTRIES[0];
  const info = categoryInfo(category);
  return Array.from({ length: count }, (_, i) => {
    const reputation = clamp(info.minReputation + rng.int(2, 34), 1, 99);
    return {
      id: `cd_${category}_${i}_${rng.int(1000, 9999)}`,
      uid: `ai_${category}_${i}`,
      managerName: `${rng.pick(c.first)} ${rng.pick(c.last)}`,
      clubName: `${rng.pick(["Atlético", "Real", "Sporting", "Unión", "Racing", "Deportivo"])} ${rng.pick(["Valmar", "Aurora", "Bahía", "Oriente", "Verdal", "Peñalba"])}`,
      reputation,
      manifesto: rng.pick(MANIFESTOS),
      votes: rng.int(2, 14),
      isUser: false,
    };
  });
}

function emptyTeam(category: NtCategory, country: string, rng: Rng): NtTeamState {
  const c = COUNTRY_BY_CODE[country] ?? COUNTRIES[0];
  // Arranca con un seleccionador de la IA y un mandato en curso
  const coachName = `${rng.pick(c.first)} ${rng.pick(c.last)}`;
  return {
    category,
    coach: {
      uid: `ai_coach_${category}`,
      managerName: coachName,
      clubName: "Federación",
      isUser: false,
      termEnds: addDays(gameNow(), 40 + rng.int(0, 40)).toISOString(),
      matches: rng.int(4, 22),
      won: 0, drawn: 0, lost: 0,
    },
    election: null,
    callUps: [],
    matches: [],
    record: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 },
    trophies: [],
  };
}

export function createNationalState(club: Club): NationalState {
  const rng = new Rng(`national:${club.country}`);
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    country: club.country,
    teams: {
      U15: emptyTeam("U15", club.country, rng),
      U17: emptyTeam("U17", club.country, rng),
      U20: emptyTeam("U20", club.country, rng),
      ABS: emptyTeam("ABS", club.country, rng),
    },
    playerCaps: {},
    updatedAt: Date.now(),
  };
}

/** Abre elecciones cuando expira un mandato */
export function refreshNational(state: NationalState): NationalState {
  const nowMs = gameNow().getTime();
  const next: NationalState = JSON.parse(JSON.stringify(state));
  let changed = false;

  for (const info of NT_CATEGORIES) {
    const team = next.teams[info.key];
    const expired = team.coach && Date.parse(team.coach.termEnds) <= nowMs;
    if ((expired || !team.coach) && !team.election) {
      const rng = new Rng(`election:${next.country}:${info.key}:${Math.floor(nowMs / 86400000)}`);
      team.coach = null;
      team.election = {
        id: uid("el"),
        closesAt: addDays(gameNow(), 7).toISOString(),
        candidacies: aiCandidacies(rng, next.country, info.key, rng.int(2, 4)),
        votedBy: {},
        resolved: false,
      };
      changed = true;
    }
  }
  if (changed) next.updatedAt = Date.now();
  return next;
}

/* ------------------------------------------------------------------ */
/* Elegibilidad y convocatorias                                        */
/* ------------------------------------------------------------------ */

export function isEligible(player: Player, country: string, category: NtCategory): boolean {
  const nat = player.nationality === country || player.secondNationality === country;
  if (!nat) return false;
  if (player.status !== "active") return false;
  return player.age <= categoryInfo(category).maxAge;
}

export function eligiblePlayers(players: Player[], country: string, category: NtCategory): Player[] {
  return players
    .filter((p) => isEligible(p, country, category))
    .sort((a, b) => b.overall * (0.85 + b.form / 400) - a.overall * (0.85 + a.form / 400));
}

export function toCallUp(p: Player, clubName: string, caps: { caps: number; goals: number } | undefined): CallUp {
  return {
    playerId: p.id,
    name: p.name,
    position: p.position,
    overall: Math.round(p.overall),
    age: p.age,
    clubName,
    caps: caps?.caps ?? 0,
    goals: caps?.goals ?? 0,
  };
}

export function toggleCallUp(
  state: NationalState,
  category: NtCategory,
  playerId: string
): { state: NationalState; error?: string } {
  const next: NationalState = JSON.parse(JSON.stringify(state));
  const team = next.teams[category];
  if (!team.coach?.isUser) return { state, error: "No diriges esta selección." };
  const info = categoryInfo(category);
  const has = team.callUps.includes(playerId);
  if (!has && team.callUps.length >= info.squadSize) {
    return { state, error: `Máximo ${info.squadSize} convocados en ${info.label}.` };
  }
  team.callUps = has ? team.callUps.filter((id) => id !== playerId) : [...team.callUps, playerId];
  next.updatedAt = Date.now();
  return { state: next };
}

export function autoCallUp(
  state: NationalState,
  category: NtCategory,
  players: Player[]
): NationalState {
  const next: NationalState = JSON.parse(JSON.stringify(state));
  const info = categoryInfo(category);
  const pool = eligiblePlayers(players, next.country, category);
  // Reparto equilibrado por líneas
  const quota: Record<string, number> = { POR: 3, DEF: 7, MED: 7, DEL: 6 };
  const picked: string[] = [];
  for (const group of ["POR", "DEF", "MED", "DEL"]) {
    const list = pool.filter((p) => POSITION_MAP[p.position].group === group);
    picked.push(...list.slice(0, quota[group]).map((p) => p.id));
  }
  for (const p of pool) {
    if (picked.length >= info.squadSize) break;
    if (!picked.includes(p.id)) picked.push(p.id);
  }
  next.teams[category].callUps = picked.slice(0, info.squadSize);
  next.updatedAt = Date.now();
  return next;
}

/* ------------------------------------------------------------------ */
/* Candidaturas y votación                                             */
/* ------------------------------------------------------------------ */

export interface ApplyResult {
  state: NationalState;
  error?: string;
}

export function canApply(profile: UserProfile | null, club: Club | null, category: NtCategory): { ok: boolean; reason?: string } {
  if (!profile || !club) return { ok: false, reason: "Sesión no válida." };
  const info = categoryInfo(category);
  if (club.reputation < info.minReputation) {
    return { ok: false, reason: `Necesitas ${info.minReputation} de reputación de club (tienes ${Math.round(club.reputation)}).` };
  }
  return { ok: true };
}

export function applyAsCoach(
  state: NationalState,
  category: NtCategory,
  profile: UserProfile,
  club: Club,
  manifesto: string
): ApplyResult {
  const next: NationalState = JSON.parse(JSON.stringify(state));
  const team = next.teams[category];
  if (!team.election) return { state, error: "No hay elecciones abiertas en esta categoría." };
  if (team.election.candidacies.some((c) => c.uid === profile.uid)) {
    return { state, error: "Ya has presentado tu candidatura." };
  }
  const check = canApply(profile, club, category);
  if (!check.ok) return { state, error: check.reason };

  team.election.candidacies.push({
    id: uid("cd"),
    uid: profile.uid,
    managerName: profile.managerName,
    clubName: club.name,
    reputation: Math.round(club.reputation),
    manifesto: manifesto.trim() || "Trabajo, mérito y resultados.",
    votes: 0,
    isUser: true,
  });
  next.updatedAt = Date.now();
  return { state: next };
}

export function castVote(
  state: NationalState,
  category: NtCategory,
  voterUid: string,
  candidacyId: string
): ApplyResult {
  const next: NationalState = JSON.parse(JSON.stringify(state));
  const team = next.teams[category];
  if (!team.election) return { state, error: "No hay elecciones abiertas." };
  if (team.election.votedBy[voterUid]) return { state, error: "Ya has votado en esta elección." };
  const candidacy = team.election.candidacies.find((c) => c.id === candidacyId);
  if (!candidacy) return { state, error: "Candidatura no encontrada." };

  candidacy.votes += 1;
  team.election.votedBy[voterUid] = candidacyId;
  next.updatedAt = Date.now();
  return { state: next };
}

export interface ResolveResult {
  state: NationalState;
  winner: Candidacy | null;
  userWon: boolean;
}

/** Cierra la elección: gana el más votado (desempate por reputación) */
export function resolveElection(state: NationalState, category: NtCategory): ResolveResult {
  const next: NationalState = JSON.parse(JSON.stringify(state));
  const team = next.teams[category];
  if (!team.election || team.election.resolved) return { state, winner: null, userWon: false };

  const rng = new Rng(`resolve:${next.country}:${category}:${team.election.id}`);
  // Voto simulado del resto de la comunidad, ponderado por reputación
  for (const c of team.election.candidacies) {
    if (!c.isUser) c.votes += Math.round(rng.float(0, 1) * (c.reputation / 12));
  }

  const winner = [...team.election.candidacies].sort(
    (a, b) => b.votes - a.votes || b.reputation - a.reputation
  )[0];
  if (!winner) return { state, winner: null, userWon: false };

  team.coach = {
    uid: winner.uid,
    managerName: winner.managerName,
    clubName: winner.clubName,
    isUser: winner.isUser,
    termEnds: addDays(gameNow(), 120).toISOString(),
    matches: 0, won: 0, drawn: 0, lost: 0,
  };
  team.election.resolved = true;
  team.election = null;
  next.updatedAt = Date.now();

  return { state: next, winner, userWon: winner.isUser };
}

/* ------------------------------------------------------------------ */
/* Partidos internacionales                                           */
/* ------------------------------------------------------------------ */

export interface PlayNtResult {
  state: NationalState;
  match: NtMatch | null;
  error?: string;
}

export function playInternational(
  state: NationalState,
  category: NtCategory,
  players: Player[],
  competition: "Amistoso" | "Clasificación" | "Torneo"
): PlayNtResult {
  const next: NationalState = JSON.parse(JSON.stringify(state));
  const team = next.teams[category];
  if (!team.coach?.isUser) return { state, match: null, error: "No diriges esta selección." };
  const info = categoryInfo(category);
  if (team.callUps.length < 11) {
    return { state, match: null, error: `Convoca al menos 11 jugadores (tienes ${team.callUps.length}).` };
  }

  const rng = new Rng(`ntmatch:${next.country}:${category}:${team.matches.length}:${Date.now()}`);
  const rivalData = rng.pick(COUNTRIES.filter((c) => c.code !== next.country));
  const squad = players.filter((p) => team.callUps.includes(p.id));
  const top11 = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  const ourRating = Math.round(top11.reduce((s, p) => s + p.overall, 0) / Math.max(1, top11.length));

  // Rivales según categoría: las inferiores tienen menos nivel absoluto
  const ageFactor = category === "ABS" ? 1 : category === "U20" ? 0.86 : category === "U17" ? 0.74 : 0.66;
  const rivalRating = clamp(Math.round(rivalData.strength * 0.72 * ageFactor + rng.int(-6, 8)), 20, 95);

  const home = rng.chance(0.5);
  const [a, b] = quickSim(ourRating, rivalRating, `nt:${next.country}:${category}:${team.matches.length}`);
  const ourGoals = a;
  const theirGoals = b;

  // Goleadores: se reparten entre los convocados con sesgo ofensivo
  const scorers: string[] = [];
  for (let i = 0; i < ourGoals; i++) {
    const scorer = rng.weighted(
      squad.map((p) => {
        const g = POSITION_MAP[p.position].group;
        return [p, g === "DEL" ? 5 : g === "MED" ? 2.2 : g === "DEF" ? 0.6 : 0.05] as const;
      })
    );
    scorers.push(scorer.name);
    const caps = next.playerCaps[scorer.id] ?? { caps: 0, goals: 0 };
    next.playerCaps[scorer.id] = { caps: caps.caps, goals: caps.goals + 1 };
  }
  // Internacionalidades
  for (const p of squad.slice(0, info.squadSize)) {
    const caps = next.playerCaps[p.id] ?? { caps: 0, goals: 0 };
    next.playerCaps[p.id] = { caps: caps.caps + 1, goals: caps.goals };
  }

  const match: NtMatch = {
    id: uid("ntm"),
    date: gameNow().toISOString(),
    category,
    rivalCode: rivalData.code,
    rivalName: rivalData.name,
    competition,
    homeGoals: home ? ourGoals : theirGoals,
    awayGoals: home ? theirGoals : ourGoals,
    scorers,
    home,
  };

  team.matches = [match, ...team.matches].slice(0, 30);
  team.record.played++;
  team.record.gf += ourGoals;
  team.record.ga += theirGoals;
  if (ourGoals > theirGoals) { team.record.won++; team.coach.won++; }
  else if (ourGoals === theirGoals) { team.record.drawn++; team.coach.drawn++; }
  else { team.record.lost++; team.coach.lost++; }
  team.coach.matches++;

  // Torneo ganado: 3 victorias consecutivas en competición oficial
  if (competition === "Torneo" && ourGoals > theirGoals) {
    const lastThree = team.matches.slice(0, 3);
    if (
      lastThree.length === 3 &&
      lastThree.every((m) => (m.home ? m.homeGoals > m.awayGoals : m.awayGoals > m.homeGoals))
    ) {
      team.trophies = [...team.trophies, `Torneo internacional ${info.label} · ${gameNow().getUTCFullYear()}`];
    }
  }

  next.updatedAt = Date.now();
  return { state: next, match };
}

/** Bonificación de popularidad y reputación por jugar con la selección */
export function internationalBoost(player: Player, scored: number): Partial<Player> {
  return {
    reputation: clamp(player.reputation + 1 + scored * 1.4),
    popularity: {
      local: clamp(player.popularity.local + 0.6),
      national: clamp(player.popularity.national + 2 + scored * 1.8),
      international: clamp(player.popularity.international + 1.4 + scored * 2.2),
    },
  };
}

export function ntResultLabel(m: NtMatch): "V" | "E" | "D" {
  const ours = m.home ? m.homeGoals : m.awayGoals;
  const theirs = m.home ? m.awayGoals : m.homeGoals;
  return ours > theirs ? "V" : ours === theirs ? "E" : "D";
}
