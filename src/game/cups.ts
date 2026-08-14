/**
 * src/game/cups.ts
 * COPAS Y COMPETICIONES INTERNACIONALES (FASE 11).
 * - Copa Nacional: 16 equipos, eliminatoria a partido único con prórroga y penaltis.
 * - Supercopa: partido único entre el campeón de liga y el de copa.
 * - Copa Internacional: 16 clubes de distintos países, clasificación por mérito.
 *
 * El partido del usuario se simula en detalle; el resto del cuadro con simulación
 * rápida. Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player } from "@/types";
import { COUNTRIES, COUNTRY_BY_CODE } from "./data/countries";
import { Rng, uid } from "./rng";
import { quickSim, simulateMatch, type MatchResult } from "./match";
import { buildAiTeam, buildUserTeam, type LeagueClub } from "./league";
import { addDays, gameNow, seasonIdOf } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type CupKind = "nacional" | "supercopa" | "internacional";

export interface CupTeam extends LeagueClub {
  country: string;
}

export interface CupTie {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  date: string;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  penalties: [number, number] | null;
  winnerId: string | null;
}

export interface CupState {
  kind: CupKind;
  name: string;
  seasonId: string;
  teams: CupTeam[];
  ties: CupTie[];
  /** Ronda actual (1 = primera) */
  round: number;
  totalRounds: number;
  status: "pendiente" | "activa" | "eliminado" | "finalizada";
  championId: string | null;
  userRoundReached: number;
  prizeEarned: number;
}

