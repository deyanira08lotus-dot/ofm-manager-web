/**
 * src/game/club.ts
 * Creación del club: estadio, instalaciones, cuerpo técnico, finanzas, afición,
 * directiva, táctica inicial y noticias de bienvenida.
 */
import type { Club, FacilityState, NewsItem, Player, StaffMember, Stadium, Tactics } from "@/types";
import { GAME_CONFIG, type BudgetPreset } from "./config";
import { COUNTRY_BY_CODE } from "./data/countries";
import { BOARD_OBJECTIVES, CHAIRMAN_NAMES, FACILITIES, FORMATIONS, STAFF_ROLES } from "./data/traits";
import { Rng, clamp, uid } from "./rng";
import { generateSquad } from "./players";
import { addYears, gameNow, seasonIdOf } from "./time";

export function buildFacilities(): Record<string, FacilityState> {
  const out: Record<string, FacilityState> = {};
  for (const f of FACILITIES) {
    out[f.key] = {
      key: f.key,
      level: GAME_CONFIG.facilitiesStart[f.key] ?? 1,
      maxLevel: f.maxLevel,
      upgrading: null,
    };
  }
  return out;
}

// Fuente única de verdad para costes de obra: src/game/economy.ts (FASE 3)
export { facilityUpgradeCost, facilityUpgradeDays } from "./economy";

export function generateStaff(rng: Rng, country: string, quality: number): StaffMember[] {
  const c = COUNTRY_BY_CODE[country];
  return STAFF_ROLES.map((role) => {
    const level = clamp(rng.gauss(quality * 0.85, 8, 20, 92));
    const age = rng.int(31, 62);
    return {
      id: uid("st"),
      role: role.label,
      name: `${rng.pick(c.first)} ${rng.pick(c.last)}`,
      nationality: country,
      age,
      level,
      potential: clamp(level + rng.int(0, 18)),
      experience: clamp((age - 28) * 3 + rng.int(-5, 10)),
      specialities: rng.shuffle([...role.specialities]).slice(0, rng.int(1, 2)),
      personality: rng.pick(["Metódico", "Motivador", "Innovador", "Exigente", "Cercano", "Analítico"]),
      wage: Math.round((2_000 + level * 180) / 50) * 50,
      contractExpires: addYears(gameNow(), rng.int(1, 4)).toISOString(),
    };
  });
}

function buildStadium(rng: Rng, clubName: string, capacity: number): Stadium {
  return {
    name: `Estadio ${clubName.split(" ").slice(-1)[0]}`,
    capacity,
    level: GAME_CONFIG.facilitiesStart.stands ?? 2,
    pitchQuality: clamp(rng.gauss(62, 8, 40, 90)),
    ticketPrice: GAME_CONFIG.economy.ticketBasePrice,
    seats: {
      general: Math.round(capacity * 0.78),
      premium: Math.round(capacity * 0.17),
      vip: Math.round(capacity * 0.05),
    },
    upgrading: null,
  };
}

function buildTactics(players: Player[]): Tactics {
  const formation = "4-3-3";
  const slots = FORMATIONS[formation];
  const used = new Set<string>();
  const lineup: Record<string, string | null> = {};
  const wanted: Record<string, string[]> = {
    GK: ["GK"], LB: ["LB", "CB"], RB: ["RB", "CB"], CB1: ["CB"], CB2: ["CB"],
    DM: ["DM", "CM"], CM1: ["CM", "AM"], CM2: ["CM", "DM"],
    LW: ["LW", "AM", "ST"], RW: ["RW", "AM", "ST"], ST: ["ST", "AM"],
  };
  for (const slot of slots) {
    const prefs = wanted[slot] ?? [];
    let best: Player | undefined;
    for (const pref of prefs) {
      const cands = players
        .filter((p) => !used.has(p.id) && (p.position === pref || p.secondaryPositions.includes(pref as never)))
        .sort((a, b) => b.overall - a.overall);
      if (cands.length) { best = cands[0]; break; }
    }
    if (!best) best = players.filter((p) => !used.has(p.id)).sort((a, b) => b.overall - a.overall)[0];
    if (best) { used.add(best.id); lineup[slot] = best.id; } else lineup[slot] = null;
  }
  const bench = players.filter((p) => !used.has(p.id)).sort((a, b) => b.overall - a.overall).slice(0, 7).map((p) => p.id);
  const captain = [...players].sort(
    (a, b) => b.attributes.leadership + b.overall - (a.attributes.leadership + a.overall)
  )[0];
  const penalty = [...players].sort((a, b) => b.attributes.setPieces + b.attributes.composure - (a.attributes.setPieces + a.attributes.composure))[0];
  return {
    formation,
    mentality: "Equilibrada",
    tempo: 55,
    pressing: 55,
    width: 55,
    passingStyle: "Mixto",
    lineup,
    bench,
    captainId: captain?.id ?? null,
    penaltyTakerId: penalty?.id ?? null,
  };
}

export interface CreateClubInput {
  ownerUid: string;
  managerName: string;
  clubName: string;
  shortName: string;
  country: string;
  colors: { primary: string; secondary: string };
  presetKey: string;
}

export interface ClubBundle {
  club: Club;
  players: Player[];
  staff: StaffMember[];
  news: NewsItem[];
}

/**
 * Construye el club completo. En producción esta función se ejecuta también en
 * Cloud Functions (createClub) para que el cliente NO pueda inventarse dinero.
 */
