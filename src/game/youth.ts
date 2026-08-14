/**
 * src/game/youth.ts
 * CANTERA: Academia mensual (FASE 5) + Draft bimensual (FASE 6).
 *
 * ACADEMIA
 *  - Cada mes de juego la academia ofrece 5 jugadores de 15-18 años.
 *  - El usuario elige país y posición preferida de la promoción.
 *  - A mayor nivel de academia, mejores estadísticas y potenciales.
 *
 * DRAFT
 *  - Cada 2 meses de juego se abre un draft de promesas de 15-16 años.
 *  - Solo jugadores del país de la liga del club.
 *  - Clases SS (legendario, extremadamente raro), S, A, B, C y D.
 *  - Durante el draft TODO está oculto: solo hay informes vagos del ojeador.
 *  - Cada usuario selecciona 2 candidatos; un sorteo decide el orden.
 *  - Al cerrarse, se revelan los datos reales.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player, PlayerClass, PositionCode } from "@/types";
import { POSITIONS } from "./data/traits";
import { Rng, uid } from "./rng";
import { generatePlayer } from "./players";
import { addDays, gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Periodos                                                            */
/* ------------------------------------------------------------------ */

/** Un "mes" de juego = 30 días de juego (= 10 días reales con ritmo x3) */
export const ACADEMY_PERIOD_DAYS = 30;
/** Draft cada 2 meses de juego */
export const DRAFT_PERIOD_DAYS = 60;

export function academyPeriod(now: Date = gameNow()): number {
  return Math.floor(now.getTime() / (ACADEMY_PERIOD_DAYS * 86400000));
}
export function draftPeriod(now: Date = gameNow()): number {
  return Math.floor(now.getTime() / (DRAFT_PERIOD_DAYS * 86400000));
}
export function academyNextDate(now: Date = gameNow()): string {
  const p = academyPeriod(now) + 1;
  return new Date(p * ACADEMY_PERIOD_DAYS * 86400000).toISOString();
}
export function draftNextDate(now: Date = gameNow()): string {
  const p = draftPeriod(now) + 1;
  return new Date(p * DRAFT_PERIOD_DAYS * 86400000).toISOString();
}

/* ------------------------------------------------------------------ */
/* ACADEMIA                                                            */
/* ------------------------------------------------------------------ */

export interface AcademyPrefs {
  /** Código de país o "auto" (país de la liga) */
  country: string;
  /** Posición preferida o "auto" */
  position: PositionCode | "auto";
}

export interface AcademyCandidate {
  id: string;
  player: Player;
  /** Informe del ojeador (rango estimado, no el valor exacto) */
  scoutReport: {
    abilityRange: [number, number];
    potentialRange: [number, number];
    confidence: number;
    comment: string;
  };
  wageDemand: number;
}

export interface AcademyState {
  id: string;
  ownerUid: string;
  clubId: string;
  periodIndex: number;
  prefs: AcademyPrefs;
  candidates: AcademyCandidate[];
  /** IDs ya promocionados en este periodo (máx. 2 por promoción) */
  promoted: string[];
  graduatesTotal: number;
  updatedAt: number;
}

const SCOUT_COMMENTS_GOOD = [
  "Tiene un talento natural que no se ve todos los días.",
  "El cuerpo técnico está entusiasmado con su progresión.",
  "Domina los entrenamientos con el filial pese a su edad.",
  "Podría debutar con el primer equipo en poco tiempo.",
];
const SCOUT_COMMENTS_MID = [
  "Jugador correcto, necesita rodaje y trabajo físico.",
  "Le falta constancia, pero la base técnica está ahí.",
  "Puede llegar lejos si mejora su toma de decisiones.",
  "Rinde bien en categorías inferiores; falta contrastarlo.",
];
const SCOUT_COMMENTS_LOW = [
  "Proyecto de largo recorrido, aún muy verde.",
  "Trabajador incansable, aunque limitado técnicamente.",
  "Difícil que llegue al primer equipo sin un salto enorme.",
  "Podría servir como pieza de rotación en el futuro.",
];

