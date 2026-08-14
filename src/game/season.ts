/**
 * src/game/season.ts
 * CIERRE DE TEMPORADA (FASE 10).
 * - Envejecimiento de jugadores y staff.
 * - Progresión/declive según edad y potencial.
 * - Retiros y jugadores leyenda.
 * - Contratos que expiran, ascensos/descensos y premios.
 * - Historial de temporadas persistente.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player, StaffMember } from "@/types";
import type { LeagueState } from "./league";
import { sortedTable } from "./league";
import { Rng, clamp, uid } from "./rng";
import { addYears, gameNow, seasonIdOf } from "./time";

export interface SeasonSummary {
  seasonId: string;
  clubId: string;
  position: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  topScorer: { name: string; goals: number } | null;
  prize: number;
  promoted: boolean;
  relegated: boolean;
  retired: { name: string; age: number; apps: number; goals: number; legend: boolean }[];
  breakthroughs: { name: string; from: number; to: number }[];
  endedAt: string;
}

export interface SeasonHistoryState {
  id: string;
  ownerUid: string;
  clubId: string;
  lastSeasonId: string;
  seasons: SeasonSummary[];
  updatedAt: number;
}

export function createSeasonHistory(club: Club): SeasonHistoryState {
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    lastSeasonId: seasonIdOf(),
    seasons: [],
    updatedAt: Date.now(),
  };
}

/** ¿Ha cambiado la temporada de juego desde el último cierre? */
export function seasonChanged(history: SeasonHistoryState): boolean {
  return seasonIdOf() !== history.lastSeasonId;
}

/* ------------------------------------------------------------------ */
/* Envejecimiento y desarrollo                                         */
/* ------------------------------------------------------------------ */

/** Probabilidad de retiro según edad y nivel */
function retirementChance(p: Player): number {
  if (p.age < 32) return 0;
  const base = (p.age - 31) * 0.16;
  const qualityShield = Math.max(0, (p.overall - 62) * 0.012);
  return Math.max(0, Math.min(0.95, base - qualityShield));
}

export interface AgeResult {
  players: Player[];
  retired: SeasonSummary["retired"];
  breakthroughs: SeasonSummary["breakthroughs"];
}

/**
 * Envejece a toda la plantilla un año: desarrollo, declive, retiros y
 * caducidad de contratos. Determinista por semilla (temporada + jugador).
 */
export function ageSquad(players: Player[], seasonId: string, trainingLevel: number): AgeResult {
  const retired: SeasonSummary["retired"] = [];
  const breakthroughs: SeasonSummary["breakthroughs"] = [];
  const out: Player[] = [];
  const now = gameNow();

  for (const p of players) {
    const rng = new Rng(`age:${p.id}:${seasonId}`);
    const age = p.age + 1;

    // Retiro
    if (rng.chance(retirementChance({ ...p, age }))) {
      const legend = p.careerTotals.goals >= 60 || p.reputation >= 78 || p.careerTotals.trophies >= 2;
      retired.push({
        name: p.name,
        age,
        apps: p.careerTotals.apps + p.stats.apps,
        goals: p.careerTotals.goals + p.stats.goals,
        legend,
      });
      continue;
    }

    // Desarrollo / declive
    const room = p.potential - p.overall;
    let delta: number;
    if (age <= 21) delta = room * rng.float(0.22, 0.44) * (0.8 + trainingLevel * 0.05);
    else if (age <= 25) delta = room * rng.float(0.12, 0.28) * (0.8 + trainingLevel * 0.05);
    else if (age <= 28) delta = room * rng.float(0.04, 0.14);
    else if (age <= 30) delta = rng.float(-0.6, 0.8);
    else if (age <= 33) delta = rng.float(-2.6, -0.4);
    else delta = rng.float(-4.5, -1.6);

    const before = Math.round(p.overall);
    const overall = clamp(p.overall + delta);
    if (overall - before >= 5) breakthroughs.push({ name: p.name, from: before, to: overall });

    // Los atributos siguen la tendencia del nivel
    const factor = overall / Math.max(1, p.overall);
    const attributes = { ...p.attributes };
    for (const k of Object.keys(attributes) as (keyof typeof attributes)[]) {
      attributes[k] = clamp(attributes[k] * (0.97 + factor * 0.03));
    }

    // Acumular estadísticas de la temporada en el histórico de carrera
    const careerTotals = {
      apps: p.careerTotals.apps + p.stats.apps,
      goals: p.careerTotals.goals + p.stats.goals,
      assists: p.careerTotals.assists + p.stats.assists,
      trophies: p.careerTotals.trophies,
    };

    out.push({
      ...p,
      age,
      overall,
      attributes,
      careerTotals,
      experience: clamp(p.experience + rng.int(2, 6)),
      value: Math.round(p.value * (age <= 24 ? 1.12 : age <= 28 ? 0.98 : age <= 31 ? 0.74 : 0.5)),
      form: clamp(rng.gauss(58, 9, 35, 85), 0, 100),
      fitness: 100,
      injury: null,
      stats: { ...p.stats, seasonId: "", apps: 0, goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0, minutes: 0, avgRating: 0 },
      history: [
        ...p.history,
        { date: now.toISOString(), type: "milestone" as const, text: `Cierra la temporada ${seasonId} con nivel ${overall}.` },
      ].slice(-25),
    });
  }

  return { players: out, retired, breakthroughs };
}

