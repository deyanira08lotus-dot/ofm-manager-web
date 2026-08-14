/**
 * src/game/fame.ts
 * FAMA Y COMUNIDAD (FASE 9).
 * - Popularidad local / nacional / internacional y reputación de jugadores.
 * - Afición: seguidores, fidelidad, satisfacción, expectativas y favoritos.
 * - Logros desbloqueables, récords del club y jugadores leyenda.
 * - Rankings globales (clubes, managers, goleadores, valor).
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player } from "@/types";
import type { LeagueState } from "./league";
import type { MatchResult } from "./match";
import type { NationalState } from "./national";
import { clamp } from "./rng";
import { gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface Achievement {
  id: string;
  label: string;
  desc: string;
  icon: string;
  tier: "bronce" | "plata" | "oro" | "leyenda";
  /** 0-1 */
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface ClubRecord {
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: string;
}

export interface LegendPlayer {
  playerId: string;
  name: string;
  score: number;
  reasons: string[];
  status: "leyenda" | "icono" | "referente";
}

export interface FameState {
  id: string;
  ownerUid: string;
  clubId: string;
  unlocked: string[];
  /** Récords históricos persistentes */
  records: {
    biggestWin: { score: string; rival: string; date: string } | null;
    longestUnbeaten: number;
    currentUnbeaten: number;
    mostGoalsMatch: { goals: number; player: string; date: string } | null;
    highestAttendance: number;
    highestBalance: number;
    bestLeaguePosition: number;
    topScorerEver: { name: string; goals: number } | null;
  };
  legends: LegendPlayer[];
  updatedAt: number;
}