export function createClubBundle(input: CreateClubInput, clubIdSeed?: string): ClubBundle {
  const preset: BudgetPreset =
    GAME_CONFIG.budgetPresets.find((p) => p.key === input.presetKey) ?? GAME_CONFIG.budgetPresets[1];
  const clubId = clubIdSeed ?? uid("club");
  const rng = new Rng(`${clubId}:${input.clubName}`);
  const now = gameNow();
  const seasonId = seasonIdOf(now);
  const country = COUNTRY_BY_CODE[input.country] ?? COUNTRY_BY_CODE.ESP;

  const players = generateSquad({
    clubId,
    ownerUid: input.ownerUid,
    leagueCountry: input.country,
    quality: preset.quality,
    seedBase: `${clubId}:squad`,
  });
  const staff = generateStaff(rng, input.country, preset.quality + 6);
  const stadium = buildStadium(rng, input.clubName, preset.stadiumCapacity);
  const facilities = buildFacilities();
  const weeklyWages = players.reduce((s, p) => s + p.contract.wage, 0) + staff.reduce((s, m) => s + m.wage, 0);
  const followers = Math.round(preset.stadiumCapacity * rng.float(2.2, 3.6));

  const club: Club = {
    id: clubId,
    ownerUid: input.ownerUid,
    managerName: input.managerName,
    name: input.clubName,
    shortName: input.shortName.toUpperCase().slice(0, 4),
    country: input.country,
    leagueId: `${input.country}_D2`,
    division: 2,
    founded: rng.int(1902, 1974),
    colors: input.colors,
    reputation: preset.reputation,
    stadium,
    facilities,
    finances: {
      balance: preset.balance,
      wageBudget: preset.wageBudget,
      transferBudget: Math.round(preset.balance * 0.6),
      weeklyIncome: Math.round(followers * GAME_CONFIG.economy.merchandisePerFollower + preset.stadiumCapacity * 1.1),
      weeklyExpense: Math.round(weeklyWages + preset.stadiumCapacity * GAME_CONFIG.economy.maintenancePerCapacity * 0.1),
      sponsorship: {
        name: `${rng.pick(["Nordisk", "Vertex", "Aurora", "Kaizen", "Helios", "Trivento"])} ${rng.pick(["Energy", "Bank", "Motors", "Telecom", "Airlines"])}`,
        weekly: Math.round(preset.balance * 0.0045),
        expires: addYears(now, 2).toISOString(),
      },
      ledger: [
        { date: now.toISOString(), concept: "Aportación inicial de la directiva", amount: preset.balance, type: "in" },
      ],
    },
    fanbase: {
      followers,
      loyalty: clamp(rng.gauss(58, 8, 35, 85)),
      satisfaction: 62,
      expectation: preset.key === "ambicioso" ? "Ascenso inmediato" : preset.key === "estandar" ? "Play-off de ascenso" : "Permanencia tranquila",
      favouritePlayerIds: players.slice(0, 2).map((p) => p.id),
    },
    tactics: buildTactics(players),
    board: {
      confidence: 70,
      objective:
        preset.key === "ambicioso" ? "Ascender de categoría" :
        preset.key === "estandar" ? BOARD_OBJECTIVES[2] : BOARD_OBJECTIVES[0],
      patience: preset.key === "ambicioso" ? 45 : 70,
      chairman: rng.pick(CHAIRMAN_NAMES),
    },
    training: { intensity: 55, focus: "General" },
    squadSize: players.length,
    seasonId,
    record: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
    trophies: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const star = players[0];
  const news: NewsItem[] = [
    {
      id: uid("news"),
      clubId,
      date: now.toISOString(),
      category: "club",
      title: `${input.managerName} toma las riendas del ${input.clubName}`,
      body: `El consejo presidido por ${club.board.chairman} ha presentado hoy a ${input.managerName} como nuevo director deportivo y entrenador del ${input.clubName} (${country.leagueName}). El objetivo marcado para la temporada ${seasonId} es: ${club.board.objective.toLowerCase()}.`,
      read: false,
      important: true,
    },
    {
      id: uid("news"),
      clubId,
      date: now.toISOString(),
      category: "finanzas",
      title: `Presupuesto aprobado: ${Math.round(preset.balance / 1_000_000)} M €`,
      body: `La directiva pone a disposición del cuerpo técnico un presupuesto de fichajes y una masa salarial semanal máxima. El patrocinador principal será ${club.finances.sponsorship?.name}.`,
      read: false,
    },
    {
      id: uid("news"),
      clubId,
      date: now.toISOString(),
      category: "club",
      title: `${star.name}, el hombre a seguir`,
      body: `Con un nivel de ${star.overall} y potencial ${star.potentialClass}, ${star.name} (${star.age} años, ${star.position}) se perfila como el referente de la plantilla. La afición ya lo ha señalado como jugador favorito.`,
      read: false,
    },
    {
      id: uid("news"),
      clubId,
      date: now.toISOString(),
      category: "sistema",
      title: "Próximos módulos activos",
      body: "El club ya tiene plantilla, estadio, instalaciones, cuerpo técnico y finanzas. En las siguientes fases se activarán alineación y táctica avanzada, simulador de partidos, mercado, academia mensual y draft bimensual.",
      read: false,
    },
  ];

  return { club, players, staff, news };
}
