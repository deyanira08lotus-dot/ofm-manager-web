/**
 * src/game/livematch.ts
 * DIRECCIÓN DE PARTIDO EN VIVO (FASE 16).
 *
 * Hasta ahora el simulador resolvía los 90 minutos de golpe. Este motor lo
 * convierte en una máquina de estados que se puede PAUSAR: el usuario dirige
 * desde el banquillo, hace cambios, ajusta la táctica y ve cómo cambia el
 * partido en tiempo real.
 *
 * - Simulación incremental minuto a minuto (misma matemática que match.ts).
 * - Cambios en vivo (5 por partido) y ajustes tácticos con efecto inmediato.
 * - Momento del partido (inercia) que premia leer bien el encuentro.
 * - Al terminar produce un MatchResult idéntico al del simulador clásico,
 *   así encaja con liga, copas, fama, récords y noticias sin tocar nada.
 *
 * Motor puro (sin React ni Firebase).
 */
import type { Player, Tactics } from "@/types";
import type {
  ConditionUpdate, MatchEvent, MatchPlayerLine, MatchResult, MatchSideResult,
  MatchTeamInput, MatchTeamStats, StatUpdate,
} from "./match";
import { teamPower } from "./match";
import { POSITION_MAP } from "./data/traits";
import { Rng, clamp } from "./rng";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type Side = "home" | "away";

export interface LivePlayerState {
  player: Player;
  onPitch: boolean;
  minutesPlayed: number;
  fatigue: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  conceded: number;
  rating: number;
  started: boolean;
}

export interface LiveMatchState {
  id: string;
  seed: string;
  date: string;
  competition: string;
  round: number | null;
  leagueId: string | null;
  fixtureId: string | null;
  neutral: boolean;
  userSide: Side;
  minute: number;
  finished: boolean;
  goals: Record<Side, number>;
  stats: Record<Side, MatchTeamStats>;
  events: MatchEvent[];
  squads: Record<Side, Record<string, LivePlayerState>>;
  teams: Record<Side, MatchTeamInput>;
  subsUsed: Record<Side, number>;
  /** -100 (rival dominando) … +100 (nosotros dominando) */
  momentum: number;
  /** Ajustes tácticos hechos por el usuario en este partido */
  adjustments: number;
  rngCursor: number;
}

export const MAX_SUBS = 5;
export const MAX_ADJUSTMENTS = 6;

/** Bloques en los que se puede pausar cómodamente */
export const LIVE_CHECKPOINTS = [15, 30, 45, 60, 75, 90];

/* ------------------------------------------------------------------ */
/* Utilidades internas                                                 */
/* ------------------------------------------------------------------ */

const PERSONALITY_BIG_GAME: Record<string, number> = {
  "Líder nato": 1.04, Determinado: 1.03, Ambicioso: 1.03, Profesional: 1.02,
  "Modelo a seguir": 1.02, Trabajador: 1.01, Leal: 1.0, Bohemio: 0.99,
  Egoísta: 0.99, Temperamental: 0.97, Inconstante: 0.96, Tímido: 0.95,
};

function effective(p: Player, fatigue: number): number {
  const form = 0.92 + (p.form / 100) * 0.16;
  const morale = 0.96 + (p.morale / 100) * 0.08;
  const fit = 0.84 + (Math.max(0, p.fitness - fatigue) / 100) * 0.16;
  const pers = PERSONALITY_BIG_GAME[p.personality] ?? 1;
  return p.overall * form * morale * fit * pers;
}

function groupOf(p: Player) {
  return POSITION_MAP[p.position]?.group ?? "MED";
}

function emptyStats(): MatchTeamStats {
  return { possession: 50, shots: 0, onTarget: 0, corners: 0, fouls: 0, yellow: 0, red: 0, xg: 0 };
}