export interface CompetitionsState {
  id: string;
  ownerUid: string;
  clubId: string;
  seasonId: string;
  nacional: CupState;
  supercopa: CupState | null;
  internacional: CupState | null;
  history: { seasonId: string; competition: string; result: string; champion: boolean }[];
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

const ROUND_NAMES_16 = ["Octavos de final", "Cuartos de final", "Semifinal", "Final"];
const ROUND_GAP_DAYS = 6;

const CLUB_A = ["Atlético", "Real", "Sporting", "Unión", "Racing", "Deportivo", "Club", "FC", "Olímpico", "Nacional", "Estrella"];
const CLUB_B = ["Valmar", "Ríos", "Aurora", "Montenegro", "Bahía", "Ferrolán", "Nordeste", "Castilar", "Verdal", "Oriente", "Peñalba", "Alborada", "Ribalta", "Monteverde", "Sanvedra", "Trelles"];

export function roundName(round: number, totalRounds: number): string {
  const offset = ROUND_NAMES_16.length - totalRounds;
  return ROUND_NAMES_16[round - 1 + offset] ?? `Ronda ${round}`;
}

/** Premio por superar cada ronda */
export function cupPrize(kind: CupKind, round: number, totalRounds: number): number {
  const base = kind === "internacional" ? 1_400_000 : kind === "supercopa" ? 900_000 : 450_000;
  return Math.round(base * Math.pow(1.75, round - 1) * (round === totalRounds ? 1.8 : 1));
}

/* ------------------------------------------------------------------ */
/* Generación de cuadros                                               */
/* ------------------------------------------------------------------ */

function makeTeam(rng: Rng, country: string, rating: number, used: Set<string>): CupTeam {
  const c = COUNTRY_BY_CODE[country] ?? COUNTRIES[0];
  let name = "";
  do {
    name = `${rng.pick(CLUB_A)} ${rng.pick(CLUB_B)}`;
  } while (used.has(name));
  used.add(name);
  return {
    id: `cup_${rng.int(100000, 999999)}`,
    name,
    shortName: name.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").slice(0, 3) || name.slice(0, 3).toUpperCase(),
    colors: {
      primary: rng.pick(["#ef4444", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#14b8a6", "#e11d48", "#0ea5e9"]),
      secondary: "#0f172a",
    },
    rating: Math.max(30, Math.min(90, Math.round(rating))),
    reputation: Math.max(15, Math.min(95, Math.round(rating + rng.int(-6, 8)))),
    managerName: `${rng.pick(c.first)} ${rng.pick(c.last)}`,
    isUser: false,
    country,
  };
}

function buildBracket(teams: CupTeam[], startDate: Date, rng: Rng): CupTie[] {
  const shuffled = rng.shuffle(teams);
  const ties: CupTie[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    ties.push({
      id: `t1_${i / 2}`,
      round: 1,
      homeId: shuffled[i].id,
      awayId: shuffled[i + 1].id,
      date: startDate.toISOString(),
      played: false,
      homeGoals: null,
      awayGoals: null,
      penalties: null,
      winnerId: null,
    });
  }
  return ties;
}

export function createNationalCup(club: Club, userRating: number): CupState {
  const rng = new Rng(`cup:nacional:${club.id}:${seasonIdOf()}`);
  const used = new Set<string>([club.name]);
  const country = COUNTRY_BY_CODE[club.country] ?? COUNTRIES[0];

  const userTeam: CupTeam = {
    id: club.id, name: club.name, shortName: club.shortName, colors: club.colors,
    rating: userRating, reputation: club.reputation, managerName: club.managerName,
    isUser: true, country: club.country,
  };
  const rivals = Array.from({ length: 15 }, () =>
    makeTeam(rng, club.country, userRating + rng.gauss(2, 9, -16, 20), used)
  );
  const teams = [userTeam, ...rivals];

  return {
    kind: "nacional",
    name: `Copa de ${country.name}`,
    seasonId: seasonIdOf(),
    teams,
    ties: buildBracket(teams, addDays(gameNow(), 3), rng),
    round: 1,
    totalRounds: 4,
    status: "activa",
    championId: null,
    userRoundReached: 1,
    prizeEarned: 0,
  };
}

/**
 * Copa Internacional: solo para clubes con mérito (reputación alta o buen
 * puesto la temporada anterior). Rivales de todos los países, más fuertes.
 */
export function createInternationalCup(club: Club, userRating: number): CupState | null {
  if (club.reputation < 45) return null;
  const rng = new Rng(`cup:intl:${club.id}:${seasonIdOf()}`);
  const used = new Set<string>([club.name]);

  const userTeam: CupTeam = {
    id: club.id, name: club.name, shortName: club.shortName, colors: club.colors,
    rating: userRating, reputation: club.reputation, managerName: club.managerName,
    isUser: true, country: club.country,
  };
  const rivals = Array.from({ length: 15 }, () => {
    const c = rng.pick(COUNTRIES);
    // Los rivales continentales escalan con la fuerza de su país
    return makeTeam(rng, c.code, userRating + 4 + (c.strength - 82) * 0.25 + rng.gauss(0, 8, -12, 22), used);
  });
  const teams = [userTeam, ...rivals];

  return {
    kind: "internacional",
    name: "Copa Intercontinental de Clubes",
    seasonId: seasonIdOf(),
    teams,
    ties: buildBracket(teams, addDays(gameNow(), 5), rng),
    round: 1,
    totalRounds: 4,
    status: "activa",
    championId: null,
    userRoundReached: 1,
    prizeEarned: 0,
  };
}

/** Supercopa: partido único contra el campeón de copa/liga de la temporada previa */
export function createSuperCup(club: Club, userRating: number): CupState {
  const rng = new Rng(`cup:super:${club.id}:${seasonIdOf()}`);
  const used = new Set<string>([club.name]);
  const country = COUNTRY_BY_CODE[club.country] ?? COUNTRIES[0];

  const userTeam: CupTeam = {
    id: club.id, name: club.name, shortName: club.shortName, colors: club.colors,
    rating: userRating, reputation: club.reputation, managerName: club.managerName,
    isUser: true, country: club.country,
  };
  const rival = makeTeam(rng, club.country, userRating + rng.float(1, 7), used);

  return {
    kind: "supercopa",
    name: `Supercopa de ${country.name}`,
    seasonId: seasonIdOf(),
    teams: [userTeam, rival],
    ties: [{
      id: "sc_final",
      round: 1,
      homeId: userTeam.id,
      awayId: rival.id,
      date: addDays(gameNow(), 2).toISOString(),
      played: false,
      homeGoals: null,
      awayGoals: null,
      penalties: null,
      winnerId: null,
    }],
    round: 1,
    totalRounds: 1,
    status: "activa",
    championId: null,
    userRoundReached: 1,
    prizeEarned: 0,
  };
}

export function createCompetitions(club: Club, userRating: number): CompetitionsState {
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    seasonId: seasonIdOf(),
    nacional: createNationalCup(club, userRating),
    supercopa: club.trophies.length > 0 ? createSuperCup(club, userRating) : null,
    internacional: createInternationalCup(club, userRating),
    history: [],
    updatedAt: Date.now(),
  };
}

/** Regenera las copas al cambiar de temporada */
export function refreshCompetitions(state: CompetitionsState, club: Club, userRating: number): CompetitionsState {
  const season = seasonIdOf();
  if (state.seasonId === season) return state;

  const history = [...state.history];
  for (const cup of [state.nacional, state.supercopa, state.internacional]) {
    if (!cup) continue;
    const champion = cup.championId === club.id;
    history.unshift({
      seasonId: cup.seasonId,
      competition: cup.name,
      result: champion ? "Campeón" : cup.status === "eliminado" ? `Eliminado en ${roundName(cup.userRoundReached, cup.totalRounds)}` : "No disputada",
      champion,
    });
  }

  return {
    ...state,
    seasonId: season,
    nacional: createNationalCup(club, userRating),
    supercopa: club.trophies.length > 0 ? createSuperCup(club, userRating) : null,
    internacional: createInternationalCup(club, userRating),
    history: history.slice(0, 40),
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function cupTeam(cup: CupState, id: string): CupTeam | undefined {
  return cup.teams.find((t) => t.id === id);
}

export function userTie(cup: CupState, clubId: string): CupTie | null {
  return cup.ties.find((t) => !t.played && t.round === cup.round && (t.homeId === clubId || t.awayId === clubId)) ?? null;
}

export function tiesOfRound(cup: CupState, round: number): CupTie[] {
  return cup.ties.filter((t) => t.round === round);
}

export function cupPlayable(cup: CupState, clubId: string): boolean {
  const tie = userTie(cup, clubId);
  return !!tie && Date.parse(tie.date) <= gameNow().getTime() && cup.status === "activa";
}

/* ------------------------------------------------------------------ */
/* Disputa de eliminatorias                                            */
/* ------------------------------------------------------------------ */

/** Resuelve un empate a penaltis (determinista) */
function shootout(seed: string, ratingA: number, ratingB: number): [number, number] {
  const rng = new Rng(`pens:${seed}`);
  let a = 0;
  let b = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.chance(0.72 + (ratingA - ratingB) / 400)) a++;
    if (rng.chance(0.72 + (ratingB - ratingA) / 400)) b++;
  }
  while (a === b) {
    const ga = rng.chance(0.7 + (ratingA - ratingB) / 400);
    const gb = rng.chance(0.7 + (ratingB - ratingA) / 400);
    if (ga) a++;
    if (gb) b++;
    if (a !== b) break;
  }
  return [a, b];
}

export interface CupPlayResult {
  cup: CupState;
  match: MatchResult | null;
  advanced: boolean;
  champion: boolean;
  prize: number;
  error?: string;
}

/**
 * Disputa la eliminatoria del usuario en la ronda actual y resuelve el resto
 * del cuadro. Si gana, se genera automáticamente la ronda siguiente.
 */
export function playCupRound(params: {
  cup: CupState;
  club: Club;
  players: Player[];
  coachLevel: number;
}): CupPlayResult {
  const cup: CupState = JSON.parse(JSON.stringify(params.cup));
  const { club } = params;
  const tie = userTie(cup, club.id);
  if (!tie) return { cup: params.cup, match: null, advanced: false, champion: false, prize: 0, error: "No tienes eliminatoria pendiente." };
  if (Date.parse(tie.date) > gameNow().getTime()) {
    return { cup: params.cup, match: null, advanced: false, champion: false, prize: 0, error: "Todavía no es la fecha del partido." };
  }

  const isHome = tie.homeId === club.id;
  const rivalId = isHome ? tie.awayId : tie.homeId;
  const rival = cupTeam(cup, rivalId);
  if (!rival) return { cup: params.cup, match: null, advanced: false, champion: false, prize: 0, error: "Rival no encontrado." };

  const userTeam = buildUserTeam(club, params.players, params.coachLevel);
  const aiTeam = buildAiTeam(rival, rival.country, `${cup.kind}:${tie.id}:${cup.seasonId}`);

  const match = simulateMatch({
    seed: `${cup.kind}:${cup.seasonId}:${tie.id}`,
    id: `mc_${tie.id}_${uid("x").slice(-5)}`,
    date: tie.date,
    competition: `${cup.name} · ${roundName(cup.round, cup.totalRounds)}`,
    round: cup.round,
    leagueId: null,
    home: isHome ? userTeam : aiTeam,
    away: isHome ? aiTeam : userTeam,
    neutral: cup.kind === "supercopa" || cup.round === cup.totalRounds,
  });

  const fx = cup.ties.find((t) => t.id === tie.id)!;
  fx.played = true;
  fx.homeGoals = match.home.goals;
  fx.awayGoals = match.away.goals;

  // Empate → penaltis
  if (match.home.goals === match.away.goals) {
    const homeRating = isHome ? userTeam.starters.reduce((s, p) => s + p.overall, 0) / 11 : rival.rating;
    const awayRating = isHome ? rival.rating : userTeam.starters.reduce((s, p) => s + p.overall, 0) / 11;
    const pens = shootout(tie.id, homeRating, awayRating);
    fx.penalties = pens;
    fx.winnerId = pens[0] > pens[1] ? fx.homeId : fx.awayId;
  } else {
    fx.winnerId = match.home.goals > match.away.goals ? fx.homeId : fx.awayId;
  }

  // Resto del cuadro
  for (const t of cup.ties.filter((x) => x.round === cup.round && !x.played)) {
    const h = cupTeam(cup, t.homeId);
    const a = cupTeam(cup, t.awayId);
    if (!h || !a) continue;
    const [hg, ag] = quickSim(h.rating, a.rating, `${cup.kind}:${cup.seasonId}:${t.id}`);
    t.played = true;
    t.homeGoals = hg;
    t.awayGoals = ag;
    if (hg === ag) {
      const pens = shootout(t.id, h.rating, a.rating);
      t.penalties = pens;
      t.winnerId = pens[0] > pens[1] ? t.homeId : t.awayId;
    } else {
      t.winnerId = hg > ag ? t.homeId : t.awayId;
    }
  }

  const advanced = fx.winnerId === club.id;
  let prize = 0;
  let champion = false;

  if (advanced) {
    prize = cupPrize(cup.kind, cup.round, cup.totalRounds);
    cup.prizeEarned += prize;
    cup.userRoundReached = cup.round + (cup.round === cup.totalRounds ? 0 : 1);

    if (cup.round === cup.totalRounds) {
      cup.status = "finalizada";
      cup.championId = club.id;
      champion = true;
    } else {
      // Generar la ronda siguiente con los ganadores
      const winners = tiesOfRound(cup, cup.round).map((t) => t.winnerId!).filter(Boolean);
      const rng = new Rng(`${cup.kind}:${cup.seasonId}:r${cup.round + 1}`);
      const drawn = rng.shuffle(winners);
      const nextDate = addDays(gameNow(), ROUND_GAP_DAYS);
      for (let i = 0; i < drawn.length; i += 2) {
        cup.ties.push({
          id: `t${cup.round + 1}_${i / 2}`,
          round: cup.round + 1,
          homeId: drawn[i],
          awayId: drawn[i + 1],
          date: nextDate.toISOString(),
          played: false,
          homeGoals: null,
          awayGoals: null,
          penalties: null,
          winnerId: null,
        });
      }
      cup.round += 1;
    }
  } else {
    cup.status = "eliminado";
    cup.userRoundReached = cup.round;
    // Resolver el resto del torneo por simulación para conocer al campeón
    let r = cup.round;
    let alive = tiesOfRound(cup, r).map((t) => t.winnerId!).filter(Boolean);
    const rng = new Rng(`${cup.kind}:${cup.seasonId}:auto`);
    while (alive.length > 1 && r < cup.totalRounds) {
      const next: string[] = [];
      const drawn = rng.shuffle(alive);
      for (let i = 0; i < drawn.length; i += 2) {
        const h = cupTeam(cup, drawn[i]);
        const a = cupTeam(cup, drawn[i + 1]);
        if (!h || !a) continue;
        const [hg, ag] = quickSim(h.rating, a.rating, `auto:${cup.seasonId}:${r}:${i}`);
        const winner = hg === ag ? (shootout(`${r}${i}`, h.rating, a.rating)[0] > 0 ? h.id : a.id) : hg > ag ? h.id : a.id;
        cup.ties.push({
          id: `t${r + 1}_${i / 2}`, round: r + 1, homeId: h.id, awayId: a.id,
          date: addDays(gameNow(), ROUND_GAP_DAYS * (r - cup.round + 1)).toISOString(),
          played: true, homeGoals: hg, awayGoals: ag, penalties: null, winnerId: winner,
        });
        next.push(winner);
      }
      alive = next;
      r += 1;
    }
    cup.championId = alive[0] ?? null;
    cup.status = "finalizada";
  }

  cup.round = Math.min(cup.round, cup.totalRounds);
  return { cup, match, advanced, champion, prize };
}

/** Aplica el premio y el trofeo al club */
export function applyCupOutcome(club: Club, cup: CupState, prize: number, champion: boolean): Club {
  const next: Club = JSON.parse(JSON.stringify(club));
  if (prize > 0) {
    next.finances.balance += prize;
    next.finances.ledger = [
      { date: gameNow().toISOString(), concept: `${cup.name} · ${roundName(cup.userRoundReached, cup.totalRounds)}`, amount: prize, type: "in" as const },
      ...next.finances.ledger,
    ].slice(0, 40);
  }
  if (champion) {
    next.trophies = [...next.trophies, { competition: cup.name, season: cup.seasonId }];
    next.reputation = Math.min(100, next.reputation + (cup.kind === "internacional" ? 9 : cup.kind === "nacional" ? 6 : 3));
    next.board.confidence = Math.min(100, next.board.confidence + 12);
    next.fanbase.satisfaction = Math.min(100, next.fanbase.satisfaction + 10);
    next.fanbase.followers = Math.round(next.fanbase.followers * 1.06);
  }
  next.updatedAt = Date.now();
  return next;
}

export const CUP_STYLE: Record<CupKind, string> = {
  nacional: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  supercopa: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  internacional: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
};

export const CUP_ICON: Record<CupKind, string> = {
  nacional: "🏆",
  supercopa: "🥇",
  internacional: "🌍",
};
