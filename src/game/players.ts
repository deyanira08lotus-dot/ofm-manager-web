/**
 * src/game/players.ts
 * Generación procedural de jugadores ficticios + cálculos de nivel, valor y salario.
 * Este mismo algoritmo está replicado en las Cloud Functions (fuente de verdad).
 */
import type {
  Attributes, AttributeKey, Contract, Player, PlayerClass, PositionCode,
} from "@/types";
import { COUNTRIES, COUNTRY_BY_CODE } from "./data/countries";
import { PERSONALITIES, PLAY_STYLES, POSITION_MAP, POSITION_WEIGHTS } from "./data/traits";
import { GAME_CONFIG } from "./config";
import { Rng, clamp, uid } from "./rng";
import { addDays, addYears, gameNow } from "./time";

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  "finishing","passing","dribbling","crossing","firstTouch","heading","tackling","marking","longShots","setPieces",
  "pace","acceleration","stamina","strength","agility","jumping",
  "vision","composure","workRate","positioning","decisions","leadership","aggression","concentration",
  "reflexes","handling","aerialReach","kicking","oneOnOne","communication",
];

const GK_ATTRS: AttributeKey[] = ["reflexes","handling","aerialReach","kicking","oneOnOne","communication"];
const PHYSICAL: AttributeKey[] = ["pace","acceleration","stamina","strength","agility","jumping"];
const MENTAL: AttributeKey[] = ["vision","composure","workRate","positioning","decisions","leadership","aggression","concentration"];

const SECONDARY_MAP: Record<PositionCode, PositionCode[]> = {
  GK: [],
  CB: ["DM", "LB", "RB"],
  LB: ["CB", "LW", "DM"],
  RB: ["CB", "RW", "DM"],
  DM: ["CM", "CB"],
  CM: ["DM", "AM"],
  AM: ["CM", "LW", "RW", "ST"],
  LW: ["AM", "ST", "RW"],
  RW: ["AM", "ST", "LW"],
  ST: ["AM", "LW", "RW"],
};

export function overallFor(pos: PositionCode, a: Attributes): number {
  const w = POSITION_WEIGHTS[pos];
  let sum = 0;
  let tot = 0;
  for (const [k, weight] of Object.entries(w)) {
    sum += (a[k as AttributeKey] ?? 0) * (weight as number);
    tot += weight as number;
  }
  return clamp(sum / tot);
}

export function potentialClassOf(potential: number): PlayerClass {
  const t = GAME_CONFIG.potentialClassThresholds;
  if (potential >= t.SS) return "SS";
  if (potential >= t.S) return "S";
  if (potential >= t.A) return "A";
  if (potential >= t.B) return "B";
  if (potential >= t.C) return "C";
  return "D";
}

export function marketValue(overall: number, potential: number, age: number, reputation = 40): number {
  const base = 18_000 * Math.exp((overall - 40) / 6.4);
  const potFactor = 1 + Math.max(0, potential - overall) * 0.035;
  let ageFactor = 1;
  if (age <= 19) ageFactor = 1.45;
  else if (age <= 22) ageFactor = 1.3;
  else if (age <= 27) ageFactor = 1.05;
  else if (age <= 30) ageFactor = 0.8;
  else if (age <= 33) ageFactor = 0.5;
  else ageFactor = 0.25;
  const repFactor = 0.9 + reputation / 250;
  const v = base * potFactor * ageFactor * repFactor;
  return Math.max(15_000, Math.round(v / 5000) * 5000);
}

export function weeklyWage(value: number, overall: number): number {
  const w = value * 0.00075 + overall * 12;
  return Math.max(400, Math.round(w / 50) * 50);
}

export interface GenerateOptions {
  seed?: string;
  leagueCountry: string;
  position?: PositionCode;
  minAge?: number;
  maxAge?: number;
  /** Nivel medio objetivo del jugador (35-75 típico) */
  quality: number;
  clubId?: string | null;
  ownerUid?: string | null;
  origin?: Player["origin"];
  /** Fuerza que la nacionalidad sea la del país de la liga (draft) */
  forceLocal?: boolean;
  potentialBoost?: number;
}