export function createFameState(club: Club): FameState {
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    unlocked: [],
    records: {
      biggestWin: null,
      longestUnbeaten: 0,
      currentUnbeaten: 0,
      mostGoalsMatch: null,
      highestAttendance: 0,
      highestBalance: Math.round(club.finances.balance),
      bestLeaguePosition: 99,
      topScorerEver: null,
    },
    legends: [],
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Popularidad de jugadores                                            */
/* ------------------------------------------------------------------ */

export interface FameDelta {
  playerId: string;
  reputation: number;
  local: number;
  national: number;
  international: number;
}

/**
 * Calcula la ganancia de fama tras un partido. La popularidad crece con goles,
 * asistencias, buenas notas y la importancia del rival; el alcance depende de
 * la reputación del club (un crack en un club pequeño solo es famoso en casa).
 */
export function fameFromMatch(
  match: MatchResult,
  players: Player[],
  clubReputation: number,
  rivalRating: number
): FameDelta[] {
  const side = match.userSide === "home" ? match.home : match.away;
  const other = match.userSide === "home" ? match.away : match.home;
  if (!match.userSide) return [];

  const won = side.goals > other.goals;
  const bigWin = won && side.goals - other.goals >= 3;
  const vsStrong = rivalRating >= clubReputation + 8;
  const reach = 0.35 + clubReputation / 160;

  return side.lineup
    .filter((l) => l.minutes > 0)
    .map((l) => {
      const player = players.find((p) => p.id === l.playerId);
      if (!player) return null;
      const perf = Math.max(0, l.rating - 6.4);
      const base = l.goals * 2.4 + l.assists * 1.3 + perf * 1.1 + (won ? 0.5 : 0) + (bigWin ? 0.6 : 0) + (vsStrong && won ? 1.2 : 0);
      if (base <= 0) return null;
      return {
        playerId: l.playerId,
        reputation: Math.round(base * 0.35 * 10) / 10,
        local: Math.round(base * 1.15 * 10) / 10,
        national: Math.round(base * 0.62 * reach * 10) / 10,
        international: Math.round(base * 0.3 * reach * reach * 10) / 10,
      };
    })
    .filter((d): d is FameDelta => d !== null);
}

export function applyFameDeltas(players: Player[], deltas: FameDelta[]): Player[] {
  if (!deltas.length) return players;
  const map = new Map(deltas.map((d) => [d.playerId, d]));
  return players.map((p) => {
    const d = map.get(p.id);
    if (!d) return p;
    return {
      ...p,
      reputation: clamp(p.reputation + d.reputation),
      popularity: {
        local: clamp(p.popularity.local + d.local),
        national: clamp(p.popularity.national + d.national),
        international: clamp(p.popularity.international + d.international),
      },
    };
  });
}

/** Índice de fama global de un jugador (0-100) */
export function fameIndex(p: Player): number {
  return Math.round(
    p.popularity.local * 0.25 + p.popularity.national * 0.35 + p.popularity.international * 0.4
  );
}

export function fameLabel(index: number): { label: string; tone: string } {
  if (index >= 85) return { label: "Icono mundial", tone: "text-fuchsia-300" };
  if (index >= 68) return { label: "Estrella internacional", tone: "text-emerald-300" };
  if (index >= 50) return { label: "Figura nacional", tone: "text-lime-300" };
  if (index >= 32) return { label: "Conocido en la región", tone: "text-yellow-300" };
  if (index >= 16) return { label: "Ídolo local", tone: "text-orange-300" };
  return { label: "Prácticamente desconocido", tone: "text-white/45" };
}

/* ------------------------------------------------------------------ */
/* Afición                                                             */
/* ------------------------------------------------------------------ */

export interface FanReport {
  mood: string;
  tone: "good" | "warn" | "bad";
  notes: string[];
  favourites: { playerId: string; name: string; fame: number }[];
  ticketOpinion: string;
}

export function fanReport(club: Club, players: Player[], leaguePosition: number, teams: number): FanReport {
  const s = club.fanbase.satisfaction;
  const notes: string[] = [];

  const mood =
    s >= 82 ? "Euforia en las gradas" :
    s >= 65 ? "Afición contenta" :
    s >= 45 ? "Ambiente tranquilo" :
    s >= 28 ? "Malestar creciente" : "Rebelión en la grada";
  const tone: FanReport["tone"] = s >= 65 ? "good" : s >= 40 ? "warn" : "bad";

  if (leaguePosition > 0) {
    const third = Math.ceil(teams / 3);
    if (leaguePosition <= third) notes.push(`La clasificación (${leaguePosition}º) ilusiona a la grada.`);
    else if (leaguePosition > teams - third) notes.push(`La posición ${leaguePosition}ª genera preocupación.`);
    else notes.push(`La posición ${leaguePosition}ª se considera aceptable.`);
  }

  if (club.fanbase.loyalty >= 70) notes.push("El núcleo de abonados es muy fiel al club.");
  else if (club.fanbase.loyalty < 40) notes.push("La fidelidad es baja: muchos abonados dudan si renovar.");

  const stars = [...players].sort((a, b) => fameIndex(b) - fameIndex(a)).slice(0, 3);
  if (stars.length && fameIndex(stars[0]) >= 55) {
    notes.push(`${stars[0].name} se ha convertido en el gran referente para la afición.`);
  }

  const fair = 14 + club.reputation * 0.42 + (club.division === 1 ? 12 : 0);
  const ticketOpinion =
    club.stadium.ticketPrice > fair * 1.2 ? "Las entradas se consideran caras." :
    club.stadium.ticketPrice < fair * 0.8 ? "Los precios populares gustan a la grada." :
    "Los precios se consideran razonables.";

  return {
    mood,
    tone,
    notes,
    favourites: stars.map((p) => ({ playerId: p.id, name: p.name, fame: fameIndex(p) })),
    ticketOpinion,
  };
}

/** Actualiza los favoritos de la afición según fama y rendimiento */
export function refreshFavourites(club: Club, players: Player[]): Club {
  const top = [...players].sort((a, b) => fameIndex(b) - fameIndex(a)).slice(0, 3).map((p) => p.id);
  if (JSON.stringify(top) === JSON.stringify(club.fanbase.favouritePlayerIds)) return club;
  return { ...club, fanbase: { ...club.fanbase, favouritePlayerIds: top } };
}

/* ------------------------------------------------------------------ */
/* Logros                                                              */
/* ------------------------------------------------------------------ */

interface AchievementDef {
  id: string;
  label: string;
  desc: string;
  icon: string;
  tier: Achievement["tier"];
  check: (ctx: AchievementContext) => number; // progreso 0-1
}

export interface AchievementContext {
  club: Club;
  players: Player[];
  league: LeagueState | null;
  national: NationalState | null;
  fame: FameState;
  leaguePosition: number;
  matchesPlayed: number;
}

const DEFS: AchievementDef[] = [
  { id: "first_win", label: "Primera victoria", desc: "Gana tu primer partido oficial.", icon: "🎉", tier: "bronce",
    check: (c) => Math.min(1, (c.league ? Object.values(c.league.table).find((r) => r.clubId === c.club.id)?.won ?? 0 : 0)) },
  { id: "five_wins", label: "Racha ganadora", desc: "Consigue 5 victorias en liga.", icon: "🔥", tier: "bronce",
    check: (c) => Math.min(1, ((c.league ? Object.values(c.league.table).find((r) => r.clubId === c.club.id)?.won ?? 0 : 0)) / 5) },
  { id: "unbeaten_5", label: "Muro defensivo", desc: "Encadena 5 partidos sin perder.", icon: "🛡️", tier: "plata",
    check: (c) => Math.min(1, c.fame.records.longestUnbeaten / 5) },
  { id: "goleada", label: "Goleada histórica", desc: "Gana un partido por 4 goles o más.", icon: "💥", tier: "plata",
    check: (c) => (c.fame.records.biggestWin && diffOf(c.fame.records.biggestWin.score) >= 4 ? 1 : 0) },
  { id: "top3", label: "Zona noble", desc: "Colócate entre los 3 primeros de la liga.", icon: "🥉", tier: "plata",
    check: (c) => (c.leaguePosition > 0 && c.leaguePosition <= 3 ? 1 : 0) },
  { id: "champion", label: "Campeón de liga", desc: "Termina la temporada en primera posición.", icon: "🏆", tier: "oro",
    check: (c) => (c.fame.records.bestLeaguePosition === 1 ? 1 : 0) },
  { id: "millionaire", label: "Caja fuerte", desc: "Acumula 25 M € de saldo.", icon: "💰", tier: "oro",
    check: (c) => Math.min(1, c.club.finances.balance / 25_000_000) },
  { id: "stadium_50k", label: "Coliseo", desc: "Alcanza 40.000 espectadores de aforo.", icon: "🏟️", tier: "oro",
    check: (c) => Math.min(1, c.club.stadium.capacity / 40_000) },
  { id: "academy_max", label: "Cantera de élite", desc: "Sube la academia a nivel 6.", icon: "🎓", tier: "plata",
    check: (c) => Math.min(1, (c.club.facilities.academy?.level ?? 1) / 6) },
  { id: "facilities_all", label: "Ciudad deportiva", desc: "Todas las instalaciones a nivel 4 o más.", icon: "🏗️", tier: "oro",
    check: (c) => {
      const levels = Object.values(c.club.facilities).map((f) => f.level);
      return levels.length ? Math.min(1, levels.filter((l) => l >= 4).length / levels.length) : 0;
    } },
  { id: "star_player", label: "Superestrella", desc: "Ten un jugador con nivel 85 o más.", icon: "⭐", tier: "oro",
    check: (c) => Math.min(1, Math.max(0, ...c.players.map((p) => p.overall), 0) / 85) },
  { id: "ss_draft", label: "Diamante en bruto", desc: "Ficha a un jugador de clase SS.", icon: "💎", tier: "leyenda",
    check: (c) => (c.players.some((p) => p.potentialClass === "SS") ? 1 : 0) },
  { id: "world_fame", label: "Icono mundial", desc: "Ten un jugador con fama global 85+.", icon: "🌍", tier: "leyenda",
    check: (c) => Math.min(1, Math.max(0, ...c.players.map(fameIndex), 0) / 85) },
  { id: "nt_coach", label: "Seleccionador nacional", desc: "Dirige una selección nacional.", icon: "🏳️", tier: "oro",
    check: (c) => (c.national && Object.values(c.national.teams).some((t) => t.coach?.isUser) ? 1 : 0) },
  { id: "nt_trophy", label: "Gloria internacional", desc: "Gana un torneo con una selección.", icon: "🌟", tier: "leyenda",
    check: (c) => (c.national && Object.values(c.national.teams).some((t) => t.trophies.length > 0) ? 1 : 0) },
  { id: "fans_50k", label: "Masa social", desc: "Alcanza 80.000 seguidores.", icon: "📣", tier: "plata",
    check: (c) => Math.min(1, c.club.fanbase.followers / 80_000) },
  { id: "board_trust", label: "Confianza absoluta", desc: "Alcanza el 90% de confianza de la directiva.", icon: "🤝", tier: "oro",
    check: (c) => Math.min(1, c.club.board.confidence / 90) },
  { id: "veteran", label: "Veterano del banquillo", desc: "Dirige 30 partidos oficiales.", icon: "📋", tier: "plata",
    check: (c) => Math.min(1, c.matchesPlayed / 30) },
];

function diffOf(score: string): number {
  const [a, b] = score.split("-").map(Number);
  return Math.abs((a || 0) - (b || 0));
}

export function evaluateAchievements(ctx: AchievementContext): Achievement[] {
  return DEFS.map((d) => {
    const progress = Math.max(0, Math.min(1, d.check(ctx)));
    const unlocked = ctx.fame.unlocked.includes(d.id) || progress >= 1;
    return { id: d.id, label: d.label, desc: d.desc, icon: d.icon, tier: d.tier, progress, unlocked };
  });
}

/** Devuelve los logros recién desbloqueados y el estado actualizado */
export function syncAchievements(fame: FameState, achievements: Achievement[]): { fame: FameState; newly: Achievement[] } {
  const newly = achievements.filter((a) => a.progress >= 1 && !fame.unlocked.includes(a.id));
  if (!newly.length) return { fame, newly: [] };
  return {
    fame: { ...fame, unlocked: [...fame.unlocked, ...newly.map((a) => a.id)], updatedAt: Date.now() },
    newly,
  };
}

/* ------------------------------------------------------------------ */
/* Récords                                                             */
/* ------------------------------------------------------------------ */

export function updateRecords(
  fame: FameState,
  match: MatchResult,
  club: Club,
  attendance: number,
  leaguePosition: number
): FameState {
  const next: FameState = JSON.parse(JSON.stringify(fame));
  if (!match.userSide) return next;
  const side = match.userSide === "home" ? match.home : match.away;
  const other = match.userSide === "home" ? match.away : match.home;
  const now = gameNow().toISOString();

  // Mayor victoria
  const diff = side.goals - other.goals;
  const prevDiff = next.records.biggestWin ? diffOf(next.records.biggestWin.score) : -1;
  if (diff > 0 && diff > prevDiff) {
    next.records.biggestWin = { score: `${side.goals}-${other.goals}`, rival: other.name, date: now };
  }

  // Racha sin perder
  if (side.goals >= other.goals) {
    next.records.currentUnbeaten += 1;
    next.records.longestUnbeaten = Math.max(next.records.longestUnbeaten, next.records.currentUnbeaten);
  } else {
    next.records.currentUnbeaten = 0;
  }

  // Más goles en un partido
  const best = [...side.lineup].sort((a, b) => b.goals - a.goals)[0];
  if (best && best.goals > (next.records.mostGoalsMatch?.goals ?? 0)) {
    next.records.mostGoalsMatch = { goals: best.goals, player: best.name, date: now };
  }

  next.records.highestAttendance = Math.max(next.records.highestAttendance, attendance);
  next.records.highestBalance = Math.max(next.records.highestBalance, Math.round(club.finances.balance));
  if (leaguePosition > 0) {
    next.records.bestLeaguePosition = Math.min(next.records.bestLeaguePosition, leaguePosition);
  }
  next.updatedAt = Date.now();
  return next;
}

export function recordList(fame: FameState, league: LeagueState | null, players: Player[]): ClubRecord[] {
  const r = fame.records;
  const topScorer = league
    ? players
        .map((p) => ({ p, s: league.playerStats[p.id] }))
        .filter((x) => x.s)
        .sort((a, b) => (b.s!.goals ?? 0) - (a.s!.goals ?? 0))[0]
    : null;

  return [
    { key: "win", label: "Mayor victoria", icon: "💥", value: r.biggestWin?.score ?? "—", detail: r.biggestWin ? `vs ${r.biggestWin.rival}` : "Sin registrar" },
    { key: "unbeaten", label: "Racha sin perder", icon: "🛡️", value: `${r.longestUnbeaten} partidos`, detail: `Racha actual: ${r.currentUnbeaten}` },
    { key: "goals", label: "Más goles en un partido", icon: "⚽", value: r.mostGoalsMatch ? `${r.mostGoalsMatch.goals}` : "—", detail: r.mostGoalsMatch?.player ?? "Sin registrar" },
    { key: "attendance", label: "Récord de asistencia", icon: "🏟️", value: r.highestAttendance ? r.highestAttendance.toLocaleString("es-ES") : "—", detail: "Espectadores en un partido" },
    { key: "balance", label: "Saldo máximo histórico", icon: "💰", value: `${Math.round(r.highestBalance / 1000).toLocaleString("es-ES")} K €`, detail: "Tesorería del club" },
    { key: "position", label: "Mejor posición liguera", icon: "📈", value: r.bestLeaguePosition < 99 ? `${r.bestLeaguePosition}º` : "—", detail: "Clasificación histórica" },
    { key: "scorer", label: "Máximo goleador", icon: "🎯", value: topScorer ? `${topScorer.s!.goals} goles` : "—", detail: topScorer?.p.name ?? "Sin registrar" },
  ];
}

/* ------------------------------------------------------------------ */
/* Leyendas                                                            */
/* ------------------------------------------------------------------ */

export function computeLegends(
  players: Player[],
  league: LeagueState | null,
  national: NationalState | null
): LegendPlayer[] {
  return players
    .map((p) => {
      const s = league?.playerStats[p.id];
      const caps = national?.playerCaps[p.id];
      const reasons: string[] = [];
      let score = fameIndex(p) * 0.5 + p.reputation * 0.25;

      if (s) {
        score += (s.goals ?? 0) * 2.6 + (s.assists ?? 0) * 1.4 + (s.apps ?? 0) * 0.4;
        if ((s.goals ?? 0) >= 10) reasons.push(`${s.goals} goles esta temporada`);
        if ((s.apps ?? 0) >= 15) reasons.push(`${s.apps} partidos disputados`);
      }
      if (caps) {
        score += caps.caps * 1.8 + caps.goals * 3;
        if (caps.caps > 0) reasons.push(`${caps.caps} internacionalidades`);
      }
      if (p.careerTotals.trophies > 0) reasons.push(`${p.careerTotals.trophies} títulos`);
      if (p.overall >= 80) reasons.push(`Nivel ${Math.round(p.overall)}`);
      if (p.potentialClass === "SS" || p.potentialClass === "S") reasons.push(`Clase ${p.potentialClass}`);

      const status: LegendPlayer["status"] = score >= 130 ? "leyenda" : score >= 85 ? "icono" : "referente";
      return { playerId: p.id, name: p.name, score: Math.round(score), reasons, status };
    })
    .filter((l) => l.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export const TIER_STYLE: Record<Achievement["tier"], string> = {
  bronce: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  plata: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  oro: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  leyenda: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
};