function buildSquadState(team: MatchTeamInput): Record<string, LivePlayerState> {
  const out: Record<string, LivePlayerState> = {};
  team.starters.forEach((p) => {
    out[p.id] = { player: p, onPitch: true, minutesPlayed: 0, fatigue: 0, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, rating: 6.4, started: true };
  });
  team.bench.forEach((p) => {
    out[p.id] = { player: p, onPitch: false, minutesPlayed: 0, fatigue: 0, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, rating: 6.2, started: false };
  });
  return out;
}

export function onPitchPlayers(state: LiveMatchState, side: Side): LivePlayerState[] {
  return Object.values(state.squads[side]).filter((s) => s.onPitch);
}

export function benchPlayers(state: LiveMatchState, side: Side): LivePlayerState[] {
  return Object.values(state.squads[side]).filter((s) => !s.onPitch && s.minutesPlayed === 0 && s.red === 0);
}

/* ------------------------------------------------------------------ */
/* Creación                                                            */
/* ------------------------------------------------------------------ */

export function createLiveMatch(input: {
  id: string;
  seed: string;
  date: string;
  competition: string;
  round?: number | null;
  leagueId?: string | null;
  fixtureId?: string | null;
  home: MatchTeamInput;
  away: MatchTeamInput;
  neutral?: boolean;
}): LiveMatchState {
  const userSide: Side = input.home.isUser ? "home" : "away";
  const state: LiveMatchState = {
    id: input.id,
    seed: input.seed,
    date: input.date,
    competition: input.competition,
    round: input.round ?? null,
    leagueId: input.leagueId ?? null,
    fixtureId: input.fixtureId ?? null,
    neutral: input.neutral ?? false,
    userSide,
    minute: 0,
    finished: false,
    goals: { home: 0, away: 0 },
    stats: { home: emptyStats(), away: emptyStats() },
    events: [],
    squads: { home: buildSquadState(input.home), away: buildSquadState(input.away) },
    teams: { home: input.home, away: input.away },
    subsUsed: { home: 0, away: 0 },
    momentum: 0,
    adjustments: 0,
    rngCursor: 0,
  };

  const homeBoost = state.neutral ? 0 : 3.2;
  const power = { home: teamPower(input.home, homeBoost), away: teamPower(input.away, 0) };
  const share = power.home.mid / (power.home.mid + power.away.mid);
  state.stats.home.possession = Math.round(Math.max(28, Math.min(72, share * 100)));
  state.stats.away.possession = 100 - state.stats.home.possession;

  state.events.push({
    minute: 0,
    type: "info",
    side: "none",
    text: `Todo listo en ${state.neutral ? "campo neutral" : `el estadio del ${input.home.name}`}. ¡Comienza el partido!`,
    score: [0, 0],
  });

  return state;
}

/* ------------------------------------------------------------------ */
/* Simulación incremental                                              */
/* ------------------------------------------------------------------ */

interface Powers {
  home: ReturnType<typeof teamPower>;
  away: ReturnType<typeof teamPower>;
}

/** Recalcula la potencia usando SOLO los jugadores que están en el campo */
function currentPowers(state: LiveMatchState): Powers {
  const build = (side: Side) => {
    const onPitch = onPitchPlayers(state, side).map((s) => s.player);
    const team: MatchTeamInput = { ...state.teams[side], starters: onPitch };
    const boost = side === "home" && !state.neutral ? 3.2 : 0;
    const base = teamPower(team, boost);
    // Penalización por inferioridad numérica
    const missing = Math.max(0, 11 - onPitch.length);
    const penalty = missing * 4.5;
    return {
      ...base,
      att: base.att - penalty,
      mid: base.mid - penalty * 1.2,
      def: base.def - penalty * 0.8,
    };
  };
  return { home: build("home"), away: build("away") };
}

function mentalityMod(t: Tactics) {
  const table: Record<string, { att: number; def: number; tempo: number }> = {
    "Muy defensiva": { att: -9, def: 10, tempo: -12 },
    Defensiva: { att: -4, def: 6, tempo: -6 },
    Equilibrada: { att: 0, def: 0, tempo: 0 },
    Ofensiva: { att: 6, def: -5, tempo: 7 },
    "Muy ofensiva": { att: 11, def: -10, tempo: 13 },
  };
  return table[t.mentality] ?? table.Equilibrada;
}