/** El nivel de la academia y del ojeador determina la precisión del informe */
function buildScoutReport(p: Player, academyLevel: number, analyticsLevel: number, rng: Rng) {
  const precision = Math.min(0.92, 0.34 + academyLevel * 0.05 + analyticsLevel * 0.03);
  const abilitySpread = Math.round((1 - precision) * 16) + 2;
  const potentialSpread = Math.round((1 - precision) * 26) + 4;
  const bias = rng.int(-2, 2);

  const comment =
    p.potential >= 82 ? rng.pick(SCOUT_COMMENTS_GOOD) :
    p.potential >= 68 ? rng.pick(SCOUT_COMMENTS_MID) : rng.pick(SCOUT_COMMENTS_LOW);

  return {
    abilityRange: [
      Math.max(1, p.overall - abilitySpread + bias),
      Math.min(99, p.overall + abilitySpread + bias),
    ] as [number, number],
    potentialRange: [
      Math.max(1, p.potential - potentialSpread + bias),
      Math.min(99, p.potential + potentialSpread + bias),
    ] as [number, number],
    confidence: Math.round(precision * 100),
    comment,
  };
}

export function generateAcademyIntake(params: {
  club: Club;
  prefs: AcademyPrefs;
  period: number;
}): AcademyCandidate[] {
  const { club, prefs, period } = params;
  const academyLevel = club.facilities.academy?.level ?? 1;
  const analyticsLevel = club.facilities.analytics?.level ?? 1;
  const rng = new Rng(`academy:${club.id}:${period}:${prefs.country}:${prefs.position}`);
  const country = prefs.country === "auto" ? club.country : prefs.country;

  const out: AcademyCandidate[] = [];
  for (let i = 0; i < 5; i++) {
    // La posición pedida sale en ~3 de cada 5 canteranos
    const position: PositionCode =
      prefs.position !== "auto" && rng.chance(0.6)
        ? prefs.position
        : rng.pick(POSITIONS.map((p) => p.code));

    // Calidad base: academia + reputación del club + azar
    const quality = Math.max(
      22,
      Math.min(62, 24 + academyLevel * 2.6 + club.reputation * 0.14 + rng.gauss(0, 5.5, -10, 12))
    );
    // El potencial extra escala fuerte con el nivel de academia
    const potentialBoost = academyLevel * 1.9 + rng.gauss(4, 5, -4, 18);

    const player = generatePlayer({
      seed: `ac_${club.id}_${period}_${i}_${rng.int(1000, 9999)}`,
      leagueCountry: country,
      forceLocal: true,
      position,
      quality,
      minAge: 15,
      maxAge: 18,
      clubId: null,
      ownerUid: club.ownerUid,
      origin: "academy",
      potentialBoost,
    });
    player.squadRole = "Promesa";
    player.experience = Math.max(1, player.experience - 20);
    player.contract.wage = Math.max(300, Math.round(player.contract.wage * 0.35 / 50) * 50);

    out.push({
      id: `acc_${period}_${i}`,
      player,
      scoutReport: buildScoutReport(player, academyLevel, analyticsLevel, rng),
      wageDemand: player.contract.wage,
    });
  }
  return out.sort((a, b) => b.scoutReport.potentialRange[1] - a.scoutReport.potentialRange[1]);
}

export function createAcademy(club: Club): AcademyState {
  const period = academyPeriod();
  const prefs: AcademyPrefs = { country: "auto", position: "auto" };
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    periodIndex: period,
    prefs,
    candidates: generateAcademyIntake({ club, prefs, period }),
    promoted: [],
    graduatesTotal: 0,
    updatedAt: Date.now(),
  };
}

/** Renueva la promoción si ha cambiado el mes de juego */
export function refreshAcademy(state: AcademyState, club: Club): AcademyState {
  const period = academyPeriod();
  if (state.periodIndex === period) return state;
  return {
    ...state,
    periodIndex: period,
    candidates: generateAcademyIntake({ club, prefs: state.prefs, period }),
    promoted: [],
    updatedAt: Date.now(),
  };
}

/** Cambiar preferencias regenera la promoción del mes en curso */
export function setAcademyPrefs(state: AcademyState, club: Club, prefs: AcademyPrefs): AcademyState {
  return {
    ...state,
    prefs,
    candidates: generateAcademyIntake({ club, prefs, period: state.periodIndex }),
    promoted: [],
    updatedAt: Date.now(),
  };
}

export const ACADEMY_MAX_PROMOTIONS = 2;

export interface PromoteResult {
  academy: AcademyState;
  club: Club;
  player: Player | null;
  error?: string;
}

