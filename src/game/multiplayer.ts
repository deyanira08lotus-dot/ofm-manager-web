/**
 * src/game/multiplayer.ts
 * MULTIJUGADOR REAL (FASE 12).
 *
 * - Ligas mundiales compartidas: varios managers en la misma competición.
 * - Los huecos libres se rellenan con clubes IA hasta completar el cupo.
 * - Simulación DETERMINISTA por semilla: dos usuarios que disputen el mismo
 *   partido obtienen exactamente el mismo resultado, así que el marcador es
 *   coherente sin necesidad de bloqueo.
 * - Traspasos entre usuarios con liquidación en dos pasos:
 *     1) el vendedor acepta  → el jugador cambia de club y él cobra
 *     2) el comprador liquida → paga al entrar (nadie escribe en el club ajeno)
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player } from "@/types";
import type { Fixture, LeagueClub, TableRow } from "./league";
import { buildAiTeam, buildUserTeam, emptyRow } from "./league";
import { quickSim, simulateMatch, type MatchResult } from "./match";
import { COUNTRY_BY_CODE, COUNTRIES } from "./data/countries";
import { Rng, uid } from "./rng";
import { addDays, gameNow, seasonIdOf } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface WorldMember extends LeagueClub {
  ownerUid: string | null;
  country: string;
  isAi: boolean;
  joinedAt: number;
}

export interface WorldLeague {
  id: string;
  country: string;
  division: number;
  name: string;
  seasonId: string;
  capacity: number;
  members: WorldMember[];
  table: Record<string, TableRow>;
  fixtures: Fixture[];
  round: number;
  status: "abierta" | "en_juego" | "finalizada";
  createdAt: number;
  updatedAt: number;
}

export interface UserTransferOffer {
  id: string;
  fromUid: string;
  fromClubId: string;
  fromClubName: string;
  fromManager: string;
  toUid: string;
  toClubId: string;
  toClubName: string;
  playerId: string;
  playerName: string;
  playerOverall: number;
  playerAge: number;
  playerPosition: string;
  amount: number;
  message: string;
  status: "pendiente" | "aceptada" | "rechazada" | "liquidada";
  createdAt: number;
  resolvedAt?: number;
}

export const WORLD_CAPACITY = 12;
const ROUND_GAP_DAYS = 2;

export function worldLeagueId(country: string, division: number, seasonId = seasonIdOf()): string {
  return `${country}_D${division}_${seasonId}`;
}

/* ------------------------------------------------------------------ */
/* Creación e incorporación                                            */
/* ------------------------------------------------------------------ */

const AI_A = ["Atlético", "Real", "Sporting", "Unión", "Racing", "Deportivo", "Club", "FC", "Olímpico", "Nacional"];
const AI_B = ["Valmar", "Aurora", "Bahía", "Oriente", "Verdal", "Peñalba", "Ribalta", "Monteverde", "Trelles", "Alborada", "Castilar", "Nordeste"];

