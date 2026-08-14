/**
 * src/game/scouting.ts
 * CENTRO DE ANÁLISIS Y SCOUTING (FASE 14).
 *
 * - Misiones de ojeo: envías ojeadores a un país durante X días de juego y
 *   descubren jugadores que NO aparecen en el mercado normal.
 * - La precisión del informe depende del nivel del ojeador y del Centro de
 *   análisis; con poca precisión los rangos son enormes (y puedes equivocarte).
 * - Informes de rival previos al partido (rol Analista).
 * - Comparador de jugadores por atributos.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player, PositionCode, StaffMember } from "@/types";
import type { LeagueClub } from "./league";
import { COUNTRIES, COUNTRY_BY_CODE } from "./data/countries";
import { ATTRIBUTE_LABELS, POSITION_MAP, POSITIONS } from "./data/traits";
import { Rng, clamp, uid } from "./rng";
import { generatePlayer } from "./players";
import { addDays, gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type ScoutFocus = "any" | "joven" | "estrella" | "ganga";

export interface ScoutMission {
  id: string;
  scoutId: string;
  scoutName: string;
  scoutLevel: number;
  country: string;
  position: PositionCode | "any";
  focus: ScoutFocus;
  days: number;
  cost: number;
  startedAt: string;
  finishesAt: string;
  completed: boolean;
}

export interface ScoutReport {
  low: number;
  high: number;
  potLow: number;
  potHigh: number;
  confidence: number;
  verdict: string;
  standoutAttrs: { key: string; label: string; value: number }[];
}

export interface Discovery {
  id: string;
  player: Player;
  report: ScoutReport;
  askingPrice: number;
  wageDemand: number;
  foundBy: string;
  foundAt: string;
  expiresAt: string;
  signed: boolean;
}

export interface ScoutingState {
  id: string;
  ownerUid: string;
  clubId: string;
  missions: ScoutMission[];
  discoveries: Discovery[];
  totalMissions: number;
  totalSignings: number;
  updatedAt: number;
}

export const MAX_MISSIONS = 3;
export const MISSION_DURATIONS = [
  { days: 7, label: "Viaje corto", multiplier: 0.7 },
  { days: 14, label: "Estancia media", multiplier: 1 },
  { days: 28, label: "Misión larga", multiplier: 1.45 },
];

export const FOCUS_META: Record<ScoutFocus, { label: string; desc: string; icon: string }> = {
  any: { label: "Sin preferencia", desc: "Cualquier perfil interesante.", icon: "🔍" },
  joven: { label: "Jóvenes promesas", desc: "16-21 años con margen de crecimiento.", icon: "🌱" },
  estrella: { label: "Jugador diferencial", desc: "Nivel alto ya contrastado, caro.", icon: "⭐" },
  ganga: { label: "Oportunidades", desc: "Buena relación calidad-precio.", icon: "💎" },
};

export function createScouting(club: Club): ScoutingState {
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    missions: [],
    discoveries: [],
    totalMissions: 0,
    totalSignings: 0,
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Coste y disponibilidad                                              */
/* ------------------------------------------------------------------ */

export function missionCost(scoutLevel: number, days: number, sameCountry: boolean): number {
  const base = 9_000 + scoutLevel * 320;
  const travel = sameCountry ? 1 : 1.6;
  return Math.round((base * (days / 14) * travel) / 500) * 500;
}

export function availableScouts(staff: StaffMember[], state: ScoutingState): StaffMember[] {
  const busy = new Set(state.missions.filter((m) => !m.completed).map((m) => m.scoutId));
  return staff.filter(
    (s) => (s.role === "Ojeador" || s.role === "Analista" || s.role === "Director deportivo") && !busy.has(s.id)
  );
}

/** Bonus de especialidad: un ojeador especializado en la zona acierta más */
function specialityBonus(scout: StaffMember, country: string): number {
  const c = COUNTRY_BY_CODE[country];
  if (!c) return 0;
  const isSouthAm = ["ARG", "BRA", "CHI", "MEX"].includes(country);
  const isEurope = ["ESP", "FRA", "GER", "ITA", "POR", "NED", "ENG"].includes(country);
  let bonus = 0;
  for (const sp of scout.specialities) {
    if (sp === "Sudamérica" && isSouthAm) bonus += 14;
    if (sp === "Europa" && isEurope) bonus += 14;
    if (sp === "Juveniles") bonus += 6;
    if (sp === "Datos") bonus += 8;
  }
  return bonus;
}

/* ------------------------------------------------------------------ */
/* Lanzar y resolver misiones                                          */
/* ------------------------------------------------------------------ */

export interface StartResult {
  state: ScoutingState;
  club: Club;
  error?: string;
}