export interface AdvanceResult {
  state: LiveMatchState;
  newEvents: MatchEvent[];
}

/**
 * Avanza la simulación hasta `toMinute` (máximo 90) devolviendo los eventos
 * generados en ese tramo. Es determinista: el cursor del RNG se guarda en el
 * estado, así que reanudar produce siempre la misma secuencia.
 */
export function advanceLive(state: LiveMatchState, toMinute: number): AdvanceResult {
  if (state.finished) return { state, newEvents: [] };
  const next: LiveMatchState = JSON.parse(JSON.stringify(state));
  const target = Math.min(90, Math.max(next.minute, Math.round(toMinute)));
  const newEvents: MatchEvent[] = [];

  const push = (e: Omit<MatchEvent, "score">) => {
    const ev: MatchEvent = { ...e, score: [next.goals.home, next.goals.away] };
    next.events.push(ev);
    newEvents.push(ev);
  };

  const sides: Side[] = ["home", "away"];
  const other = (s: Side): Side => (s === "home" ? "away" : "home");

  while (next.minute < target) {
    next.minute += 1;
    const minute = next.minute;
    next.rngCursor += 1;
    const rng = new Rng(`${next.seed}:m${minute}:${next.rngCursor}:${next.adjustments}:${next.subsUsed.home}${next.subsUsed.away}`);
    const power = currentPowers(next);

    if (minute === 45) {
      push({ minute, type: "info", side: "none", text: `Descanso: ${next.teams.home.short} ${next.goals.home} - ${next.goals.away} ${next.teams.away.short}.` });
    }

    for (const side of sides) {
      const foe = other(side);
      const tactics = next.teams[side].tactics;
      const m = mentalityMod(tactics);
      const onPitch = onPitchPlayers(next, side);
      if (!onPitch.length) continue;

      // Desgaste físico (el ritmo y la presión cansan más)
      for (const s of onPitch) {
        const drain = (0.34 - s.player.attributes.stamina / 900) * (0.7 + tactics.tempo / 130 + tactics.pressing / 320);
        s.fatigue += Math.max(0.08, drain);
        s.minutesPlayed += 1;
      }

      // Momento del partido: favorece a quien domina
      const momentumFor = side === next.userSide ? next.momentum : -next.momentum;
      const momentumBoost = momentumFor / 55;

      const tempo = 0.82 + tactics.tempo / 100 * 0.34 + m.tempo / 220;
      const chanceRate =
        Math.max(2, Math.min(15, 4.6 + (power[side].att + m.att - power[foe].def) / 8.5 + (power[side].mid - power[foe].mid) / 22 + momentumBoost)) *
        tempo / 90;

      if (rng.chance(chanceRate)) {
        resolveChance(next, side, minute, rng, power, push);
      }

      // Faltas y tarjetas (la presión alta genera más)
      if (rng.chance(0.05 + tactics.pressing / 2400 + power[side].aggression / 4200)) {
        resolveCard(next, side, minute, rng, push);
      }

      // Lesiones
      if (rng.chance(0.0016)) {
        const victim = rng.pick(onPitch);
        if (victim) {
          victim.onPitch = false;
          push({ minute, type: "injury", side, playerName: victim.player.name, text: `${victim.player.name} cae lesionado y no puede continuar.` });
          // La IA repone automáticamente; el usuario decide
          if (side !== next.userSide) autoSub(next, side, minute, rng, push);
        }
      }

      // Cambios automáticos de la IA
      if (side !== next.userSide && (minute === 62 || minute === 72 || minute === 80) && rng.chance(0.75)) {
        autoSub(next, side, minute, rng, push);
      }
    }

    // Inercia: se mueve con las ocasiones y tiende a cero
    next.momentum = clamp(next.momentum * 0.97, -100, 100);
  }

  if (next.minute >= 90 && !next.finished) {
    next.finished = true;
    push({
      minute: 90,
      type: "info",
      side: "none",
      text: `Final del encuentro: ${next.teams.home.name} ${next.goals.home} - ${next.goals.away} ${next.teams.away.name}.`,
    });
  }

  return { state: next, newEvents };
}