function makeAiMember(rng: Rng, country: string, baseRating: number, used: Set<string>): WorldMember {
  const c = COUNTRY_BY_CODE[country] ?? COUNTRIES[0];
  let name = "";
  do {
    name = `${rng.pick(AI_A)} ${rng.pick(AI_B)}`;
  } while (used.has(name));
  used.add(name);
  const rating = Math.max(32, Math.min(84, Math.round(baseRating + rng.gauss(0, 6, -12, 13))));
  return {
    id: `wai_${rng.int(100000, 999999)}`,
    ownerUid: null,
    name,
    shortName: name.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").slice(0, 3) || name.slice(0, 3).toUpperCase(),
    colors: { primary: rng.pick(["#ef4444", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#14b8a6"]), secondary: "#0f172a" },
    rating,
    reputation: rating,
    managerName: `${rng.pick(c.first)} ${rng.pick(c.last)}`,
    isUser: false,
    isAi: true,
    country,
    joinedAt: Date.now(),
  };
}

export function createWorldLeague(country: string, division: number, baseRating: number): WorldLeague {
  const seasonId = seasonIdOf();
  const id = worldLeagueId(country, division, seasonId);
  const rng = new Rng(`world:${id}`);
  const used = new Set<string>();
  const c = COUNTRY_BY_CODE[country] ?? COUNTRIES[0];

  const members = Array.from({ length: WORLD_CAPACITY }, () => makeAiMember(rng, country, baseRating, used));
  const table: Record<string, TableRow> = {};
  members.forEach((m) => (table[m.id] = emptyRow(m.id)));

  return {
    id,
    country,
    division,
    name: `${c.leagueName} · División ${division}`,
    seasonId,
    capacity: WORLD_CAPACITY,
    members,
    table,
    fixtures: [],
    round: 0,
    status: "abierta",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function isMember(league: WorldLeague, clubId: string): boolean {
  return league.members.some((m) => m.id === clubId);
}

export function humanCount(league: WorldLeague): number {
  return league.members.filter((m) => !m.isAi).length;
}

/**
 * Incorpora al club del usuario ocupando la plaza del club IA más parecido en
 * nivel (así la liga mantiene su equilibrio competitivo).
 */
export function joinWorldLeague(
  league: WorldLeague,
  club: Club,
  rating: number,
  ownerUid: string
): { league: WorldLeague; error?: string } {
  if (isMember(league, club.id)) return { league, error: "Ya participas en esta liga." };
  const next: WorldLeague = JSON.parse(JSON.stringify(league));

  const member: WorldMember = {
    id: club.id,
    ownerUid,
    name: club.name,
    shortName: club.shortName,
    colors: club.colors,
    rating,
    reputation: club.reputation,
    managerName: club.managerName,
    isUser: true,
    isAi: false,
    country: club.country,
    joinedAt: Date.now(),
  };

  const aiSlots = next.members.filter((m) => m.isAi);
  if (aiSlots.length === 0) return { league, error: "La liga está completa de managers humanos." };

  // Sustituir al club IA de nivel más cercano
  const target = aiSlots.sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating))[0];
  next.members = next.members.map((m) => (m.id === target.id ? member : m));
  delete next.table[target.id];
  next.table[club.id] = emptyRow(club.id);

  // Reasignar partidos ya sorteados
  next.fixtures = next.fixtures.map((f) => ({
    ...f,
    homeId: f.homeId === target.id ? club.id : f.homeId,
    awayId: f.awayId === target.id ? club.id : f.awayId,
  }));

  next.updatedAt = Date.now();
  return { league: next };
}

export function leaveWorldLeague(league: WorldLeague, clubId: string, baseRating: number): WorldLeague {
  const next: WorldLeague = JSON.parse(JSON.stringify(league));
  const rng = new Rng(`leave:${league.id}:${clubId}`);
  const used = new Set(next.members.map((m) => m.name));
  const replacement = makeAiMember(rng, next.country, baseRating, used);

  next.members = next.members.map((m) => (m.id === clubId ? replacement : m));
  next.table[replacement.id] = next.table[clubId] ?? emptyRow(replacement.id);
  delete next.table[clubId];
  next.fixtures = next.fixtures.map((f) => ({
    ...f,
    homeId: f.homeId === clubId ? replacement.id : f.homeId,
    awayId: f.awayId === clubId ? replacement.id : f.awayId,
  }));
  next.updatedAt = Date.now();
  return next;
}

/* ------------------------------------------------------------------ */
/* Calendario                                                          */
/* ------------------------------------------------------------------ */

function roundRobin(ids: string[]): [string, string][][] {
  const teams = [...ids];
  if (teams.length % 2) teams.push("BYE");
  const n = teams.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    teams.splice(1, 0, teams.pop()!);
  }
  return rounds;
}

/** Sortea el calendario completo (ida y vuelta) y abre la competición */
export function startWorldLeague(league: WorldLeague): WorldLeague {
  const next: WorldLeague = JSON.parse(JSON.stringify(league));
  const rng = new Rng(`fixtures:${next.id}`);
  const ids = rng.shuffle(next.members.map((m) => m.id));
  const first = roundRobin(ids);
  const second = first.map((round) => round.map(([h, a]) => [a, h] as [string, string]));
  const all = [...first, ...second];
  const now = gameNow();

  next.fixtures = [];
  all.forEach((pairs, idx) => {
    const date = addDays(now, idx * ROUND_GAP_DAYS).toISOString();
    pairs.forEach(([homeId, awayId], j) => {
      next.fixtures.push({
        id: `wf${idx + 1}_${j}`,
        round: idx + 1,
        date,
        homeId,
        awayId,
        played: false,
        homeGoals: null,
        awayGoals: null,
      });
    });
  });
  next.round = 1;
  next.status = "en_juego";
  next.updatedAt = Date.now();
  return next;
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function worldStandings(league: WorldLeague): (TableRow & { member: WorldMember })[] {
  return Object.values(league.table)
    .map((row) => ({ ...row, member: league.members.find((m) => m.id === row.clubId)! }))
    .filter((r) => r.member)
    .sort((a, b) =>
      b.points - a.points ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.member.name.localeCompare(b.member.name)
    );
}

export function nextWorldFixture(league: WorldLeague, clubId: string): Fixture | null {
  return league.fixtures.find((f) => !f.played && (f.homeId === clubId || f.awayId === clubId)) ?? null;
}

export function worldMember(league: WorldLeague, id: string): WorldMember | undefined {
  return league.members.find((m) => m.id === id);
}

/* ------------------------------------------------------------------ */
/* Disputa de jornada                                                  */
/* ------------------------------------------------------------------ */

function applyToTable(league: WorldLeague, homeId: string, awayId: string, hg: number, ag: number) {
  const h = league.table[homeId] ?? (league.table[homeId] = emptyRow(homeId));
  const a = league.table[awayId] ?? (league.table[awayId] = emptyRow(awayId));
  h.played++; a.played++;
  h.gf += hg; h.ga += ag;
  a.gf += ag; a.ga += hg;
  if (hg > ag) { h.won++; a.lost++; h.points += 3; h.form.push("V"); a.form.push("D"); }
  else if (hg < ag) { a.won++; h.lost++; a.points += 3; a.form.push("V"); h.form.push("D"); }
  else { h.drawn++; a.drawn++; h.points++; a.points++; h.form.push("E"); a.form.push("E"); }
  h.form = h.form.slice(-5);
  a.form = a.form.slice(-5);
}

export interface WorldPlayResult {
  league: WorldLeague;
  match: MatchResult | null;
  error?: string;
  /** El rival era otro manager humano */
  vsHuman: boolean;
}

export function commitWorldLiveResult(params: {
  league: WorldLeague;
  fixtureId: string;
  match: MatchResult;
}): WorldLeague {
  const league: WorldLeague = JSON.parse(JSON.stringify(params.league));
  const fixture = league.fixtures.find((f) => f.id === params.fixtureId);
  if (!fixture || fixture.played) return params.league;

  fixture.played = true;
  fixture.homeGoals = params.match.home.goals;
  fixture.awayGoals = params.match.away.goals;
  applyToTable(league, fixture.homeId, fixture.awayId, params.match.home.goals, params.match.away.goals);

  league.fixtures
    .filter((f) => f.round === fixture.round && !f.played)
    .forEach((f) => {
      const home = worldMember(league, f.homeId);
      const away = worldMember(league, f.awayId);
      if (!home || !away) return;
      const [homeGoals, awayGoals] = quickSim(home.rating, away.rating, `${league.id}:${f.id}`);
      f.played = true;
      f.homeGoals = homeGoals;
      f.awayGoals = awayGoals;
      applyToTable(league, f.homeId, f.awayId, homeGoals, awayGoals);
    });

  const roundPending = league.fixtures.some((f) => f.round === fixture.round && !f.played);
  if (!roundPending) league.round = fixture.round + 1;
  if (!league.fixtures.some((f) => !f.played)) league.status = "finalizada";
  league.updatedAt = Date.now();
  return league;
}

/**
 * Disputa la jornada del usuario. El partido propio se simula en detalle;
 * el resto de la jornada con simulación rápida determinista, de modo que
 * cualquier participante obtiene la misma tabla.
 */
export function playWorldRound(params: {
  league: WorldLeague;
  club: Club;
  players: Player[];
  coachLevel: number;
}): WorldPlayResult {
  const league: WorldLeague = JSON.parse(JSON.stringify(params.league));
  const { club } = params;
  const fixture = nextWorldFixture(league, club.id);
  if (!fixture) return { league: params.league, match: null, vsHuman: false, error: "No tienes partidos pendientes." };
  if (Date.parse(fixture.date) > gameNow().getTime()) {
    return { league: params.league, match: null, vsHuman: false, error: "Todavía no es la fecha del partido." };
  }

  const isHome = fixture.homeId === club.id;
  const rivalId = isHome ? fixture.awayId : fixture.homeId;
  const rival = worldMember(league, rivalId);
  if (!rival) return { league: params.league, match: null, vsHuman: false, error: "Rival no encontrado." };

  const userTeam = buildUserTeam(club, params.players, params.coachLevel);
  // Para rivales humanos se reconstruye un equipo equivalente a su nivel
  // (con Cloud Functions se cargaría su plantilla real).
  const rivalTeam = buildAiTeam(rival, rival.country, `${league.id}:${fixture.id}`);
  rivalTeam.name = rival.name;
  rivalTeam.short = rival.shortName;
  rivalTeam.colors = rival.colors;

  const match = simulateMatch({
    seed: `${league.id}:${fixture.id}`,
    id: `mw_${fixture.id}_${uid("x").slice(-5)}`,
    date: fixture.date,
    competition: `${league.name} · Jornada ${fixture.round}`,
    round: fixture.round,
    leagueId: league.id,
    home: isHome ? userTeam : rivalTeam,
    away: isHome ? rivalTeam : userTeam,
  });

  const fx = league.fixtures.find((f) => f.id === fixture.id)!;
  fx.played = true;
  fx.homeGoals = match.home.goals;
  fx.awayGoals = match.away.goals;
  applyToTable(league, fx.homeId, fx.awayId, match.home.goals, match.away.goals);

  // Resto de la jornada (determinista: todos ven lo mismo)
  league.fixtures
    .filter((f) => f.round === fixture.round && !f.played)
    .forEach((f) => {
      const h = worldMember(league, f.homeId);
      const a = worldMember(league, f.awayId);
      if (!h || !a) return;
      const [hg, ag] = quickSim(h.rating, a.rating, `${league.id}:${f.id}`);
      f.played = true;
      f.homeGoals = hg;
      f.awayGoals = ag;
      applyToTable(league, f.homeId, f.awayId, hg, ag);
    });

  const pending = league.fixtures.some((f) => !f.played);
  league.round = pending ? fixture.round + 1 : fixture.round;
  if (!pending) league.status = "finalizada";
  league.updatedAt = Date.now();

  return { league, match, vsHuman: !rival.isAi };
}

/* ------------------------------------------------------------------ */
/* Traspasos entre managers                                            */
/* ------------------------------------------------------------------ */

export function buildOffer(params: {
  fromClub: Club;
  fromUid: string;
  toClubId: string;
  toClubName: string;
  toUid: string;
  player: Player;
  amount: number;
  message: string;
}): UserTransferOffer {
  return {
    id: uid("uoff"),
    fromUid: params.fromUid,
    fromClubId: params.fromClub.id,
    fromClubName: params.fromClub.name,
    fromManager: params.fromClub.managerName,
    toUid: params.toUid,
    toClubId: params.toClubId,
    toClubName: params.toClubName,
    playerId: params.player.id,
    playerName: params.player.name,
    playerOverall: Math.round(params.player.overall),
    playerAge: params.player.age,
    playerPosition: params.player.position,
    amount: Math.max(0, Math.round(params.amount)),
    message: params.message.slice(0, 140),
    status: "pendiente",
    createdAt: Date.now(),
  };
}

export function validateOffer(club: Club, amount: number, squadSize: number): string | null {
  if (amount <= 0) return "La oferta debe ser superior a 0 €.";
  if (club.finances.balance < amount) return "No tienes saldo suficiente para esa oferta.";
  if (squadSize >= 30) return "Tu plantilla está llena (máximo 30 jugadores).";
  return null;
}

export interface AcceptOfferResult {
  club: Club;
  player: Player;
  offer: UserTransferOffer;
  error?: string;
}

/** Paso 1 — el VENDEDOR acepta: cede el jugador y cobra el importe */
export function acceptUserOffer(
  club: Club,
  player: Player,
  offer: UserTransferOffer,
  squadSize: number
): AcceptOfferResult {
  if (squadSize <= 16) {
    return { club, player, offer, error: "No puedes bajar de 16 jugadores." };
  }
  const now = gameNow();
  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance += offer.amount;
  nextClub.finances.transferBudget += Math.round(offer.amount * 0.7);
  nextClub.squadSize = Math.max(0, nextClub.squadSize - 1);
  nextClub.finances.ledger = [
    { date: now.toISOString(), concept: `Venta a ${offer.fromClubName}: ${player.name}`, amount: offer.amount, type: "in" as const },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  if (nextClub.fanbase.favouritePlayerIds.includes(player.id)) {
    nextClub.fanbase.satisfaction = Math.max(5, nextClub.fanbase.satisfaction - 9);
    nextClub.fanbase.favouritePlayerIds = nextClub.fanbase.favouritePlayerIds.filter((id) => id !== player.id);
  }
  nextClub.updatedAt = Date.now();

  const moved: Player = {
    ...player,
    clubId: offer.fromClubId,
    ownerUid: offer.fromUid,
    origin: "transfer",
    morale: Math.min(99, player.morale + 5),
    history: [
      ...player.history,
      { date: now.toISOString(), type: "transfer" as const, text: `Traspasado al ${offer.fromClubName} por ${offer.amount.toLocaleString("es-ES")} € (acuerdo entre managers).` },
    ].slice(-25),
  };

  return {
    club: nextClub,
    player: moved,
    offer: { ...offer, status: "aceptada", resolvedAt: Date.now() },
  };
}

/** Paso 2 — el COMPRADOR liquida al entrar: paga el importe pactado */
export function settleOffer(club: Club, offer: UserTransferOffer): { club: Club; offer: UserTransferOffer } {
  const now = gameNow();
  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= offer.amount;
  nextClub.finances.transferBudget = Math.max(0, nextClub.finances.transferBudget - offer.amount);
  nextClub.squadSize += 1;
  nextClub.finances.ledger = [
    { date: now.toISOString(), concept: `Fichaje a ${offer.toClubName}: ${offer.playerName}`, amount: offer.amount, type: "out" as const },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  nextClub.updatedAt = Date.now();
  return { club: nextClub, offer: { ...offer, status: "liquidada", resolvedAt: Date.now() } };
}

export const OFFER_STATUS_STYLE: Record<UserTransferOffer["status"], string> = {
  pendiente: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  aceptada: "border-turf-500/40 bg-turf-500/10 text-turf-300",
  rechazada: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  liquidada: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};
