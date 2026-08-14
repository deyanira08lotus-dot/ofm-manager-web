/**
 * src/game/match.ts
 * SIMULADOR DE PARTIDOS.
 * Determinista (semilla) y basado en: atributos, formación, tácticas, forma, moral,
 * fatiga, química, estilos, personalidades, entrenador, localía y calidad del rival.
 * Genera ocasiones, goles, asistencias, tarjetas, cambios, lesiones y estadísticas.
 *
 * No importa React ni Firebase: el mismo código puede correr en Cloud Functions.
 */
import type { Player, Tactics } from "@/types";
import { FORMATIONS, POSITION_MAP } from "./data/traits";
import { Rng } from "./rng";
import { chemistryBetween } from "./players";

/* ------------------------------- Tipos ------------------------------- */

export interface MatchEvent {
  minute: number;
  type: "goal" | "save" | "miss" | "card" | "sub" | "injury" | "info";
  side: "home" | "away" | "none";
  playerName?: string;
  secondName?: string;
  text: string;
  score: [number, number];
}

export interface MatchPlayerLine {
  playerId: string;
  name: string;
  position: string;
  rating: number;
  goals: number;
  assists: number;
  minutes: number;
  yellow: number;
  red: number;
  started: boolean;
}

export interface MatchTeamStats {
  possession: number;
  shots: number;
  onTarget: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  xg: number;
}

export interface MatchSideResult {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  isUser: boolean;
  goals: number;
  stats: MatchTeamStats;
  lineup: MatchPlayerLine[];
  rating: number;
}

export interface ConditionUpdate {
  form: number;
  morale: number;
  fitness: number;
  injuryDays?: number;
  injuryName?: string;
}

export interface StatUpdate {
  apps: number;
  goals: number;
  assists: number;
  minutes: number;
  yellow: number;
  red: number;
  cleanSheets: number;
  ratingSum: number;
}

export interface MatchResult {
  id: string;
  date: string;
  competition: string;
  round: number | null;
  leagueId: string | null;
  home: MatchSideResult;
  away: MatchSideResult;
  events: MatchEvent[];
  userSide: "home" | "away" | null;
  motm: { name: string; rating: number; side: "home" | "away" } | null;
  conditionUpdates: Record<string, ConditionUpdate>;
  statUpdates: Record<string, StatUpdate>;
}

export interface MatchTeamInput {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  starters: Player[];
  bench: Player[];
  tactics: Tactics;
  coachLevel: number;
  isUser: boolean;
}

/* --------------------------- Utilidades ----------------------------- */

const MENTALITY: Record<string, { att: number; def: number; tempo: number }> = {
  "Muy defensiva": { att: -9, def: 10, tempo: -12 },
  Defensiva: { att: -4, def: 6, tempo: -6 },
  Equilibrada: { att: 0, def: 0, tempo: 0 },
  Ofensiva: { att: 6, def: -5, tempo: 7 },
  "Muy ofensiva": { att: 11, def: -10, tempo: 13 },
};

const PERSONALITY_BIG_GAME: Record<string, number> = {
  "Líder nato": 1.04, Determinado: 1.03, Ambicioso: 1.03, Profesional: 1.02,
  "Modelo a seguir": 1.02, Trabajador: 1.01, Leal: 1.0, Bohemio: 0.99,
  Egoísta: 0.99, Temperamental: 0.97, Inconstante: 0.96, Tímido: 0.95,
};

function effective(p: Player): number {
  const form = 0.92 + (p.form / 100) * 0.16;
  const morale = 0.96 + (p.morale / 100) * 0.08;
  const fitness = 0.84 + (p.fitness / 100) * 0.16;
  const pers = PERSONALITY_BIG_GAME[p.personality] ?? 1;
  return p.overall * form * morale * fitness * pers;
}

function groupOf(p: Player) {
  return POSITION_MAP[p.position]?.group ?? "MED";
}