/** El cuerpo técnico también envejece y puede retirarse */
export function ageStaff(staff: StaffMember[], seasonId: string): { staff: StaffMember[]; retired: string[] } {
  const retired: string[] = [];
  const out: StaffMember[] = [];
  for (const m of staff) {
    const rng = new Rng(`agestaff:${m.id}:${seasonId}`);
    const age = m.age + 1;
    if (age >= 66 || (age >= 62 && rng.chance(0.4))) {
      retired.push(m.name);
      continue;
    }
    out.push({
      ...m,
      age,
      level: clamp(age >= 58 ? m.level - rng.int(0, 2) : Math.min(m.potential, m.level + rng.int(0, 1))),
      experience: clamp(m.experience + 3),
    });
  }
  return { staff: out, retired };
}

/* ------------------------------------------------------------------ */
/* Premios y ascensos                                                  */
/* ------------------------------------------------------------------ */

export function seasonPrize(position: number, teams: number, division: number): number {
  const pool = division === 1 ? 9_000_000 : division === 2 ? 4_200_000 : 1_800_000;
  const factor = Math.max(0.12, 1 - (position - 1) / Math.max(1, teams));
  return Math.round((pool * factor) / 50_000) * 50_000;
}

export interface RolloverResult {
  club: Club;
  players: Player[];
  staff: StaffMember[];
  history: SeasonHistoryState;
  summary: SeasonSummary;
}

/**
 * Cierra la temporada: reparte premios, aplica ascensos/descensos, envejece a
 * todos, procesa retiros y guarda el resumen en el historial.
 */
export function rolloverSeason(params: {
  club: Club;
  players: Player[];
  staff: StaffMember[];
  league: LeagueState | null;
  history: SeasonHistoryState;
}): RolloverResult {
  const { league } = params;
  const closingSeason = params.history.lastSeasonId;
  const club: Club = JSON.parse(JSON.stringify(params.club));
  const now = gameNow();

  const table = league ? sortedTable(league) : [];
  const row = table.find((r) => r.clubId === club.id);
  const position = row ? table.indexOf(row) + 1 : 0;
  const teams = table.length || 12;

  // Premios
  const prize = position > 0 ? seasonPrize(position, teams, club.division) : 0;
  if (prize > 0) {
    club.finances.balance += prize;
    club.finances.ledger = [
      { date: now.toISOString(), concept: `Premios temporada ${closingSeason} (${position}º)`, amount: prize, type: "in" as const },
      ...club.finances.ledger,
    ].slice(0, 40);
  }

  // Ascensos y descensos
  const promoted = position > 0 && position <= 2 && club.division > 1;
  const relegated = position >= teams - 1 && club.division < 4;
  if (promoted) {
    club.division -= 1;
    club.reputation = clamp(club.reputation + 8, 1, 100);
    club.trophies = [...club.trophies, { competition: `Ascenso a División ${club.division}`, season: closingSeason }];
  } else if (relegated) {
    club.division += 1;
    club.reputation = clamp(club.reputation - 6, 1, 100);
  }
  if (position === 1) {
    club.trophies = [...club.trophies, { competition: league?.name ?? "Liga", season: closingSeason }];
    club.reputation = clamp(club.reputation + 5, 1, 100);
    club.board.confidence = Math.min(100, club.board.confidence + 15);
  }

  // Máximo goleador de la temporada
  const topScorer = league
    ? params.players
        .map((p) => ({ name: p.name, goals: league.playerStats[p.id]?.goals ?? 0 }))
        .sort((a, b) => b.goals - a.goals)[0] ?? null
    : null;

  // Envejecimiento
  const trainingLevel = club.facilities.trainingGround?.level ?? 1;
  const aged = ageSquad(params.players, closingSeason, trainingLevel);
  const agedStaff = ageStaff(params.staff, closingSeason);

  // Los títulos se reparten entre los jugadores del plantel
  if (position === 1) {
    aged.players.forEach((p) => (p.careerTotals.trophies += 1));
  }

  // Contratos vencidos: renovación automática al alza de los jóvenes
  const survivors = aged.players.map((p) => {
    if (Date.parse(p.contract.expires) > now.getTime()) return p;
    return {
      ...p,
      contract: {
        ...p.contract,
        expires: addYears(now, p.age <= 23 ? 3 : 2).toISOString(),
        wage: Math.round((p.contract.wage * 1.08) / 50) * 50,
        signedOn: now.toISOString(),
      },
    };
  });

  club.squadSize = survivors.length;
  club.record = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
  club.seasonId = seasonIdOf(now);
  club.updatedAt = Date.now();

  const summary: SeasonSummary = {
    seasonId: closingSeason,
    clubId: club.id,
    position,
    points: row?.points ?? 0,
    played: row?.played ?? 0,
    won: row?.won ?? 0,
    drawn: row?.drawn ?? 0,
    lost: row?.lost ?? 0,
    gf: row?.gf ?? 0,
    ga: row?.ga ?? 0,
    topScorer: topScorer && topScorer.goals > 0 ? topScorer : null,
    prize,
    promoted,
    relegated,
    retired: aged.retired,
    breakthroughs: aged.breakthroughs,
    endedAt: now.toISOString(),
  };

  return {
    club,
    players: survivors,
    staff: agedStaff.staff,
    history: {
      ...params.history,
      lastSeasonId: seasonIdOf(now),
      seasons: [summary, ...params.history.seasons].slice(0, 30),
      updatedAt: Date.now(),
    },
    summary,
  };
}

export function newSeasonId(): string {
  return uid("season");
}