function resolveChance(
  state: LiveMatchState,
  side: Side,
  minute: number,
  rng: Rng,
  power: Powers,
  push: (e: Omit<MatchEvent, "score">) => void
) {
  const foe: Side = side === "home" ? "away" : "home";
  const attackers = onPitchPlayers(state, side).filter((s) => s.player.position !== "GK");
  if (!attackers.length) return;

  state.stats[side].shots++;
  const quality = Math.max(0.04, Math.min(0.55, 0.09 + rng.next() * 0.22 + (power[side].att - power[foe].def) / 480));
  state.stats[side].xg = Math.round((state.stats[side].xg + quality) * 100) / 100;

  // Momento a favor del que ataca
  const delta = side === state.userSide ? 6 : -6;
  state.momentum = clamp(state.momentum + delta, -100, 100);

  const shooter = rng.weighted(
    attackers.map((s) => {
      const g = groupOf(s.player);
      const base = g === "DEL" ? 5 : g === "MED" ? 2.1 : 0.55;
      return [s, base * (0.5 + s.player.attributes.finishing / 90) * (0.6 + effective(s.player, s.fatigue) / 120)] as const;
    })
  );

  const onTargetP = 0.42 + (power[side].att - power[foe].def) / 420;
  if (!rng.chance(onTargetP)) {
    if (rng.chance(0.35)) state.stats[side].corners++;
    else if (rng.chance(0.3)) {
      push({ minute, type: "miss", side, playerName: shooter.player.name, text: `${shooter.player.name} dispara fuera por muy poco.` });
    }
    return;
  }

  state.stats[side].onTarget++;
  const gkFactor = 1.22 - power[foe].gk / 200;
  if (rng.chance(Math.min(0.62, quality * gkFactor * 1.5))) {
    state.goals[side]++;
    shooter.goals++;
    const others = attackers.filter((s) => s.player.id !== shooter.player.id);
    const assister = rng.chance(0.72) && others.length
      ? rng.weighted(others.map((s) => {
          const g = groupOf(s.player);
          return [s, (g === "MED" ? 3 : g === "DEL" ? 2.2 : 1) * (0.5 + s.player.attributes.vision / 90)] as const;
        }))
      : null;
    if (assister) assister.assists++;

    onPitchPlayers(state, foe).forEach((s) => {
      if (groupOf(s.player) === "DEF" || s.player.position === "GK") s.conceded++;
    });

    state.momentum = clamp(state.momentum + (side === state.userSide ? 14 : -14), -100, 100);
    push({
      minute, type: "goal", side,
      playerName: shooter.player.name,
      secondName: assister?.player.name,
      text: assister
        ? `¡GOL de ${shooter.player.name}! Asistencia de ${assister.player.name}.`
        : `¡GOL de ${shooter.player.name}! Definición perfecta.`,
    });
  } else {
    const gk = onPitchPlayers(state, foe).find((s) => s.player.position === "GK");
    if (gk && rng.chance(0.55)) {
      push({ minute, type: "save", side: foe, playerName: gk.player.name, secondName: shooter.player.name, text: `¡Paradón de ${gk.player.name} al remate de ${shooter.player.name}!` });
    }
  }
}