export function promoteCandidate(
  academy: AcademyState,
  club: Club,
  squadSize: number,
  candidateId: string,
  maxSquad: number
): PromoteResult {
  const candidate = academy.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { academy, club, player: null, error: "Ese canterano ya no está disponible." };
  if (academy.promoted.includes(candidateId)) return { academy, club, player: null, error: "Ya lo has promocionado." };
  if (academy.promoted.length >= ACADEMY_MAX_PROMOTIONS) {
    return { academy, club, player: null, error: `Solo puedes subir ${ACADEMY_MAX_PROMOTIONS} canteranos por promoción.` };
  }
  if (squadSize >= maxSquad) return { academy, club, player: null, error: `Plantilla llena (máximo ${maxSquad}).` };

  const now = gameNow();
  const signingCost = Math.round(candidate.player.value * 0.05 / 1000) * 1000;
  if (club.finances.balance < signingCost) {
    return { academy, club, player: null, error: "No hay saldo para la ficha del canterano." };
  }

  const player: Player = {
    ...candidate.player,
    clubId: club.id,
    ownerUid: club.ownerUid,
    status: "active",
    morale: Math.min(99, candidate.player.morale + 12),
    history: [
      ...candidate.player.history,
      { date: now.toISOString(), type: "academy", text: `Promocionado desde la academia del ${club.name}.` },
    ],
  };

  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= signingCost;
  nextClub.squadSize = squadSize + 1;
  if (signingCost > 0) {
    nextClub.finances.ledger = [
      { date: now.toISOString(), concept: `Ficha de cantera: ${player.name}`, amount: signingCost, type: "out" as const },
      ...nextClub.finances.ledger,
    ].slice(0, 40);
  }
  nextClub.updatedAt = Date.now();

  return {
    academy: {
      ...academy,
      promoted: [...academy.promoted, candidateId],
      candidates: academy.candidates.filter((c) => c.id !== candidateId),
      graduatesTotal: academy.graduatesTotal + 1,
      updatedAt: Date.now(),
    },
    club: nextClub,
    player,
  };
}

/* ------------------------------------------------------------------ */
/* DRAFT                                                               */
/* ------------------------------------------------------------------ */

/** Probabilidades de clase. SS es extremadamente raro (0,4%). */
const CLASS_WEIGHTS: readonly (readonly [PlayerClass, number])[] = [
  ["SS", 0.4],
  ["S", 2.6],
  ["A", 9],
  ["B", 21],
  ["C", 37],
  ["D", 30],
];

/** Rango de potencial asociado a cada clase */
const CLASS_POTENTIAL: Record<PlayerClass, [number, number]> = {
  SS: [93, 99],
  S: [87, 93],
  A: [80, 87],
  B: [72, 80],
  C: [63, 72],
  D: [45, 63],
};

export const DRAFT_PICKS_PER_USER = 2;
export const DRAFT_PROSPECTS = 24;

export interface DraftProspect {
  id: string;
  /** Nombre público durante el draft */
  name: string;
  age: number;
  nationality: string;
  /** Posición: lo único visible con certeza */
  position: PositionCode;
  /** Informe vago: NO revela nivel ni potencial exactos */
  hint: string;
  scoutGrade: string;
  /** Datos reales — ocultos hasta el cierre del draft */
  revealed: boolean;
  player: Player;
  playerClass: PlayerClass;
  /** Quién lo eligió (nombre del club) */
  takenBy: string | null;
}

export interface DraftState {
  id: string;
  ownerUid: string;
  clubId: string;
  periodIndex: number;
  /** "abierto" mientras se puede elegir; "cerrado" tras la revelación */
  phase: "abierto" | "cerrado";
  country: string;
  /** Orden de elección sorteado: nombres de clubes (el tuyo incluido) */
  order: { clubId: string; clubName: string; isUser: boolean }[];
  userPickPosition: number;
  prospects: DraftProspect[];
  /** IDs elegidos por el usuario (máx. 2) */
  userPicks: string[];
  closesAt: string;
  updatedAt: number;
}

const DRAFT_HINTS_HIGH = [
  "Los ojeadores no dejan de hablar de él.",
  "Varios clubes han preguntado por su situación.",
  "Domina físicamente a rivales dos años mayores.",
  "Rendimiento sobresaliente en el torneo juvenil.",
];
const DRAFT_HINTS_MID = [
  "Buenos números en su categoría, sin destacar.",
  "Regular en el torneo juvenil, con destellos.",
  "Perfil interesante pero muy dependiente del físico.",
  "Necesita adaptación, aunque el talento asoma.",
];
const DRAFT_HINTS_LOW = [
  "Apenas ha jugado esta temporada.",
  "Los informes son contradictorios.",
  "Poco contrastado, es una apuesta arriesgada.",
  "Fuera del radar de la mayoría de clubes.",
];

const GRADES = ["Sin catalogar", "Seguimiento", "Interesante", "Prioritario", "Máxima prioridad"];

function classOfProspect(rng: Rng): PlayerClass {
  return rng.weighted(CLASS_WEIGHTS);
}