function pickNationality(rng: Rng, leagueCountry: string, forceLocal?: boolean): string {
  if (forceLocal || rng.chance(1 - GAME_CONFIG.squad.foreignChance)) return leagueCountry;
  const pool = COUNTRIES.filter((c) => c.code !== leagueCountry).map(
    (c) => [c.code, c.strength] as const
  );
  return rng.weighted(pool);
}

function buildName(rng: Rng, countryCode: string): string {
  const c = COUNTRY_BY_CODE[countryCode] ?? COUNTRIES[0];
  const first = rng.pick(c.first);
  const last = rng.pick(c.last);
  const second = rng.chance(0.18) ? ` ${rng.pick(c.last)}` : "";
  return `${first} ${last}${second}`;
}

function pickFoot(rng: Rng, pos: PositionCode): Player["foot"] {
  const leftBias = pos === "LB" || pos === "LW" ? 0.62 : 0.2;
  if (rng.chance(0.05)) return "Ambidiestro";
  return rng.chance(leftBias) ? "Izquierdo" : "Derecho";
}

export function generatePlayer(opts: GenerateOptions): Player {
  const seed = opts.seed ?? uid("p");
  const rng = new Rng(seed);
  const now = gameNow();

  const nationality = pickNationality(rng, opts.leagueCountry, opts.forceLocal);
  const country = COUNTRY_BY_CODE[nationality] ?? COUNTRIES[0];
  const position: PositionCode = opts.position ?? rng.pick(Object.keys(POSITION_WEIGHTS) as PositionCode[]);
  const minAge = opts.minAge ?? GAME_CONFIG.squad.minAge;
  const maxAge = opts.maxAge ?? GAME_CONFIG.squad.maxAge;
  const age = rng.int(minAge, maxAge);
  const birthDate = addDays(addYears(now, -age), -rng.int(0, 364)).toISOString();

  // Nivel base: calidad del club + fuerza del país + azar
  const countryBonus = (country.strength - 82) * 0.12;
  const ageBonus = (age - minAge) * 0.9;
  const base = rng.gauss(opts.quality + countryBonus + ageBonus, 5, 20, 90);

  const weights = POSITION_WEIGHTS[position];
  const attrs = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const w = (weights[key] ?? 0) as number;
    let target = base + (w - 2.4) * 3.6;
    if (position !== "GK" && GK_ATTRS.includes(key)) target = rng.int(4, 22);
    if (position === "GK" && !GK_ATTRS.includes(key) && w === 0) target = base * 0.45 + rng.int(0, 15);
    if (PHYSICAL.includes(key)) target *= age <= 21 ? 1.04 : age >= 29 ? 0.94 : 1;
    if (MENTAL.includes(key)) target *= 0.82 + (age - 15) * 0.014;
    attrs[key] = clamp(rng.gauss(target, 6));
  }

  const overall = overallFor(position, attrs);
  const growthWindow = Math.max(0, 30 - age);
  const rawGrowth = rng.weighted([
    [rng.float(0, 3), 30],
    [rng.float(3, 8), 34],
    [rng.float(8, 14), 22],
    [rng.float(14, 21), 11],
    [rng.float(21, 30), 3],
  ]) * (growthWindow / 12) + (opts.potentialBoost ?? 0);
  const potential = clamp(Math.max(overall, overall + rawGrowth), 1, 99);

  const group = POSITION_MAP[position].group;
  const personality = rng.pick(PERSONALITIES).name;
  const playStyle = rng.pick(PLAY_STYLES[group]);
  const secondaries = rng
    .shuffle(SECONDARY_MAP[position])
    .slice(0, rng.weighted([[0, 25], [1, 45], [2, 25], [3, 5]]));

  const reputation = clamp(overall * 0.55 + (age - 16) * 1.1 + rng.int(-6, 6), 1, 99);
  const value = marketValue(overall, potential, age, reputation);
  const wage = weeklyWage(value, overall);
  const contractYears = rng.int(1, 5);

  const contract: Contract = {
    expires: addYears(now, contractYears).toISOString(),
    wage,
    releaseClause: Math.round(value * rng.float(1.8, 3.4)),
    bonusPerGoal: Math.round(wage * 0.12),
    signedOn: addDays(now, -rng.int(30, 700)).toISOString(),
  };

  const player: Player = {
    id: seed,
    clubId: opts.clubId ?? null,
    ownerUid: opts.ownerUid ?? null,
    name: buildName(rng, nationality),
    nationality,
    secondNationality: rng.chance(0.12) ? rng.pick(COUNTRIES).code : null,
    birthDate,
    age,
    position,
    secondaryPositions: secondaries,
    foot: pickFoot(rng, position),
    attributes: attrs,
    overall,
    potential,
    potentialClass: potentialClassOf(potential),
    personality,
    playStyle,
    form: clamp(rng.gauss(58, 12, 25, 92), 0, 100),
    morale: clamp(rng.gauss(66, 12, 30, 95), 0, 100),
    fitness: clamp(rng.gauss(92, 5, 70, 100), 0, 100),
    experience: clamp((age - 15) * 7 + rng.int(-8, 12), 1, 99),
    reputation,
    popularity: {
      local: clamp(reputation * 0.7 + rng.int(-5, 12), 1, 99),
      national: clamp(reputation * 0.45 + rng.int(-6, 8), 1, 99),
      international: clamp(reputation * 0.22 + rng.int(-4, 6), 1, 99),
    },
    value,
    contract,
    injury: null,
    trainingFocus: null,
    squadRole:
      overall >= 72 ? "Estrella" : overall >= 63 ? "Titular" : age <= 20 ? "Promesa" : overall >= 55 ? "Rotación" : "Suplente",
    stats: {
      seasonId: "",
      clubId: opts.clubId ?? "",
      apps: 0, goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0, minutes: 0, avgRating: 0,
    },
    careerTotals: { apps: rng.int(0, Math.max(0, (age - 17) * 22)), goals: 0, assists: 0, trophies: 0 },
    history: [
      {
        date: now.toISOString(),
        type: "generated",
        text: `${age <= 18 ? "Promesa" : "Jugador"} registrado en el sistema con ficha profesional.`,
      },
    ],
    status: "active",
    createdAt: Date.now(),
    origin: opts.origin ?? "generated",
    seed,
  };

  player.careerTotals.goals = Math.round(
    player.careerTotals.apps * (group === "DEL" ? 0.32 : group === "MED" ? 0.14 : 0.04)
  );
  player.careerTotals.assists = Math.round(player.careerTotals.apps * (group === "DEL" ? 0.18 : 0.12));

  return player;
}