function avgGroup(players: Player[], group: string): number {
  const list = players.filter((p) => groupOf(p) === group);
  if (!list.length) return 40;
  return list.reduce((s, p) => s + effective(p), 0) / list.length;
}

/** Resuelve el once inicial y el banquillo a partir de la táctica guardada */
export function resolveLineup(tactics: Tactics, squad: Player[]): { starters: Player[]; bench: Player[] } {
  const available = squad.filter((p) => p.status === "active" && (!p.injury || p.injury.daysOut <= 0));
  const byId = new Map(available.map((p) => [p.id, p]));
  const slots = FORMATIONS[tactics.formation] ?? FORMATIONS["4-3-3"];
  const starters: Player[] = [];
  const used = new Set<string>();

  for (const slot of slots) {
    const id = tactics.lineup?.[slot];
    const p = id ? byId.get(id) : undefined;
    if (p && !used.has(p.id)) {
      starters.push(p);
      used.add(p.id);
    }
  }
  // Completar huecos con los mejores disponibles (portero primero)
  if (!starters.some((p) => p.position === "GK")) {
    const gk = available.filter((p) => p.position === "GK" && !used.has(p.id)).sort((a, b) => b.overall - a.overall)[0];
    if (gk) { starters.unshift(gk); used.add(gk.id); }
  }
  const rest = available.filter((p) => !used.has(p.id)).sort((a, b) => effective(b) - effective(a));
  while (starters.length < 11 && rest.length) {
    const p = rest.shift()!;
    starters.push(p);
    used.add(p.id);
  }
  const bench = (tactics.bench ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p && !used.has(p.id));
  for (const p of rest) {
    if (bench.length >= 7) break;
    if (!bench.some((b) => b.id === p.id)) bench.push(p);
  }
  return { starters: starters.slice(0, 11), bench: bench.slice(0, 7) };
}

/** Química media del once (nacionalidades, personalidades, estilos) */
export function teamChemistry(players: Player[]): number {
  if (players.length < 2) return 50;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      sum += chemistryBetween(players[i], players[j]);
      n++;
    }
  }
  return Math.round(sum / n);
}

export interface TeamPower {
  att: number; mid: number; def: number; gk: number; chem: number; aggression: number;
}

export function teamPower(team: MatchTeamInput, homeBoost: number): TeamPower {
  const s = team.starters;
  const m = MENTALITY[team.tactics.mentality] ?? MENTALITY.Equilibrada;
  const chem = teamChemistry(s);
  const chemMod = 0.94 + (chem / 100) * 0.12;
  const coachMod = 0.97 + (team.coachLevel / 100) * 0.07;
  const gkP = s.find((p) => p.position === "GK");

  const att = (avgGroup(s, "DEL") * 0.55 + avgGroup(s, "MED") * 0.32 + avgGroup(s, "DEF") * 0.13 + m.att) * chemMod * coachMod + homeBoost;
  const mid = (avgGroup(s, "MED") * 0.6 + avgGroup(s, "DEF") * 0.2 + avgGroup(s, "DEL") * 0.2 + team.tactics.pressing * 0.04) * chemMod * coachMod + homeBoost;
  const def = (avgGroup(s, "DEF") * 0.58 + avgGroup(s, "MED") * 0.24 + (gkP ? effective(gkP) : 45) * 0.18 + m.def) * chemMod * coachMod + homeBoost;
  const aggression = s.reduce((acc, p) => acc + p.attributes.aggression, 0) / Math.max(1, s.length) + team.tactics.pressing * 0.15;

  return {
    att, mid, def,
    gk: gkP ? effective(gkP) : 45,
    chem,
    aggression,
  };
}

function pickWeighted(rng: Rng, players: Player[], weightFn: (p: Player) => number): Player | undefined {
  const entries = players.map((p) => [p, Math.max(0.01, weightFn(p))] as const);
  if (!entries.length) return undefined;
  return rng.weighted(entries);
}