export function generateDraftClass(params: {
  club: Club;
  period: number;
}): DraftProspect[] {
  const { club, period } = params;
  const analyticsLevel = club.facilities.analytics?.level ?? 1;
  const rng = new Rng(`draft:${club.country}:${period}`);
  const out: DraftProspect[] = [];

  for (let i = 0; i < DRAFT_PROSPECTS; i++) {
    const cls = classOfProspect(rng);
    const [minPot, maxPot] = CLASS_POTENTIAL[cls];
    const targetPotential = rng.int(minPot, maxPot);
    const position = rng.pick(POSITIONS.map((p) => p.code));

    // Nivel actual bajo (tienen 15-16 años); lo importante es el potencial
    const quality = Math.max(18, Math.min(52, 20 + targetPotential * 0.24 + rng.gauss(0, 4, -8, 9)));
    const player = generatePlayer({
      seed: `dr_${club.country}_${period}_${i}`,
      leagueCountry: club.country,
      forceLocal: true, // Solo jugadores del país de la liga
      position,
      quality,
      minAge: 15,
      maxAge: 16,
      clubId: null,
      origin: "draft",
    });
    // Ajustar el potencial exactamente al de su clase
    player.potential = Math.max(player.overall + 3, targetPotential);
    player.potentialClass = cls;
    player.squadRole = "Promesa";
    player.contract.wage = Math.max(250, Math.round(player.contract.wage * 0.28 / 50) * 50);

    // El informe es más certero con mejor centro de análisis, pero nunca exacto
    const noise = rng.float(0, 1) * (1 - Math.min(0.7, analyticsLevel * 0.07));
    const perceived = targetPotential * (1 - noise * 0.35) + rng.int(-6, 6);
    const hint = perceived >= 78 ? rng.pick(DRAFT_HINTS_HIGH) : perceived >= 62 ? rng.pick(DRAFT_HINTS_MID) : rng.pick(DRAFT_HINTS_LOW);
    const gradeIdx = Math.max(0, Math.min(4, Math.round((perceived - 45) / 12)));

    out.push({
      id: `dp_${period}_${i}`,
      name: player.name,
      age: player.age,
      nationality: player.nationality,
      position,
      hint,
      scoutGrade: GRADES[gradeIdx],
      revealed: false,
      player,
      playerClass: cls,
      takenBy: null,
    });
  }
  return rng.shuffle(out);
}

/** Sorteo del orden de elección (loteria ponderada inversa a la reputación) */
function drawOrder(club: Club, period: number) {
  const rng = new Rng(`draftorder:${club.id}:${period}`);
  const aiNames = [
    "Atlético Valmar", "Real Aurora", "Sporting Ribalta", "Unión Peñalba",
    "Racing Verdal", "Deportivo Bahía", "Club Oriente", "FC Castilar",
    "Olímpico Nordeste", "Nacional Alborada", "Provincial Trelles",
  ];
  const entries = [
    { clubId: club.id, clubName: club.name, isUser: true },
    ...aiNames.map((n, i) => ({ clubId: `ai_draft_${i}`, clubName: n, isUser: false })),
  ];
  return rng.shuffle(entries);
}

export function createDraft(club: Club): DraftState {
  const period = draftPeriod();
  const order = drawOrder(club, period);
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    periodIndex: period,
    phase: "abierto",
    country: club.country,
    order,
    userPickPosition: order.findIndex((o) => o.isUser) + 1,
    prospects: generateDraftClass({ club, period }),
    userPicks: [],
    closesAt: draftNextDate(),
    updatedAt: Date.now(),
  };
}

export function refreshDraft(state: DraftState, club: Club): DraftState {
  const period = draftPeriod();
  if (state.periodIndex === period) return state;
  // Nuevo draft: el anterior queda cerrado y se genera la nueva clase
  return createDraft(club);
}

export interface DraftPickResult {
  draft: DraftState;
  error?: string;
}

/** El usuario reserva un candidato (los datos siguen ocultos) */
export function makeDraftPick(draft: DraftState, prospectId: string): DraftPickResult {
  if (draft.phase !== "abierto") return { draft, error: "El draft ya está cerrado." };
  if (draft.userPicks.length >= DRAFT_PICKS_PER_USER) {
    return { draft, error: `Solo puedes seleccionar ${DRAFT_PICKS_PER_USER} candidatos.` };
  }
  const prospect = draft.prospects.find((p) => p.id === prospectId);
  if (!prospect) return { draft, error: "Candidato no encontrado." };
  if (prospect.takenBy) return { draft, error: "Ese candidato ya ha sido elegido." };

  return {
    draft: {
      ...draft,
      userPicks: [...draft.userPicks, prospectId],
      prospects: draft.prospects.map((p) => (p.id === prospectId ? { ...p, takenBy: "user" } : p)),
      updatedAt: Date.now(),
    },
  };
}