export function startMission(params: {
  state: ScoutingState;
  club: Club;
  scout: StaffMember;
  country: string;
  position: PositionCode | "any";
  focus: ScoutFocus;
  days: number;
}): StartResult {
  const { state, club, scout } = params;
  const active = state.missions.filter((m) => !m.completed);
  if (active.length >= MAX_MISSIONS) {
    return { state, club, error: `Máximo ${MAX_MISSIONS} misiones simultáneas.` };
  }
  if (active.some((m) => m.scoutId === scout.id)) {
    return { state, club, error: `${scout.name} ya está de viaje.` };
  }
  const cost = missionCost(scout.level, params.days, params.country === club.country);
  if (club.finances.balance < cost) return { state, club, error: "Saldo insuficiente para financiar el viaje." };

  const now = gameNow();
  const mission: ScoutMission = {
    id: uid("msn"),
    scoutId: scout.id,
    scoutName: scout.name,
    scoutLevel: scout.level,
    country: params.country,
    position: params.position,
    focus: params.focus,
    days: params.days,
    cost,
    startedAt: now.toISOString(),
    finishesAt: addDays(now, params.days).toISOString(),
    completed: false,
  };

  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= cost;
  nextClub.finances.ledger = [
    { date: now.toISOString(), concept: `Misión de ojeo: ${scout.name} → ${COUNTRY_BY_CODE[params.country]?.name ?? params.country}`, amount: cost, type: "out" as const },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  nextClub.updatedAt = Date.now();

  return {
    state: { ...state, missions: [mission, ...state.missions], totalMissions: state.totalMissions + 1, updatedAt: Date.now() },
    club: nextClub,
  };
}

function buildReport(player: Player, precision: number, rng: Rng): ScoutReport {
  const spread = Math.round((1 - precision) * 22) + 2;
  const potSpread = Math.round((1 - precision) * 32) + 3;
  const bias = rng.int(-3, 3);

  // Atributos destacados que el ojeador sí ha podido ver con claridad
  const entries = Object.entries(player.attributes) as [keyof typeof player.attributes, number][];
  const standout = entries
    .filter(([k]) => (player.position === "GK" ? true : !["reflexes", "handling", "aerialReach", "kicking", "oneOnOne", "communication"].includes(k)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => ({ key: k, label: ATTRIBUTE_LABELS[k], value: clamp(v + rng.int(-2, 2)) }));

  const gap = player.potential - player.overall;
  const verdict =
    player.potential >= 85 ? "Puede convertirse en un jugador de época." :
    gap >= 14 ? "Margen de mejora enorme: apuesta de futuro." :
    player.overall >= 74 ? "Rendimiento inmediato garantizado." :
    player.overall >= 62 ? "Refuerzo sólido para la rotación." :
    "Perfil discreto, útil solo como recambio.";

  return {
    low: Math.max(1, player.overall - spread + bias),
    high: Math.min(99, player.overall + spread + bias),
    potLow: Math.max(1, player.potential - potSpread + bias),
    potHigh: Math.min(99, player.potential + potSpread + bias),
    confidence: Math.round(precision * 100),
    verdict,
    standoutAttrs: standout,
  };
}

export interface ResolveResult {
  state: ScoutingState;
  newDiscoveries: Discovery[];
}

/**
 * Completa las misiones vencidas y genera los descubrimientos.
 * Determinista por semilla (misión), así el servidor puede replicarlo.
 */
export function resolveMissions(state: ScoutingState, club: Club): ResolveResult {
  const nowMs = gameNow().getTime();
  const analyticsLevel = club.facilities.analytics?.level ?? 1;
  const next: ScoutingState = JSON.parse(JSON.stringify(state));
  const newDiscoveries: Discovery[] = [];

  for (const mission of next.missions) {
    if (mission.completed || Date.parse(mission.finishesAt) > nowMs) continue;
    mission.completed = true;

    const rng = new Rng(`scout:${mission.id}`);
    const country = COUNTRY_BY_CODE[mission.country] ?? COUNTRIES[0];
    // Cuantos más días y mejor ojeador, más hallazgos
    const count = Math.max(1, Math.min(4, Math.round(mission.days / 9 + mission.scoutLevel / 45 + rng.float(0, 1))));

    for (let i = 0; i < count; i++) {
      const position: PositionCode =
        mission.position !== "any" && rng.chance(0.7) ? mission.position : rng.pick(POSITIONS.map((p) => p.code));

      let minAge = 17;
      let maxAge = 33;
      let quality = 40 + club.reputation * 0.35 + mission.scoutLevel * 0.22;

      if (mission.focus === "joven") { minAge = 16; maxAge = 21; quality -= 6; }
      if (mission.focus === "estrella") { minAge = 22; maxAge = 30; quality += 12; }
      if (mission.focus === "ganga") { minAge = 19; maxAge = 28; quality += 2; }

      // La fuerza del país influye en lo que puedes encontrar allí
      quality += (country.strength - 82) * 0.16 + rng.gauss(0, 6, -12, 16);

      const potentialBoost = mission.focus === "joven" ? rng.float(6, 20) : rng.float(0, 8);

      const player = generatePlayer({
        seed: `sc_${mission.id}_${i}`,
        leagueCountry: mission.country,
        forceLocal: true,
        position,
        quality: Math.max(30, Math.min(88, quality)),
        minAge,
        maxAge,
        clubId: null,
        origin: "transfer",
        potentialBoost,
      });

      // Precio: las gangas salen más baratas de lo que valen
      const greed = mission.focus === "ganga" ? rng.float(0.72, 0.95) : rng.float(1.0, 1.4);
      const askingPrice = Math.round((player.value * greed) / 5000) * 5000;

      const precision = 0.3 + mission.scoutLevel * 0.006 + analyticsLevel * 0.05;
      const finalPrecision = Math.min(0.96, precision + (mission.days >= 28 ? 0.1 : mission.days >= 14 ? 0.05 : 0));

      newDiscoveries.push({
        id: uid("disc"),
        player,
        report: buildReport(player, finalPrecision, rng),
        askingPrice,
        wageDemand: Math.max(400, Math.round((player.contract.wage * rng.float(1.0, 1.3)) / 50) * 50),
        foundBy: mission.scoutName,
        foundAt: gameNow().toISOString(),
        expiresAt: addDays(gameNow(), 21).toISOString(),
        signed: false,
      });
    }
  }

  if (newDiscoveries.length) {
    next.discoveries = [...newDiscoveries, ...next.discoveries]
      .filter((d) => !d.signed && Date.parse(d.expiresAt) > nowMs)
      .slice(0, 40);
  } else {
    next.discoveries = next.discoveries.filter((d) => !d.signed && Date.parse(d.expiresAt) > nowMs);
  }
  // Limpiar misiones antiguas
  next.missions = next.missions.filter((m) => !m.completed || Date.parse(m.finishesAt) > nowMs - 14 * 86400000);
  next.updatedAt = Date.now();

  return { state: next, newDiscoveries };
}

/** Aplica el bonus real de especialidad del ojeador a la precisión */
export function scoutPrecision(scout: StaffMember, country: string, analyticsLevel: number, days: number): number {
  const base = 30 + scout.level * 0.6 + analyticsLevel * 5 + specialityBonus(scout, country);
  const timeBonus = days >= 28 ? 10 : days >= 14 ? 5 : 0;
  return Math.min(96, Math.round(base + timeBonus));
}

/* ------------------------------------------------------------------ */
/* Fichar un descubrimiento                                            */
/* ------------------------------------------------------------------ */

export interface SignDiscoveryResult {
  state: ScoutingState;
  club: Club;
  player: Player | null;
  error?: string;
}

export function signDiscovery(
  state: ScoutingState,
  club: Club,
  discoveryId: string,
  squadSize: number,
  maxSquad: number
): SignDiscoveryResult {
  const discovery = state.discoveries.find((d) => d.id === discoveryId);
  if (!discovery) return { state, club, player: null, error: "Ese jugador ya no está disponible." };
  if (squadSize >= maxSquad) return { state, club, player: null, error: `Plantilla llena (máximo ${maxSquad}).` };
  if (club.finances.balance < discovery.askingPrice) {
    return { state, club, player: null, error: "Saldo insuficiente para el traspaso." };
  }

  const now = gameNow();
  const player: Player = {
    ...discovery.player,
    clubId: club.id,
    ownerUid: club.ownerUid,
    status: "active",
    contract: {
      ...discovery.player.contract,
      wage: discovery.wageDemand,
      signedOn: now.toISOString(),
    },
    morale: Math.min(99, discovery.player.morale + 7),
    history: [
      ...discovery.player.history,
      { date: now.toISOString(), type: "transfer" as const, text: `Fichado por el ${club.name} tras el informe del ojeador ${discovery.foundBy}.` },
    ],
  };

  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= discovery.askingPrice;
  nextClub.finances.transferBudget = Math.max(0, nextClub.finances.transferBudget - discovery.askingPrice);
  nextClub.squadSize = squadSize + 1;
  nextClub.finances.ledger = [
    { date: now.toISOString(), concept: `Fichaje por scouting: ${player.name}`, amount: discovery.askingPrice, type: "out" as const },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  nextClub.updatedAt = Date.now();

  return {
    state: {
      ...state,
      discoveries: state.discoveries.filter((d) => d.id !== discoveryId),
      totalSignings: state.totalSignings + 1,
      updatedAt: Date.now(),
    },
    club: nextClub,
    player,
  };
}

/* ------------------------------------------------------------------ */
/* Informe de rival (rol Analista)                                     */
/* ------------------------------------------------------------------ */

export interface RivalReport {
  rivalName: string;
  rating: number;
  precision: number;
  strengths: string[];
  weaknesses: string[];
  advice: string[];
  predictedFormation: string;
  threatLevel: "baja" | "media" | "alta";
}

export function rivalReport(params: {
  rival: LeagueClub;
  club: Club;
  ourRating: number;
  analystLevel: number;
  analyticsLevel: number;
}): RivalReport {
  const { rival, ourRating, analystLevel, analyticsLevel } = params;
  const rng = new Rng(`rival:${rival.id}:${Math.floor(gameNow().getTime() / 86400000)}`);
  const precision = Math.min(95, 32 + analystLevel * 0.55 + analyticsLevel * 5);

  const gap = rival.rating - ourRating;
  const threat: RivalReport["threatLevel"] = gap >= 6 ? "alta" : gap >= -4 ? "media" : "baja";

  const allStrengths = [
    "Muy peligrosos en transiciones rápidas",
    "Dominan el juego aéreo en ambas áreas",
    "Presión alta muy coordinada",
    "Excelentes en balón parado ofensivo",
    "Laterales muy profundos que generan superioridad",
    "Mediocentro creativo de mucho nivel",
    "Delantero letal dentro del área",
  ];
  const allWeaknesses = [
    "Sufren cuando les atacan a la espalda de los centrales",
    "Portero inseguro en salidas y centros",
    "Bajón físico notable en el último tramo",
    "Laterales muy expuestos al contraataque",
    "Indisciplina táctica: acumulan tarjetas",
    "Poca profundidad de banquillo",
    "Vulnerables al juego directo",
  ];
  const allAdvice = [
    "Sube la presión: pierden el balón bajo presión",
    "Juega ancho para estirar su línea defensiva",
    "Cierra el centro y obliga a jugar por fuera",
    "Rota a tus jugadores más cansados: el partido será físico",
    "Aprovecha el balón parado, conceden faltas cerca del área",
    "Baja el ritmo y controla la posesión para desesperarles",
  ];

  const count = precision >= 70 ? 3 : precision >= 50 ? 2 : 1;
  return {
    rivalName: rival.name,
    rating: rival.rating,
    precision: Math.round(precision),
    strengths: rng.shuffle(allStrengths).slice(0, count),
    weaknesses: rng.shuffle(allWeaknesses).slice(0, count),
    advice: rng.shuffle(allAdvice).slice(0, count),
    predictedFormation: rng.pick(["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "5-3-2"]),
    threatLevel: threat,
  };
}

/* ------------------------------------------------------------------ */
/* Comparador de jugadores                                             */
/* ------------------------------------------------------------------ */

export interface ComparisonRow {
  key: string;
  label: string;
  a: number;
  b: number;
  winner: "a" | "b" | "tie";
}

export function comparePlayers(a: Player, b: Player): {
  rows: ComparisonRow[];
  summary: { aWins: number; bWins: number; verdict: string };
} {
  const keys = Object.keys(a.attributes) as (keyof typeof a.attributes)[];
  const isGk = a.position === "GK" || b.position === "GK";
  const filtered = keys.filter((k) =>
    isGk ? true : !["reflexes", "handling", "aerialReach", "kicking", "oneOnOne", "communication"].includes(k)
  );

  const rows: ComparisonRow[] = filtered.map((k) => {
    const va = a.attributes[k];
    const vb = b.attributes[k];
    return {
      key: k,
      label: ATTRIBUTE_LABELS[k],
      a: va,
      b: vb,
      winner: va > vb + 2 ? "a" : vb > va + 2 ? "b" : "tie",
    };
  });

  const aWins = rows.filter((r) => r.winner === "a").length;
  const bWins = rows.filter((r) => r.winner === "b").length;
  const verdict =
    aWins > bWins + 4 ? `${a.name} es claramente superior en la mayoría de facetas.` :
    bWins > aWins + 4 ? `${b.name} es claramente superior en la mayoría de facetas.` :
    "Perfiles muy igualados: la elección depende del sistema de juego.";

  return { rows, summary: { aWins, bWins, verdict } };
}

export function positionLabel(p: PositionCode | "any"): string {
  return p === "any" ? "Cualquier posición" : POSITION_MAP[p].label;
}