function resolveCard(
  state: LiveMatchState,
  side: Side,
  minute: number,
  rng: Rng,
  push: (e: Omit<MatchEvent, "score">) => void
) {
  const players = onPitchPlayers(state, side).filter((s) => s.player.position !== "GK");
  if (!players.length) return;
  state.stats[side].fouls++;

  const offender = rng.weighted(
    players.map((s) => [s, 0.4 + s.player.attributes.aggression / 55 + (s.player.personality === "Temperamental" ? 1.2 : 0)] as const)
  );

  if (rng.chance(0.022) && offender.yellow === 0) {
    offender.red = 1;
    offender.onPitch = false;
    state.stats[side].red++;
    push({ minute, type: "card", side, playerName: offender.player.name, text: `¡ROJA DIRECTA! ${offender.player.name} deja al equipo con uno menos.` });
  } else if (rng.chance(0.16)) {
    offender.yellow++;
    state.stats[side].yellow++;
    if (offender.yellow >= 2) {
      offender.red = 1;
      offender.onPitch = false;
      state.stats[side].red++;
      push({ minute, type: "card", side, playerName: offender.player.name, text: `Segunda amarilla para ${offender.player.name}: expulsado.` });
    } else {
      push({ minute, type: "card", side, playerName: offender.player.name, text: `Tarjeta amarilla para ${offender.player.name}.` });
    }
  }
}

function autoSub(
  state: LiveMatchState,
  side: Side,
  minute: number,
  rng: Rng,
  push: (e: Omit<MatchEvent, "score">) => void
) {
  if (state.subsUsed[side] >= MAX_SUBS) return;
  const bench = benchPlayers(state, side);
  if (!bench.length) return;
  const tired = onPitchPlayers(state, side)
    .filter((s) => s.player.position !== "GK")
    .sort((a, b) => (a.player.fitness - a.fatigue) - (b.player.fitness - b.fatigue))[0];
  if (!tired) return;
  const wanted = groupOf(tired.player);
  const incoming =
    bench.filter((s) => groupOf(s.player) === wanted).sort((a, b) => b.player.overall - a.player.overall)[0] ??
    rng.pick(bench);

  tired.onPitch = false;
  incoming.onPitch = true;
  state.subsUsed[side]++;
  push({ minute, type: "sub", side, playerName: incoming.player.name, secondName: tired.player.name, text: `Cambio: entra ${incoming.player.name} por ${tired.player.name}.` });
}

/* ------------------------------------------------------------------ */
/* Acciones del usuario                                                */
/* ------------------------------------------------------------------ */

export interface LiveActionResult {
  state: LiveMatchState;
  error?: string;
}

export function makeSubstitution(state: LiveMatchState, outId: string, inId: string): LiveActionResult {
  if (state.finished) return { state, error: "El partido ha terminado." };
  const side = state.userSide;
  if (state.subsUsed[side] >= MAX_SUBS) return { state, error: `Ya has agotado los ${MAX_SUBS} cambios.` };

  const next: LiveMatchState = JSON.parse(JSON.stringify(state));
  const out = next.squads[side][outId];
  const inc = next.squads[side][inId];
  if (!out || !out.onPitch) return { state, error: "Ese jugador no está en el campo." };
  if (!inc || inc.onPitch || inc.minutesPlayed > 0) return { state, error: "Ese suplente no está disponible." };

  out.onPitch = false;
  inc.onPitch = true;
  next.subsUsed[side]++;
  // Sangre fresca: pequeño empujón de inercia
  next.momentum = clamp(next.momentum + 5, -100, 100);
  next.events.push({
    minute: next.minute,
    type: "sub",
    side,
    playerName: inc.player.name,
    secondName: out.player.name,
    text: `Cambio en tu equipo: entra ${inc.player.name} por ${out.player.name}.`,
    score: [next.goals.home, next.goals.away],
  });
  return { state: next };
}

export function adjustTactics(state: LiveMatchState, patch: Partial<Tactics>): LiveActionResult {
  if (state.finished) return { state, error: "El partido ha terminado." };
  if (state.adjustments >= MAX_ADJUSTMENTS) {
    return { state, error: `Máximo ${MAX_ADJUSTMENTS} ajustes tácticos por partido.` };
  }
  const next: LiveMatchState = JSON.parse(JSON.stringify(state));
  const side = next.userSide;
  next.teams[side] = { ...next.teams[side], tactics: { ...next.teams[side].tactics, ...patch } };
  next.adjustments++;

  const label =
    patch.mentality ? `Mentalidad: ${patch.mentality}` :
    patch.pressing !== undefined ? `Presión ajustada a ${patch.pressing}` :
    patch.tempo !== undefined ? `Ritmo ajustado a ${patch.tempo}` :
    patch.width !== undefined ? `Amplitud ajustada a ${patch.width}` : "Ajuste táctico";

  next.events.push({
    minute: next.minute,
    type: "info",
    side,
    text: `Instrucción desde el banquillo — ${label}.`,
    score: [next.goals.home, next.goals.away],
  });
  return { state: next };
}