export function undoDraftPick(draft: DraftState, prospectId: string): DraftState {
  if (draft.phase !== "abierto") return draft;
  return {
    ...draft,
    userPicks: draft.userPicks.filter((id) => id !== prospectId),
    prospects: draft.prospects.map((p) => (p.id === prospectId ? { ...p, takenBy: null } : p)),
    updatedAt: Date.now(),
  };
}

export interface DraftCloseResult {
  draft: DraftState;
  signed: Player[];
  club: Club;
  lost: string[];
}

/**
 * Cierra el draft: la IA elige por orden de sorteo, se resuelven los conflictos
 * (si un club con turno anterior quería a tu candidato, lo pierdes) y se
 * revelan TODOS los datos reales.
 */
export function closeDraft(draft: DraftState, club: Club, squadSize: number, maxSquad: number): DraftCloseResult {
  const rng = new Rng(`draftclose:${draft.clubId}:${draft.periodIndex}`);
  const next: DraftState = JSON.parse(JSON.stringify(draft));
  const lost: string[] = [];
  const signed: Player[] = [];
  const nextClub: Club = JSON.parse(JSON.stringify(club));

  const available = next.prospects.filter((p) => !p.takenBy || p.takenBy === "user");
  const userPickSet = new Set(next.userPicks);

  // Las IA eligen por orden; las que van antes que el usuario pueden robarte
  for (const team of next.order) {
    if (team.isUser) continue;
    const beforeUser = next.order.indexOf(team) < next.userPickPosition - 1;
    for (let k = 0; k < DRAFT_PICKS_PER_USER; k++) {
      const pool = available.filter((p) => !p.takenBy || (p.takenBy === "user" && beforeUser));
      if (!pool.length) break;
      // La IA prioriza los informes altos, con ruido
      const choice = rng.weighted(
        pool.map((p) => [p, Math.max(0.4, GRADES.indexOf(p.scoutGrade) + 1 + rng.float(0, 1.6))] as const)
      );
      if (userPickSet.has(choice.id) && beforeUser) {
        lost.push(choice.name);
        userPickSet.delete(choice.id);
        next.userPicks = next.userPicks.filter((id) => id !== choice.id);
      }
      choice.takenBy = team.clubName;
      const idx = available.indexOf(choice);
      if (idx >= 0) available.splice(idx, 1);
    }
  }

  // Revelar todo y fichar a los que conservas
  const now = gameNow();
  let size = squadSize;
  for (const p of next.prospects) {
    p.revealed = true;
    if (userPickSet.has(p.id) && size < maxSquad) {
      p.takenBy = club.name;
      const player: Player = {
        ...p.player,
        clubId: club.id,
        ownerUid: club.ownerUid,
        status: "active",
        morale: Math.min(99, p.player.morale + 10),
        history: [
          ...p.player.history,
          { date: now.toISOString(), type: "draft", text: `Seleccionado por el ${club.name} en el draft juvenil (clase ${p.playerClass}).` },
        ],
      };
      signed.push(player);
      size++;
    }
  }

  nextClub.squadSize = size;
  nextClub.updatedAt = Date.now();
  next.phase = "cerrado";
  next.updatedAt = Date.now();

  return { draft: next, signed, club: nextClub, lost };
}

/** ¿Se puede cerrar ya el draft? */
export function draftCanClose(draft: DraftState): boolean {
  return draft.phase === "abierto" && draft.userPicks.length > 0;
}

export const CLASS_DESCRIPTION: Record<PlayerClass, string> = {
  SS: "Potencial de leyenda. Extremadamente raro (menos del 0,5%).",
  S: "Clase mundial. Puede liderar cualquier equipo.",
  A: "Excelente. Titular indiscutible a medio plazo.",
  B: "Bueno. Jugador fiable de primer equipo.",
  C: "Normal. Rotación o filial.",
  D: "Bajo. Difícil que llegue a la élite.",
};

export const CLASS_ODDS: Record<PlayerClass, string> = {
  SS: "0,4%", S: "2,6%", A: "9%", B: "21%", C: "37%", D: "30%",
};

/** Nombre legible del creador de IDs (evita colisiones al promocionar) */
export function youthUid(): string {
  return uid("y");
}

/** Días de juego restantes hasta la próxima promoción o draft */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - gameNow().getTime()) / 86400000));
}

export function academyUpkeep(level: number): number {
  return 4_000 + level * 2_500;
}

export { addDays };