/* --------------------------- Simulación ------------------------------ */

export function simulateMatch(input: {
  seed: string;
  id: string;
  date: string;
  competition: string;
  round?: number | null;
  leagueId?: string | null;
  home: MatchTeamInput;
  away: MatchTeamInput;
  neutral?: boolean;
}): MatchResult {
  const rng = new Rng(input.seed);
  const injuries: Record<string, number> = {};
  const homeBoost = input.neutral ? 0 : 3.2;
  const power = { home: teamPower(input.home, homeBoost), away: teamPower(input.away, 0) };

  type Side = "home" | "away";
  const sides: Side[] = ["home", "away"];
  const teams: Record<Side, MatchTeamInput> = { home: input.home, away: input.away };

  const onPitch: Record<Side, Player[]> = { home: [...input.home.starters], away: [...input.away.starters] };
  const benchLeft: Record<Side, Player[]> = { home: [...input.home.bench], away: [...input.away.bench] };
  const subsMade: Record<Side, number> = { home: 0, away: 0 };

  const stats: Record<Side, MatchTeamStats> = {
    home: { possession: 50, shots: 0, onTarget: 0, corners: 0, fouls: 0, yellow: 0, red: 0, xg: 0 },
    away: { possession: 50, shots: 0, onTarget: 0, corners: 0, fouls: 0, yellow: 0, red: 0, xg: 0 },
  };
  const goals: Record<Side, number> = { home: 0, away: 0 };
  const events: MatchEvent[] = [];

  // Registro individual
  const line = new Map<string, MatchPlayerLine & { side: Side; conceded: number }>();
  const register = (p: Player, side: Side, started: boolean, fromMinute: number) => {
    line.set(p.id, {
      playerId: p.id, name: p.name, position: p.position, rating: 6.4,
      goals: 0, assists: 0, minutes: started ? 90 : 90 - fromMinute,
      yellow: 0, red: 0, started, side, conceded: 0,
    });
  };
  sides.forEach((s) => onPitch[s].forEach((p) => register(p, s, true, 0)));

  const fatigue: Record<string, number> = {};
  sides.forEach((s) => onPitch[s].forEach((p) => (fatigue[p.id] = 0)));

  const score = (): [number, number] => [goals.home, goals.away];
  const push = (e: Omit<MatchEvent, "score">) => events.push({ ...e, score: score() });

  push({ minute: 0, type: "info", side: "none", text: `Comienza el partido en ${input.neutral ? "campo neutral" : `el estadio del ${input.home.name}`}.` });

  const tempoOf = (side: Side) =>
    0.82 + (teams[side].tactics.tempo / 100) * 0.34 + (MENTALITY[teams[side].tactics.mentality]?.tempo ?? 0) / 220;

  const expChances = (side: Side) => {
    const other: Side = side === "home" ? "away" : "home";
    const raw = 4.6 + (power[side].att - power[other].def) / 8.5 + (power[side].mid - power[other].mid) / 22;
    return Math.max(2, Math.min(15, raw)) * tempoOf(side);
  };

  const possessionShare = power.home.mid / (power.home.mid + power.away.mid);
  stats.home.possession = Math.round(Math.max(28, Math.min(72, possessionShare * 100 + rng.float(-4, 4))));
  stats.away.possession = 100 - stats.home.possession;

  const chancePerMin: Record<Side, number> = { home: expChances("home") / 90, away: expChances("away") / 90 };

  function resolveChance(side: Side, minute: number) {
    const other: Side = side === "home" ? "away" : "home";
    const atk = power[side];
    const dfn = power[other];
    const attackers = onPitch[side].filter((p) => p.position !== "GK");
    if (!attackers.length) return;

    stats[side].shots++;
    const quality = Math.max(0.04, Math.min(0.55, 0.09 + rng.next() * 0.22 + (atk.att - dfn.def) / 480));
    stats[side].xg += quality;

    const onTargetP = 0.42 + (atk.att - dfn.def) / 420;
    const shooter = pickWeighted(rng, attackers, (p) => {
      const g = groupOf(p);
      const base = g === "DEL" ? 5 : g === "MED" ? 2.1 : 0.55;
      return base * (0.5 + p.attributes.finishing / 90) * (0.6 + effective(p) / 120);
    })!;

    if (!rng.chance(onTargetP)) {
      if (rng.chance(0.35)) {
        stats[side].corners++;
      } else if (rng.chance(0.28)) {
        push({ minute, type: "miss", side, playerName: shooter.name, text: `${shooter.name} dispara fuera por muy poco.` });
      }
      return;
    }

    stats[side].onTarget++;
    const gkFactor = 1.22 - dfn.gk / 200;
    if (rng.chance(Math.min(0.62, quality * gkFactor * 1.5))) {
      goals[side]++;
      const l = line.get(shooter.id);
      if (l) l.goals++;
      const assistCands = onPitch[side].filter((p) => p.id !== shooter.id && p.position !== "GK");
      const assister = rng.chance(0.72)
        ? pickWeighted(rng, assistCands, (p) => {
            const g = groupOf(p);
            const base = g === "MED" ? 3 : g === "DEL" ? 2.2 : 1;
            return base * (0.5 + p.attributes.vision / 90);
          })
        : undefined;
      if (assister) {
        const al = line.get(assister.id);
        if (al) al.assists++;
      }
      // Registrar gol encajado para valoraciones defensivas
      onPitch[other].forEach((p) => {
        const ol = line.get(p.id);
        if (ol && (groupOf(p) === "DEF" || p.position === "GK")) ol.conceded++;
      });
      push({
        minute, type: "goal", side,
        playerName: shooter.name,
        secondName: assister?.name,
        text: assister
          ? `¡GOL de ${shooter.name}! Asistencia de ${assister.name}. ${teams[side].name} celebra.`
          : `¡GOL de ${shooter.name}! Definición perfecta para el ${teams[side].name}.`,
      });
    } else {
      const gk = onPitch[other].find((p) => p.position === "GK");
      if (gk && rng.chance(0.55)) {
        push({ minute, type: "save", side: other, playerName: gk.name, secondName: shooter.name, text: `¡Paradón de ${gk.name} al remate de ${shooter.name}!` });
      }
    }
  }

  function maybeCard(side: Side, minute: number) {
    const players = onPitch[side].filter((p) => p.position !== "GK");
    if (!players.length) return;
    stats[side].fouls++;
    const offender = pickWeighted(rng, players, (p) => 0.4 + p.attributes.aggression / 55 + (p.personality === "Temperamental" ? 1.2 : 0))!;
    const l = line.get(offender.id);
    if (!l) return;
    if (rng.chance(0.022) && l.yellow === 0) {
      l.red = 1;
      stats[side].red++;
      onPitch[side] = onPitch[side].filter((p) => p.id !== offender.id);
      l.minutes = minute;
      push({ minute, type: "card", side, playerName: offender.name, text: `¡ROJA DIRECTA! ${offender.name} deja al ${teams[side].name} con uno menos.` });
    } else if (rng.chance(0.16)) {
      l.yellow++;
      stats[side].yellow++;
      if (l.yellow >= 2) {
        l.red = 1;
        stats[side].red++;
        onPitch[side] = onPitch[side].filter((p) => p.id !== offender.id);
        l.minutes = minute;
        push({ minute, type: "card", side, playerName: offender.name, text: `Segunda amarilla para ${offender.name}: expulsado.` });
      } else {
        push({ minute, type: "card", side, playerName: offender.name, text: `Tarjeta amarilla para ${offender.name}.` });
      }
    }
  }

  function doSub(side: Side, minute: number, forced?: Player) {
    if (subsMade[side] >= 5 || !benchLeft[side].length) return;
    const candidates = onPitch[side].filter((p) => p.position !== "GK" || forced?.position === "GK");
    const out =
      forced ??
      [...candidates].sort(
        (a, b) => a.fitness - (fatigue[a.id] ?? 0) - (b.fitness - (fatigue[b.id] ?? 0))
      )[0];
    if (!out) return;
    const wantGroup = groupOf(out);
    const inP =
      benchLeft[side].filter((p) => groupOf(p) === wantGroup).sort((a, b) => effective(b) - effective(a))[0] ??
      [...benchLeft[side]].sort((a, b) => effective(b) - effective(a))[0];
    if (!inP) return;

    benchLeft[side] = benchLeft[side].filter((p) => p.id !== inP.id);
    onPitch[side] = onPitch[side].filter((p) => p.id !== out.id).concat(inP);
    subsMade[side]++;
    const ol = line.get(out.id);
    if (ol) ol.minutes = minute;
    register(inP, side, false, minute);
    fatigue[inP.id] = 0;
    push({ minute, type: "sub", side, playerName: inP.name, secondName: out.name, text: `Cambio en el ${teams[side].name}: entra ${inP.name} por ${out.name}.` });
  }

  /* ---------------------- Bucle de 90 minutos ---------------------- */
  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 45) {
      push({ minute, type: "info", side: "none", text: `Descanso: ${input.home.short} ${goals.home} - ${goals.away} ${input.away.short}.` });
    }

    for (const side of sides) {
      // Desgaste físico
      for (const p of onPitch[side]) {
        const drain = (0.34 - p.attributes.stamina / 900) * (0.75 + teams[side].tactics.tempo / 130);
        fatigue[p.id] = (fatigue[p.id] ?? 0) + Math.max(0.08, drain);
      }
      if (rng.chance(chancePerMin[side])) resolveChance(side, minute);
      if (rng.chance(0.055 + power[side].aggression / 4200)) maybeCard(side, minute);

      // Lesiones
      if (rng.chance(0.0016)) {
        const victim = rng.pick(onPitch[side]);
        if (victim) {
          const days = 3 + Math.floor(rng.next() * 40);
          const vl = line.get(victim.id);
          if (vl) vl.minutes = minute;
          push({ minute, type: "injury", side, playerName: victim.name, text: `${victim.name} cae lesionado y no puede continuar.` });
          onPitch[side] = onPitch[side].filter((p) => p.id !== victim.id);
          doSub(side, minute, victim);
          if (teams[side].isUser) injuries[victim.id] = days;
        }
      }

      // Cambios tácticos automáticos
      if ((minute === 60 || minute === 70 || minute === 78) && rng.chance(0.7)) doSub(side, minute);
    }
  }

  push({ minute: 90, type: "info", side: "none", text: `Final del encuentro: ${input.home.name} ${goals.home} - ${goals.away} ${input.away.name}.` });

  /* ------------------------- Valoraciones -------------------------- */
  const resultFor = (side: Side) => (goals[side] > goals[side === "home" ? "away" : "home"] ? 1 : goals.home === goals.away ? 0 : -1);

  const lineups: Record<Side, MatchPlayerLine[]> = { home: [], away: [] };
  line.forEach((l) => {
    let r = 6.3;
    r += l.goals * 1.15 + l.assists * 0.7;
    r += resultFor(l.side) * 0.25;
    r -= l.yellow * 0.3 + l.red * 1.2;
    const conceded = l.conceded;
    if (l.position === "GK") r += conceded === 0 ? 0.8 : -0.28 * conceded;
    else if (POSITION_MAP[l.position]?.group === "DEF") r += conceded === 0 ? 0.45 : -0.15 * conceded;
    r += (rng.next() - 0.5) * 0.7;
    r = Math.max(3, Math.min(10, r));
    lineups[l.side].push({ ...l, rating: Math.round(r * 10) / 10 });
  });

  const allLines = [...lineups.home.map((l) => ({ l, side: "home" as Side })), ...lineups.away.map((l) => ({ l, side: "away" as Side }))];
  const best = allLines.sort((a, b) => b.l.rating - a.l.rating)[0];

  const sideRating = (side: Side) =>
    lineups[side].length ? Math.round((lineups[side].reduce((s, l) => s + l.rating, 0) / lineups[side].length) * 10) / 10 : 6;

  /* -------------------- Efectos posteriores ------------------------ */
  const conditionUpdates: Record<string, ConditionUpdate> = {};
  const statUpdates: Record<string, StatUpdate> = {};

  for (const side of sides) {
    if (!teams[side].isUser) continue;
    const res = resultFor(side);
    const cleanSheet = goals[side === "home" ? "away" : "home"] === 0 ? 1 : 0;
    for (const l of lineups[side]) {
      const p = [...teams[side].starters, ...teams[side].bench].find((x) => x.id === l.playerId);
      if (!p) continue;
      const perfDelta = (l.rating - 6.6) * 4.2;
      const newFitness = Math.max(18, Math.min(100, p.fitness - Math.min(42, (fatigue[p.id] ?? 0) * (l.minutes / 90) * 1.05)));
      const newForm = Math.max(15, Math.min(99, p.form + perfDelta * 0.55 + res * 2.2));
      const newMorale = Math.max(10, Math.min(99, p.morale + res * 3.4 + perfDelta * 0.25));
      conditionUpdates[p.id] = {
        form: Math.round(newForm),
        morale: Math.round(newMorale),
        fitness: Math.round(newFitness),
        ...(injuries[p.id] ? { injuryDays: injuries[p.id], injuryName: injuries[p.id] > 25 ? "Rotura muscular" : "Sobrecarga muscular" } : {}),
      };
      statUpdates[p.id] = {
        apps: 1, goals: l.goals, assists: l.assists, minutes: l.minutes,
        yellow: l.yellow, red: l.red,
        cleanSheets: l.position === "GK" || POSITION_MAP[l.position]?.group === "DEF" ? cleanSheet : 0,
        ratingSum: l.rating,
      };
    }
    // Suplentes no utilizados recuperan algo de físico
    for (const p of benchLeft[side]) {
      conditionUpdates[p.id] = {
        form: Math.max(15, Math.min(99, p.form - 0.8)),
        morale: Math.max(10, Math.min(99, p.morale + (res > 0 ? 0.8 : -1.4))),
        fitness: Math.min(100, p.fitness + 3),
      };
    }
  }

  const build = (side: Side): MatchSideResult => ({
    clubId: teams[side].clubId,
    name: teams[side].name,
    short: teams[side].short,
    colors: teams[side].colors,
    isUser: teams[side].isUser,
    goals: goals[side],
    stats: { ...stats[side], xg: Math.round(stats[side].xg * 100) / 100 },
    lineup: lineups[side].sort((a, b) => (b.started ? 1 : 0) - (a.started ? 1 : 0) || b.rating - a.rating),
    rating: sideRating(side),
  });

  return {
    id: input.id,
    date: input.date,
    competition: input.competition,
    round: input.round ?? null,
    leagueId: input.leagueId ?? null,
    home: build("home"),
    away: build("away"),
    events,
    userSide: input.home.isUser ? "home" : input.away.isUser ? "away" : null,
    motm: best ? { name: best.l.name, rating: best.l.rating, side: best.side } : null,
    conditionUpdates,
    statUpdates,
  };
}

/** Simulación rápida (partidos entre equipos controlados por la IA) */
export function quickSim(ratingA: number, ratingB: number, seed: string): [number, number] {
  const rng = new Rng(seed);
  const expA = Math.max(0.25, 1.35 + (ratingA + 3 - ratingB) / 16);
  const expB = Math.max(0.2, 1.15 + (ratingB - ratingA - 3) / 16);
  const poisson = (lambda: number) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng.next();
    } while (p > L && k < 9);
    return k - 1;
  };
  return [poisson(expA), poisson(expB)];
}