/* ------------------------------------------------------------------ */
/* Cierre: convertir a MatchResult                                     */
/* ------------------------------------------------------------------ */

export function buildResult(state: LiveMatchState): MatchResult {
  const rng = new Rng(`${state.seed}:ratings`);
  const sides: Side[] = ["home", "away"];
  const lineups: Record<Side, MatchPlayerLine[]> = { home: [], away: [] };

  const resultFor = (side: Side) => {
    const foe: Side = side === "home" ? "away" : "home";
    return state.goals[side] > state.goals[foe] ? 1 : state.goals[side] === state.goals[foe] ? -0 + (state.goals.home === state.goals.away ? 0 : -1) : -1;
  };

  for (const side of sides) {
    for (const s of Object.values(state.squads[side])) {
      if (s.minutesPlayed === 0 && !s.started) continue;
      let r = 6.3;
      r += s.goals * 1.15 + s.assists * 0.7;
      r += resultFor(side) * 0.25;
      r -= s.yellow * 0.3 + s.red * 1.2;
      if (s.player.position === "GK") r += s.conceded === 0 ? 0.8 : -0.28 * s.conceded;
      else if (groupOf(s.player) === "DEF") r += s.conceded === 0 ? 0.45 : -0.15 * s.conceded;
      r += (rng.next() - 0.5) * 0.7;
      r = Math.max(3, Math.min(10, r));

      lineups[side].push({
        playerId: s.player.id,
        name: s.player.name,
        position: s.player.position,
        rating: Math.round(r * 10) / 10,
        goals: s.goals,
        assists: s.assists,
        minutes: Math.round(s.minutesPlayed),
        yellow: s.yellow,
        red: s.red,
        started: s.started,
      });
    }
  }

  const all = [
    ...lineups.home.map((l) => ({ l, side: "home" as Side })),
    ...lineups.away.map((l) => ({ l, side: "away" as Side })),
  ].sort((a, b) => b.l.rating - a.l.rating);
  const best = all[0];

  const sideRating = (side: Side) =>
    lineups[side].length
      ? Math.round((lineups[side].reduce((s, l) => s + l.rating, 0) / lineups[side].length) * 10) / 10
      : 6;

  /* Efectos posteriores solo para el equipo del usuario */
  const conditionUpdates: Record<string, ConditionUpdate> = {};
  const statUpdates: Record<string, StatUpdate> = {};
  const us = state.userSide;
  const foe: Side = us === "home" ? "away" : "home";
  const res = state.goals[us] > state.goals[foe] ? 1 : state.goals[us] === state.goals[foe] ? 0 : -1;
  const cleanSheet = state.goals[foe] === 0 ? 1 : 0;

  for (const line of lineups[us]) {
    const s = state.squads[us][line.playerId];
    if (!s) continue;
    const perfDelta = (line.rating - 6.6) * 4.2;
    conditionUpdates[line.playerId] = {
      form: Math.round(clamp(s.player.form + perfDelta * 0.55 + res * 2.2, 15, 99)),
      morale: Math.round(clamp(s.player.morale + res * 3.4 + perfDelta * 0.25, 10, 99)),
      fitness: Math.round(clamp(s.player.fitness - Math.min(42, s.fatigue * 1.05), 18, 100)),
    };
    statUpdates[line.playerId] = {
      apps: line.minutes > 0 ? 1 : 0,
      goals: line.goals,
      assists: line.assists,
      minutes: line.minutes,
      yellow: line.yellow,
      red: line.red,
      cleanSheets: line.position === "GK" || groupOf(s.player) === "DEF" ? cleanSheet : 0,
      ratingSum: line.rating,
    };
  }
  // Suplentes sin jugar recuperan físico
  for (const s of Object.values(state.squads[us])) {
    if (s.minutesPlayed > 0 || s.started) continue;
    conditionUpdates[s.player.id] = {
      form: Math.round(clamp(s.player.form - 0.8, 15, 99)),
      morale: Math.round(clamp(s.player.morale + (res > 0 ? 0.8 : -1.4), 10, 99)),
      fitness: Math.round(Math.min(100, s.player.fitness + 3)),
    };
  }

  const build = (side: Side): MatchSideResult => ({
    clubId: state.teams[side].clubId,
    name: state.teams[side].name,
    short: state.teams[side].short,
    colors: state.teams[side].colors,
    isUser: state.teams[side].isUser,
    goals: state.goals[side],
    stats: state.stats[side],
    lineup: lineups[side].sort((a, b) => (b.started ? 1 : 0) - (a.started ? 1 : 0) || b.rating - a.rating),
    rating: sideRating(side),
  });

  return {
    id: state.id,
    date: state.date,
    competition: state.competition,
    round: state.round,
    leagueId: state.leagueId,
    home: build("home"),
    away: build("away"),
    events: state.events,
    userSide: state.userSide,
    motm: best ? { name: best.l.name, rating: best.l.rating, side: best.side } : null,
    conditionUpdates,
    statUpdates,
  };
}

