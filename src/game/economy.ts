/**
 * src/game/economy.ts
 * MOTOR ECONÓMICO (FASE 3).
 * - Ingresos y gastos semanales con "catch-up": al abrir la app se procesan todas
 *   las semanas de juego transcurridas mientras estabas desconectado.
 * - Taquilla por partido en casa (asistencia según precio, fidelidad y rival).
 * - Obras de estadio e instalaciones con coste y tiempo de construcción.
 * - Directiva: confianza, objetivos y ampliaciones de presupuesto.
 * - Patrocinadores: ofertas generadas por reputación y rendimiento.
 *
 * Motor puro: no importa React ni Firebase (portable a Cloud Functions).
 */
import type { Club, Player, StaffMember } from "@/types";
import { FACILITIES } from "./data/traits";
import { GAME_CONFIG } from "./config";
import { Rng } from "./rng";
import { addDays, gameNow, seasonIdOf } from "./time";

/* ------------------------------------------------------------------ */
/* Instalaciones: coste, duración y beneficios por nivel                */
/* ------------------------------------------------------------------ */

const FACILITY_BASE_COST: Record<string, number> = {
  stands: 2_400_000,
  shops: 900_000,
  trainingGround: 1_400_000,
  academy: 1_100_000,
  medical: 800_000,
  analytics: 700_000,
  directors: 1_000_000,
};

/** Capacidad que añade cada nivel de gradas */
export const SEATS_PER_STAND_LEVEL = 2_600;

export function facilityUpgradeCost(key: string, toLevel: number): number {
  return Math.round((FACILITY_BASE_COST[key] ?? 1_000_000) * Math.pow(1.52, toLevel - 1));
}

export function facilityUpgradeDays(toLevel: number): number {
  return 10 + toLevel * 6;
}

/** Mantenimiento semanal de una instalación según su nivel */
export function facilityUpkeep(key: string, level: number): number {
  const base = (FACILITY_BASE_COST[key] ?? 1_000_000) * 0.0016;
  return Math.round(base * level);
}

export interface FacilityBenefit {
  label: string;
  current: string;
  next: string;
}

export function facilityBenefit(key: string, level: number): FacilityBenefit {
  const n = level + 1;
  switch (key) {
    case "stands":
      return { label: "Aforo del estadio", current: `${(level * SEATS_PER_STAND_LEVEL).toLocaleString("es-ES")} plazas`, next: `+${SEATS_PER_STAND_LEVEL.toLocaleString("es-ES")} plazas` };
    case "shops":
      return { label: "Multiplicador de tiendas", current: `x${(1 + level * 0.18).toFixed(2)}`, next: `x${(1 + n * 0.18).toFixed(2)}` };
    case "trainingGround":
      return { label: "Progresión de jugadores", current: `+${Math.round(level * 6)}%`, next: `+${Math.round(n * 6)}%` };
    case "academy":
      return { label: "Calidad de la cantera", current: `Nivel ${level}`, next: `Nivel ${n} (mejores potenciales)` };
    case "medical":
      return { label: "Reducción de lesiones", current: `-${Math.round(level * 7)}%`, next: `-${Math.round(n * 7)}%` };
    case "analytics":
      return { label: "Precisión del scouting", current: `${Math.min(99, 45 + level * 5)}%`, next: `${Math.min(99, 45 + n * 5)}%` };
    case "directors":
      return { label: "Formación del cuerpo técnico", current: `+${Math.round(level * 4)}% por temporada`, next: `+${Math.round(n * 4)}%` };
    default:
      return { label: "Beneficio", current: `Nivel ${level}`, next: `Nivel ${n}` };
  }
}

/* ------------------------------------------------------------------ */
/* Cálculo de ingresos y gastos semanales                               */
/* ------------------------------------------------------------------ */