/** Genera la plantilla inicial de 22 jugadores respetando la composición táctica */
export function generateSquad(params: {
  clubId: string;
  ownerUid: string;
  leagueCountry: string;
  quality: number;
  seedBase: string;
}): Player[] {
  const players: Player[] = [];
  let i = 0;
  for (const [pos, count] of Object.entries(GAME_CONFIG.squad.composition)) {
    for (let n = 0; n < count; n++) {
      const rng = new Rng(`${params.seedBase}:${pos}:${n}`);
      // Variación: cada plantilla tiene titulares mejores y suplentes peores
      const tierAdj = n === 0 ? rng.float(2, 8) : n === 1 ? rng.float(-3, 3) : rng.float(-9, -1);
      players.push(
        generatePlayer({
          seed: `${params.clubId}_p${String(i).padStart(2, "0")}_${rng.int(1000, 9999)}`,
          leagueCountry: params.leagueCountry,
          position: pos as PositionCode,
          quality: params.quality + tierAdj,
          clubId: params.clubId,
          ownerUid: params.ownerUid,
          origin: "generated",
        })
      );
      i++;
    }
  }
  return players.sort((a, b) => b.overall - a.overall);
}

/** Química simple entre dos jugadores (nacionalidad, personalidad, estilo) */
export function chemistryBetween(a: Player, b: Player): number {
  let c = 50;
  if (a.nationality === b.nationality) c += 12;
  if (a.personality === b.personality) c += 6;
  if (a.playStyle === b.playStyle) c += 3;
  if (a.personality === "Egoísta" || b.personality === "Egoísta") c -= 8;
  if (a.personality === "Líder nato" || b.personality === "Líder nato") c += 6;
  return clamp(c, 0, 100);
}

/** Media del equipo ponderada por los 11 mejores */
export function squadStrength(players: Player[]): number {
  const sorted = [...players].sort((a, b) => b.overall - a.overall);
  const top = sorted.slice(0, 11);
  if (!top.length) return 0;
  return Math.round(top.reduce((s, p) => s + p.overall, 0) / top.length);
}
