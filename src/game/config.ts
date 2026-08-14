/**
 * src/game/config.ts
 * Configuración global del juego. Los valores sensibles se replican en
 * firebase/functions/index.js para que el servidor sea la fuente de verdad.
 */

export const GAME_CONFIG = {
  version: "1.0.0-fase1",
  /** Temporada arranca el 1 de julio */
  seasonStartMonth: 6,
  /** Ritmo del mundo: días de juego que pasan por cada día real */
  gameDaysPerRealDay: 3,
  /** Ancla del mundo (fecha real) */
  realEpochISO: "2026-01-01T00:00:00.000Z",
  /** Fecha inicial del mundo de juego */
  gameEpochISO: "2026-07-01T00:00:00.000Z",

  squad: {
    initialSize: 22,
    minAge: 17,
    maxAge: 26,
    /** Reparto de posiciones del plantel inicial (suma 22) */
    composition: { GK: 3, CB: 4, LB: 2, RB: 2, DM: 2, CM: 3, AM: 2, LW: 1, RW: 1, ST: 2 } as Record<string, number>,
    foreignChance: 0.35,
  },

  /** Presupuestos iniciales seleccionables (validados en el servidor) */
  budgetPresets: [
    {
      key: "modesto",
      label: "Proyecto modesto",
      balance: 4_000_000,
      wageBudget: 120_000,
      reputation: 32,
      stadiumCapacity: 9_000,
      quality: 47,
      desc: "Club humilde. Menos dinero, pero objetivos suaves y afición paciente.",
    },
    {
      key: "estandar",
      label: "Club consolidado",
      balance: 12_000_000,
      wageBudget: 260_000,
      reputation: 46,
      stadiumCapacity: 18_000,
      quality: 55,
      desc: "Equilibrio entre recursos y exigencia. Recomendado para empezar.",
    },
    {
      key: "ambicioso",
      label: "Proyecto ambicioso",
      balance: 30_000_000,
      wageBudget: 520_000,
      reputation: 58,
      stadiumCapacity: 30_000,
      quality: 62,
      desc: "Mucho dinero pero la directiva y la afición exigen títulos ya.",
    },
  ],

  facilitiesStart: {
    stands: 2,
    shops: 1,
    trainingGround: 2,
    academy: 1,
    medical: 1,
    analytics: 1,
    directors: 1,
  } as Record<string, number>,

  economy: {
    ticketBasePrice: 25,
    maintenancePerCapacity: 0.9,
    merchandisePerFollower: 0.11,
    academyWeeklyCost: 9_000,
  },

  potentialClassThresholds: { SS: 93, S: 87, A: 80, B: 72, C: 63 },
};

export type BudgetPreset = (typeof GAME_CONFIG.budgetPresets)[number];