export interface WeeklyBreakdown {
  income: { label: string; amount: number }[];
  expense: { label: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export function weeklyBreakdown(club: Club, players: Player[], staff: StaffMember[]): WeeklyBreakdown {
  const shopsLevel = club.facilities.shops?.level ?? 1;
  const followers = club.fanbase.followers;
  const divisionFactor = club.division === 1 ? 2.2 : club.division === 2 ? 1 : 0.6;

  const income = [
    { label: "Patrocinador principal", amount: club.finances.sponsorship?.weekly ?? 0 },
    {
      label: "Tiendas y merchandising",
      amount: Math.round(followers * GAME_CONFIG.economy.merchandisePerFollower * (1 + shopsLevel * 0.18) * (0.7 + club.fanbase.loyalty / 200)),
    },
    { label: "Abonos y socios", amount: Math.round(club.stadium.capacity * 0.85 * (club.fanbase.loyalty / 100)) },
    { label: "Derechos de TV y premios", amount: Math.round(club.reputation * 900 * divisionFactor) },
  ];

  const playerWages = players.reduce((s, p) => s + p.contract.wage, 0);
  const staffWages = staff.reduce((s, m) => s + m.wage, 0);
  const upkeep = FACILITIES.reduce((s, f) => s + facilityUpkeep(f.key, club.facilities[f.key]?.level ?? 1), 0);

  const expense = [
    { label: "Salarios de jugadores", amount: playerWages },
    { label: "Cuerpo técnico", amount: staffWages },
    { label: "Mantenimiento del estadio", amount: Math.round(club.stadium.capacity * 0.11) },
    { label: "Instalaciones", amount: upkeep },
    { label: "Academia y gastos generales", amount: GAME_CONFIG.economy.academyWeeklyCost },
  ];

  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const totalExpense = expense.reduce((s, e) => s + e.amount, 0);
  return { income, expense, totalIncome, totalExpense, net: totalIncome - totalExpense };
}

/* ------------------------------------------------------------------ */
/* Taquilla de un partido en casa                                       */
/* ------------------------------------------------------------------ */

export interface MatchdayIncome {
  attendance: number;
  occupancy: number;
  tickets: number;
  hospitality: number;
  merchandising: number;
  total: number;
}

/** Precio "justo" percibido por la afición según reputación y división */
export function fairTicketPrice(club: Club): number {
  return Math.round(14 + club.reputation * 0.42 + (club.division === 1 ? 12 : 0));
}

export function matchdayIncome(club: Club, opts: { rivalRating: number; seed: string }): MatchdayIncome {
  const rng = new Rng(opts.seed);
  const fair = fairTicketPrice(club);
  const priceRatio = club.stadium.ticketPrice / Math.max(1, fair);
  // Demanda: baja si el precio supera lo razonable
  const priceEffect = Math.max(0.28, Math.min(1.18, 1.28 - priceRatio * 0.55));
  const interest =
    0.42 +
    (club.fanbase.satisfaction / 100) * 0.28 +
    (club.fanbase.loyalty / 100) * 0.18 +
    (opts.rivalRating / 100) * 0.14;
  const occupancy = Math.max(0.18, Math.min(1, interest * priceEffect * rng.float(0.93, 1.07)));
  const attendance = Math.round(club.stadium.capacity * occupancy);

  const genShare = club.stadium.seats.general / Math.max(1, club.stadium.capacity);
  const premShare = club.stadium.seats.premium / Math.max(1, club.stadium.capacity);
  const vipShare = club.stadium.seats.vip / Math.max(1, club.stadium.capacity);
  const p = club.stadium.ticketPrice;

  const tickets = Math.round(attendance * (genShare * p + premShare * p * 2.3 + vipShare * p * 5.5));
  const hospitality = Math.round(attendance * 4.2);
  const merchandising = Math.round(attendance * 2.6 * (1 + (club.facilities.shops?.level ?? 1) * 0.14));

  return {
    attendance,
    occupancy: Math.round(occupancy * 100),
    tickets,
    hospitality,
    merchandising,
    total: tickets + hospitality + merchandising,
  };
}

/* ------------------------------------------------------------------ */
/* Patrocinadores                                                       */
/* ------------------------------------------------------------------ */

export interface SponsorOffer {
  id: string;
  name: string;
  weekly: number;
  years: number;
  signingBonus: number;
  requirement: string;
}

const SPONSOR_A = ["Nordisk", "Vertex", "Aurora", "Kaizen", "Helios", "Trivento", "Astral", "Bravura", "Cobalt", "Dynamo", "Everest", "Falcon"];
const SPONSOR_B = ["Energy", "Bank", "Motors", "Telecom", "Airlines", "Seguros", "Logistics", "Cerveza", "Tech", "Fitness"];

export function sponsorOffers(club: Club, leaguePosition: number): SponsorOffer[] {
  const rng = new Rng(`${club.id}:sponsors:${seasonIdOf()}:${Math.floor(club.reputation)}`);
  const base = 4_500 + club.reputation * 620 + club.fanbase.followers * 0.35;
  const posBonus = leaguePosition > 0 ? Math.max(0.85, 1.35 - leaguePosition * 0.045) : 1;

  return [0, 1, 2].map((i) => {
    const risk = i; // 0 = contrato corto y seguro, 2 = largo y ambicioso
    const weekly = Math.round((base * posBonus * (1 + risk * 0.22) * rng.float(0.9, 1.12)) / 100) * 100;
    return {
      id: `sp_${i}_${rng.int(1000, 9999)}`,
      name: `${rng.pick(SPONSOR_A)} ${rng.pick(SPONSOR_B)}`,
      weekly,
      years: 1 + risk,
      signingBonus: Math.round((weekly * 12 * (1 + risk * 0.5)) / 1000) * 1000,
      requirement:
        risk === 0 ? "Sin condiciones especiales" :
        risk === 1 ? "Mantener la categoría" : "Terminar entre los 6 primeros",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Directiva                                                            */
/* ------------------------------------------------------------------ */

export interface BoardReport {
  confidence: number;
  verdict: string;
  tone: "good" | "warn" | "bad";
  notes: string[];
  canRequestBudget: boolean;
}

export function boardReport(club: Club, ctx: { position: number; teams: number; net: number }): BoardReport {
  const notes: string[] = [];
  let confidence = club.board.confidence;

  const expected =
    club.board.objective.includes("Ascender") ? 2 :
    club.board.objective.includes("europea") || club.board.objective.includes("ascenso") ? 5 :
    club.board.objective.includes("mitad") ? Math.ceil(ctx.teams / 2) : ctx.teams - 3;

  if (ctx.position > 0) {
    if (ctx.position <= expected) notes.push(`Vais ${ctx.position}º, cumpliendo el objetivo (${expected}º o mejor).`);
    else notes.push(`Vais ${ctx.position}º y el objetivo es acabar ${expected}º o mejor.`);
  } else {
    notes.push("La temporada aún no ha comenzado.");
  }

  if (club.finances.balance < 0) notes.push("El club está en números rojos: la directiva exige contención.");
  else if (ctx.net < 0) notes.push(`Las cuentas pierden ${Math.abs(Math.round(ctx.net)).toLocaleString("es-ES")} € por semana.`);
  else notes.push("Las finanzas semanales son positivas.");

  if (club.fanbase.satisfaction < 40) notes.push("La afición está descontenta con el rendimiento del equipo.");
  else if (club.fanbase.satisfaction > 75) notes.push("La afición está entregada con el proyecto.");

  const tone: BoardReport["tone"] = confidence >= 65 ? "good" : confidence >= 40 ? "warn" : "bad";
  const verdict =
    confidence >= 80 ? "Respaldo total al proyecto" :
    confidence >= 65 ? "La directiva está satisfecha" :
    confidence >= 45 ? "La directiva observa con atención" :
    confidence >= 28 ? "El puesto del manager peligra" : "Situación crítica";

  return {
    confidence,
    verdict,
    tone,
    notes,
    canRequestBudget: confidence >= 55 && club.finances.balance > 0,
  };
}

/** Ampliación de presupuesto concedida por la directiva */
export function budgetGrant(club: Club): number {
  const base = club.finances.balance * 0.12 + club.reputation * 26_000;
  return Math.round(base / 50_000) * 50_000;
}

/* ------------------------------------------------------------------ */
/* Procesado temporal (catch-up offline)                                */
/* ------------------------------------------------------------------ */

export interface EconomyTickResult {
  club: Club;
  weeksProcessed: number;
  completedWorks: { key: string; label: string; level: number }[];
  net: number;
}

const WEEK_MS_GAME = 7 * 86400000;

/**
 * Procesa las semanas de juego transcurridas desde el último cálculo y termina
 * las obras cuya fecha de finalización ya pasó. Idempotente: guarda el momento
 * procesado en `finances.lastProcessedAt` (tiempo de juego, ms).
 */
export function processEconomy(club: Club, players: Player[], staff: StaffMember[]): EconomyTickResult {
  const nowMs = gameNow().getTime();
  const next: Club = JSON.parse(JSON.stringify(club));
  const finances = next.finances as Club["finances"] & { lastProcessedAt?: number };
  const last = finances.lastProcessedAt ?? nowMs;
  const completedWorks: EconomyTickResult["completedWorks"] = [];

  /* 1) Obras terminadas */
  for (const f of FACILITIES) {
    const st = next.facilities[f.key];
    if (st?.upgrading && Date.parse(st.upgrading.finishesAt) <= nowMs) {
      st.level = Math.min(st.maxLevel, st.upgrading.toLevel);
      st.upgrading = null;
      completedWorks.push({ key: f.key, label: f.label, level: st.level });
      if (f.key === "stands") {
        next.stadium.level = st.level;
        next.stadium.capacity += SEATS_PER_STAND_LEVEL;
        next.stadium.seats = {
          general: Math.round(next.stadium.capacity * 0.78),
          premium: Math.round(next.stadium.capacity * 0.17),
          vip: Math.round(next.stadium.capacity * 0.05),
        };
      }
    }
  }
  if (next.stadium.upgrading && Date.parse(next.stadium.upgrading.finishesAt) <= nowMs) {
    next.stadium.upgrading = null;
  }

  /* 2) Semanas económicas */
  const weeks = Math.min(26, Math.floor((nowMs - last) / WEEK_MS_GAME));
  const bd = weeklyBreakdown(next, players, staff);
  if (weeks > 0) {
    finances.balance += bd.net * weeks;
    finances.weeklyIncome = bd.totalIncome;
    finances.weeklyExpense = bd.totalExpense;
    finances.lastProcessedAt = last + weeks * WEEK_MS_GAME;

    const date = new Date(finances.lastProcessedAt).toISOString();
    finances.ledger = [
      { date, concept: `Ingresos de ${weeks} semana(s)`, amount: bd.totalIncome * weeks, type: "in" as const },
      { date, concept: `Gastos de ${weeks} semana(s)`, amount: bd.totalExpense * weeks, type: "out" as const },
      ...finances.ledger,
    ].slice(0, 40);

    // Crecimiento de la masa social por rendimiento y satisfacción
    const growth = (next.fanbase.satisfaction - 50) / 100;
    next.fanbase.followers = Math.max(500, Math.round(next.fanbase.followers * (1 + growth * 0.012 * weeks)));
  } else if (finances.lastProcessedAt === undefined) {
    finances.lastProcessedAt = nowMs;
    finances.weeklyIncome = bd.totalIncome;
    finances.weeklyExpense = bd.totalExpense;
  }

  /* 3) Patrocinio caducado */
  if (next.finances.sponsorship && Date.parse(next.finances.sponsorship.expires) <= nowMs) {
    next.finances.sponsorship = null;
  }

  next.updatedAt = Date.now();
  return { club: next, weeksProcessed: weeks, completedWorks, net: bd.net };
}

/* ------------------------------------------------------------------ */
/* Acciones (validadas: nunca aumentan el dinero sin coste)             */
/* ------------------------------------------------------------------ */

export function startFacilityUpgrade(club: Club, key: string): { club: Club; error?: string } {
  const next: Club = JSON.parse(JSON.stringify(club));
  const st = next.facilities[key];
  if (!st) return { club, error: "Instalación desconocida." };
  if (st.upgrading) return { club, error: "Ya hay una obra en curso en esta instalación." };
  if (st.level >= st.maxLevel) return { club, error: "Ya está al nivel máximo." };

  const toLevel = st.level + 1;
  const cost = facilityUpgradeCost(key, toLevel);
  if (next.finances.balance < cost) return { club, error: "Saldo insuficiente para iniciar la obra." };

  const finishesAt = addDays(gameNow(), facilityUpgradeDays(toLevel)).toISOString();
  st.upgrading = { toLevel, finishesAt, cost };
  next.finances.balance -= cost;
  next.finances.ledger = [
    { date: gameNow().toISOString(), concept: `Obra: ${FACILITIES.find((f) => f.key === key)?.label} nivel ${toLevel}`, amount: cost, type: "out" as const },
    ...next.finances.ledger,
  ].slice(0, 40);
  next.updatedAt = Date.now();
  return { club: next };
}

export function setTicketPrice(club: Club, price: number): Club {
  const next: Club = JSON.parse(JSON.stringify(club));
  const clamped = Math.max(5, Math.min(150, Math.round(price)));
  next.stadium.ticketPrice = clamped;
  const fair = fairTicketPrice(next);
  // La afición reacciona al precio
  const delta = clamped <= fair * 0.85 ? 2 : clamped <= fair * 1.1 ? 0 : -3;
  next.fanbase.satisfaction = Math.max(5, Math.min(100, next.fanbase.satisfaction + delta));
  next.updatedAt = Date.now();
  return next;
}

export function signSponsor(club: Club, offer: SponsorOffer): Club {
  const next: Club = JSON.parse(JSON.stringify(club));
  next.finances.sponsorship = {
    name: offer.name,
    weekly: offer.weekly,
    expires: addDays(gameNow(), offer.years * 365).toISOString(),
  };
  next.finances.balance += offer.signingBonus;
  next.finances.ledger = [
    { date: gameNow().toISOString(), concept: `Prima de firma: ${offer.name}`, amount: offer.signingBonus, type: "in" as const },
    ...next.finances.ledger,
  ].slice(0, 40);
  next.updatedAt = Date.now();
  return next;
}

export function applyMatchdayIncome(club: Club, income: MatchdayIncome, rivalName: string): Club {
  const next: Club = JSON.parse(JSON.stringify(club));
  next.finances.balance += income.total;
  next.finances.ledger = [
    { date: gameNow().toISOString(), concept: `Taquilla vs ${rivalName} (${income.attendance.toLocaleString("es-ES")} esp.)`, amount: income.total, type: "in" as const },
    ...next.finances.ledger,
  ].slice(0, 40);
  next.updatedAt = Date.now();
  return next;
}

/** Efecto de un resultado en afición, directiva y reputación */
export function applyResultEffects(club: Club, result: "win" | "draw" | "loss", rivalRating: number): Club {
  const next: Club = JSON.parse(JSON.stringify(club));
  const strengthGap = Math.max(-1, Math.min(1, (rivalRating - 55) / 30));
  const satDelta = result === "win" ? 3.2 + strengthGap * 1.6 : result === "draw" ? 0.2 : -3.4 + strengthGap * 1.2;
  const confDelta = result === "win" ? 2.1 : result === "draw" ? 0 : -2.4;
  const repDelta = result === "win" ? 0.35 + strengthGap * 0.3 : result === "draw" ? 0.05 : -0.15;

  next.fanbase.satisfaction = Math.max(5, Math.min(100, next.fanbase.satisfaction + satDelta));
  next.fanbase.loyalty = Math.max(5, Math.min(100, next.fanbase.loyalty + satDelta * 0.25));
  next.board.confidence = Math.max(0, Math.min(100, next.board.confidence + confDelta));
  next.reputation = Math.max(1, Math.min(100, next.reputation + repDelta));
  next.record = {
    ...next.record,
    played: next.record.played + 1,
    won: next.record.won + (result === "win" ? 1 : 0),
    drawn: next.record.drawn + (result === "draw" ? 1 : 0),
    lost: next.record.lost + (result === "loss" ? 1 : 0),
    points: next.record.points + (result === "win" ? 3 : result === "draw" ? 1 : 0),
  };
  next.updatedAt = Date.now();
  return next;
}

export function requestBudget(club: Club): { club: Club; amount: number } {
  const next: Club = JSON.parse(JSON.stringify(club));
  const amount = budgetGrant(next);
  next.finances.transferBudget += amount;
  next.board.confidence = Math.max(0, next.board.confidence - 6);
  next.updatedAt = Date.now();
  return { club: next, amount };
}