/* ------------------------------------------------------------------ */
/* Ayudas para la interfaz                                             */
/* ------------------------------------------------------------------ */

export interface LiveAdvice {
  text: string;
  tone: "good" | "warn" | "bad";
}

/** Consejos del segundo entrenador según lo que está pasando */
export function dugoutAdvice(state: LiveMatchState): LiveAdvice[] {
  const out: LiveAdvice[] = [];
  const us = state.userSide;
  const foe: Side = us === "home" ? "away" : "home";
  const diff = state.goals[us] - state.goals[foe];

  const tired = onPitchPlayers(state, us).filter((s) => s.player.fitness - s.fatigue < 55);
  if (tired.length >= 3) {
    out.push({ text: `${tired.length} jugadores están fundidos. Considera refrescar el equipo.`, tone: "bad" });
  } else if (tired.length) {
    out.push({ text: `${tired[0].player.name} empieza a acusar el esfuerzo.`, tone: "warn" });
  }

  const booked = onPitchPlayers(state, us).filter((s) => s.yellow === 1);
  if (booked.length) {
    out.push({ text: `${booked.map((s) => s.player.name).join(", ")} con amarilla: riesgo de expulsión.`, tone: "warn" });
  }

  if (state.minute >= 65 && diff < 0) {
    out.push({ text: "Vamos por detrás y queda poco: subir la mentalidad puede ser la única opción.", tone: "warn" });
  }
  if (state.minute >= 75 && diff > 0) {
    out.push({ text: "Con la ventaja a favor, cerrarse atrás protegería el resultado.", tone: "good" });
  }
  if (state.momentum >= 35) out.push({ text: "El equipo domina el partido: es el momento de apretar.", tone: "good" });
  if (state.momentum <= -35) out.push({ text: "El rival nos está comiendo. Hay que frenar el partido.", tone: "bad" });

  if (state.stats[us].shots >= 8 && state.goals[us] === 0) {
    out.push({ text: "Generamos ocasiones pero no entran: falta pegada arriba.", tone: "warn" });
  }
  if (!out.length) out.push({ text: "El partido está controlado. Sin novedades desde el banquillo.", tone: "good" });
  return out.slice(0, 4);
}

export function momentumLabel(m: number): string {
  if (m >= 45) return "Dominio total";
  if (m >= 18) return "Llevamos la iniciativa";
  if (m > -18) return "Partido igualado";
  if (m > -45) return "El rival manda";
  return "Nos están arrollando";
}

export function conditionOf(s: LivePlayerState): number {
  return clamp(s.player.fitness - s.fatigue, 0, 100);
}
