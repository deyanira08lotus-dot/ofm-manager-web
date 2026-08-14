/**
 * src/game/staff.ts
 * CUERPO TÉCNICO (FASE 7).
 * - Mercado de técnicos que se renueva cada pocos días de juego.
 * - Contratación, despido (con indemnización) y renovación.
 * - Centro de Formación de Directores: cursos que suben el nivel del staff.
 * - Efectos reales del staff sobre entrenamiento, lesiones, scouting y partidos.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, StaffMember } from "@/types";
import { COUNTRIES, COUNTRY_BY_CODE } from "./data/countries";
import { STAFF_ROLES } from "./data/traits";
import { Rng, clamp, uid } from "./rng";
import { addDays, addYears, gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface StaffCandidate {
  id: string;
  member: StaffMember;
  roleKey: string;
  /** Prima de contratación (pago único) */
  signingFee: number;
  /** Interés en tu proyecto (0-100) */
  interest: number;
}

export interface TrainingCourse {
  staffId: string;
  staffName: string;
  courseKey: string;
  courseLabel: string;
  gain: number;
  cost: number;
  finishesAt: string;
}

export interface StaffState {
  id: string;
  ownerUid: string;
  clubId: string;
  periodIndex: number;
  candidates: StaffCandidate[];
  /** Cursos en marcha en el Centro de Formación */
  courses: TrainingCourse[];
  coursesCompleted: number;
  updatedAt: number;
}

export const STAFF_PERIOD_DAYS = 6;
export const MAX_STAFF = 14;
export const MAX_CONCURRENT_COURSES = 2;

export function staffPeriod(now: Date = gameNow()): number {
  return Math.floor(now.getTime() / (STAFF_PERIOD_DAYS * 86400000));
}

export function roleKeyOf(member: StaffMember): string {
  return STAFF_ROLES.find((r) => r.label === member.role)?.key ?? "assistant";
}

export function roleLabel(key: string): string {
  return STAFF_ROLES.find((r) => r.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* Mercado de técnicos                                                 */
/* ------------------------------------------------------------------ */

const STAFF_PERSONALITIES = ["Metódico", "Motivador", "Innovador", "Exigente", "Cercano", "Analítico", "Disciplinado", "Paciente"];

export function staffWageFor(level: number, roleKey: string): number {
  const premium = roleKey === "headCoach" ? 1.7 : roleKey === "sportingDirector" ? 1.25 : 1;
  return Math.round(((1_600 + level * 190) * premium) / 50) * 50;
}

export function generateStaffMarket(params: {
  club: Club;
  period: number;
}): StaffCandidate[] {
  const { club, period } = params;
  const directorsLevel = club.facilities.directors?.level ?? 1;
  const rng = new Rng(`staffmarket:${club.id}:${period}`);
  const out: StaffCandidate[] = [];

  for (let i = 0; i < 10; i++) {
    const role = rng.pick(STAFF_ROLES);
    const country = rng.chance(0.5) ? club.country : rng.pick(COUNTRIES).code;
    const c = COUNTRY_BY_CODE[country] ?? COUNTRIES[0];
    // El nivel disponible depende de la reputación del club y del Centro de Formación
    const level = clamp(
      rng.gauss(club.reputation * 0.68 + directorsLevel * 2.4 + 12, 11, 22, 95)
    );
    const age = rng.int(30, 63);
    const member: StaffMember = {
      id: uid("st"),
      role: role.label,
      name: `${rng.pick(c.first)} ${rng.pick(c.last)}`,
      nationality: country,
      age,
      level,
      potential: clamp(level + Math.max(0, rng.int(0, 22) - Math.floor((age - 30) / 3))),
      experience: clamp((age - 27) * 3 + rng.int(-6, 12)),
      specialities: rng.shuffle([...role.specialities]).slice(0, rng.int(1, 2)),
      personality: rng.pick(STAFF_PERSONALITIES),
      wage: staffWageFor(level, role.key),
      contractExpires: addYears(gameNow(), rng.int(1, 4)).toISOString(),
    };

    out.push({
      id: `sc_${period}_${i}`,
      member,
      roleKey: role.key,
      signingFee: Math.round((level * 1_400 * (1 + rng.float(0, 0.6))) / 1000) * 1000,
      interest: clamp(52 + (club.reputation - level) * 0.6 + rng.int(-14, 16), 5, 99),
    });
  }
  return out.sort((a, b) => b.member.level - a.member.level);
}

export function createStaffState(club: Club): StaffState {
  const period = staffPeriod();
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    periodIndex: period,
    candidates: generateStaffMarket({ club, period }),
    courses: [],
    coursesCompleted: 0,
    updatedAt: Date.now(),
  };
}

/** Renueva el mercado y finaliza los cursos vencidos */
export function refreshStaffState(
  state: StaffState,
  club: Club,
  staff: StaffMember[]
): { state: StaffState; upgraded: { name: string; level: number; gain: number }[]; staff: StaffMember[] } {
  const nowMs = gameNow().getTime();
  let next: StaffState = { ...state };
  const upgraded: { name: string; level: number; gain: number }[] = [];
  let nextStaff = staff;

  // 1) Cursos terminados
  const finished = next.courses.filter((c) => Date.parse(c.finishesAt) <= nowMs);
  if (finished.length) {
    nextStaff = staff.map((m) => {
      const course = finished.find((c) => c.staffId === m.id);
      if (!course) return m;
      const newLevel = clamp(Math.min(m.potential, m.level + course.gain));
      upgraded.push({ name: m.name, level: newLevel, gain: newLevel - m.level });
      return {
        ...m,
        level: newLevel,
        experience: clamp(m.experience + 3),
        wage: staffWageFor(newLevel, roleKeyOf(m)),
      };
    });
    next = {
      ...next,
      courses: next.courses.filter((c) => Date.parse(c.finishesAt) > nowMs),
      coursesCompleted: next.coursesCompleted + finished.length,
    };
  }

  // 2) Mercado nuevo
  const period = staffPeriod();
  if (next.periodIndex !== period) {
    next = { ...next, periodIndex: period, candidates: generateStaffMarket({ club, period }) };
  }

  next.updatedAt = Date.now();
  return { state: next, upgraded, staff: nextStaff };
}

/* ------------------------------------------------------------------ */
/* Contratación / despido / renovación                                 */
/* ------------------------------------------------------------------ */

export interface HireResult {
  state: StaffState;
  club: Club;
  member: StaffMember | null;
  error?: string;
}

export function hireStaff(
  state: StaffState,
  club: Club,
  currentStaff: StaffMember[],
  candidateId: string
): HireResult {
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { state, club, member: null, error: "Ese técnico ya no está disponible." };
  if (currentStaff.length >= MAX_STAFF) {
    return { state, club, member: null, error: `Cuerpo técnico completo (máximo ${MAX_STAFF}).` };
  }
  if (candidate.interest < 25) {
    return { state, club, member: null, error: `${candidate.member.name} no está interesado en tu proyecto.` };
  }
  if (club.finances.balance < candidate.signingFee) {
    return { state, club, member: null, error: "Saldo insuficiente para pagar la prima." };
  }

  const now = gameNow();
  const member: StaffMember = {
    ...candidate.member,
    contractExpires: addYears(now, 3).toISOString(),
  };

  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= candidate.signingFee;
  if (candidate.signingFee > 0) {
    nextClub.finances.ledger = [
      { date: now.toISOString(), concept: `Contratación de ${member.role}: ${member.name}`, amount: candidate.signingFee, type: "out" as const },
      ...nextClub.finances.ledger,
    ].slice(0, 40);
  }
  nextClub.updatedAt = Date.now();

  return {
    state: { ...state, candidates: state.candidates.filter((c) => c.id !== candidateId), updatedAt: Date.now() },
    club: nextClub,
    member,
  };
}

export function severancePay(member: StaffMember): number {
  return Math.round(member.wage * 26);
}

export interface FireResult {
  club: Club;
  error?: string;
}

export function fireStaff(club: Club, member: StaffMember, staffCount: number): FireResult {
  if (staffCount <= 3) return { club, error: "Necesitas al menos 3 miembros en el cuerpo técnico." };
  const cost = severancePay(member);
  if (club.finances.balance < cost) return { club, error: "No puedes pagar la indemnización." };

  const now = gameNow();
  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= cost;
  nextClub.finances.ledger = [
    { date: now.toISOString(), concept: `Indemnización a ${member.name}`, amount: cost, type: "out" as const },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  nextClub.updatedAt = Date.now();
  return { club: nextClub };
}

export function renewStaff(member: StaffMember, years: number): StaffMember {
  return {
    ...member,
    contractExpires: addYears(gameNow(), years).toISOString(),
    wage: Math.round(staffWageFor(member.level, roleKeyOf(member)) * 1.06 / 50) * 50,
  };
}

/* ------------------------------------------------------------------ */
/* Centro de Formación de Directores                                   */
/* ------------------------------------------------------------------ */

export interface CourseOption {
  key: string;
  label: string;
  desc: string;
  baseGain: number;
  baseCost: number;
  days: number;
}

export const COURSES: CourseOption[] = [
  { key: "basico", label: "Curso básico", desc: "Formación general de actualización.", baseGain: 2, baseCost: 120_000, days: 12 },
  { key: "avanzado", label: "Curso avanzado", desc: "Especialización táctica y metodológica.", baseGain: 4, baseCost: 320_000, days: 24 },
  { key: "elite", label: "Programa de élite", desc: "Estancia internacional con los mejores.", baseGain: 7, baseCost: 780_000, days: 40 },
];

/** El Centro de Formación de Directores potencia la ganancia y abarata los cursos */
export function courseFor(course: CourseOption, directorsLevel: number, member: StaffMember) {
  const room = Math.max(0, member.potential - member.level);
  const gain = Math.min(room, Math.round(course.baseGain * (1 + directorsLevel * 0.16)));
  const cost = Math.round((course.baseCost * (1 - Math.min(0.45, directorsLevel * 0.05))) / 1000) * 1000;
  const days = Math.max(6, Math.round(course.days * (1 - Math.min(0.4, directorsLevel * 0.045))));
  return { gain, cost, days, room };
}

export interface EnrollResult {
  state: StaffState;
  club: Club;
  error?: string;
}

export function enrollCourse(
  state: StaffState,
  club: Club,
  member: StaffMember,
  courseKey: string
): EnrollResult {
  if ((club.facilities.directors?.level ?? 0) < 1) {
    return { state, club, error: "Necesitas el Centro de Formación de Directores." };
  }
  if (state.courses.length >= MAX_CONCURRENT_COURSES) {
    return { state, club, error: `Solo puedes tener ${MAX_CONCURRENT_COURSES} cursos simultáneos.` };
  }
  if (state.courses.some((c) => c.staffId === member.id)) {
    return { state, club, error: `${member.name} ya está formándose.` };
  }
  const option = COURSES.find((c) => c.key === courseKey);
  if (!option) return { state, club, error: "Curso desconocido." };

  const directorsLevel = club.facilities.directors?.level ?? 1;
  const { gain, cost, days, room } = courseFor(option, directorsLevel, member);
  if (room <= 0) return { state, club, error: `${member.name} ya ha alcanzado su potencial máximo.` };
  if (club.finances.balance < cost) return { state, club, error: "Saldo insuficiente para el curso." };

  const now = gameNow();
  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= cost;
  nextClub.finances.ledger = [
    { date: now.toISOString(), concept: `${option.label}: ${member.name}`, amount: cost, type: "out" as const },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  nextClub.updatedAt = Date.now();

  return {
    state: {
      ...state,
      courses: [
        ...state.courses,
        {
          staffId: member.id,
          staffName: member.name,
          courseKey: option.key,
          courseLabel: option.label,
          gain,
          cost,
          finishesAt: addDays(now, days).toISOString(),
        },
      ],
      updatedAt: Date.now(),
    },
    club: nextClub,
  };
}

/* ------------------------------------------------------------------ */
/* Efectos del cuerpo técnico                                          */
/* ------------------------------------------------------------------ */

export interface StaffEffects {
  coachLevel: number;
  /** Bonus % a la progresión de jugadores */
  trainingBonus: number;
  /** Reducción % del riesgo de lesión */
  injuryReduction: number;
  /** Velocidad extra de recuperación física */
  recoveryBonus: number;
  /** Precisión extra del scouting (academia y draft) */
  scoutingBonus: number;
  /** Bonus táctico en partido */
  matchBonus: number;
  /** Mejora en las negociaciones del mercado */
  negotiationBonus: number;
  /** Bonus de desarrollo específico de porteros */
  gkBonus: number;
  missingRoles: string[];
}

function levelOf(staff: StaffMember[], key: string): number {
  const label = roleLabel(key);
  const list = staff.filter((s) => s.role === label);
  if (!list.length) return 0;
  return Math.max(...list.map((s) => s.level));
}

export function computeStaffEffects(staff: StaffMember[]): StaffEffects {
  const head = levelOf(staff, "headCoach");
  const assistant = levelOf(staff, "assistant");
  const fitness = levelOf(staff, "fitnessCoach");
  const attack = levelOf(staff, "attackCoach");
  const defence = levelOf(staff, "defenceCoach");
  const gk = levelOf(staff, "gkCoach");
  const analyst = levelOf(staff, "analyst");
  const doctor = levelOf(staff, "doctor");
  const physio = levelOf(staff, "physio");
  const sd = levelOf(staff, "sportingDirector");
  const scout = levelOf(staff, "scout");

  const missingRoles = STAFF_ROLES.filter((r) => levelOf(staff, r.key) === 0).map((r) => r.label);

  return {
    coachLevel: head || 45,
    trainingBonus: Math.round((head * 0.14 + attack * 0.1 + defence * 0.1 + fitness * 0.08) * 10) / 10,
    injuryReduction: Math.round((doctor * 0.22 + physio * 0.16 + fitness * 0.1) * 10) / 10,
    recoveryBonus: Math.round((physio * 0.24 + doctor * 0.12) * 10) / 10,
    scoutingBonus: Math.round((scout * 0.26 + analyst * 0.18) * 10) / 10,
    matchBonus: Math.round((head * 0.2 + assistant * 0.1 + analyst * 0.08) * 10) / 10,
    negotiationBonus: Math.round(sd * 0.3 * 10) / 10,
    gkBonus: Math.round(gk * 0.3 * 10) / 10,
    missingRoles,
  };
}

export function staffQualityGrade(effects: StaffEffects): { label: string; tone: "good" | "warn" | "bad" } {
  const score = effects.coachLevel + effects.trainingBonus * 2 + effects.matchBonus * 2;
  if (score >= 95) return { label: "Cuerpo técnico de élite", tone: "good" };
  if (score >= 72) return { label: "Cuerpo técnico competente", tone: "good" };
  if (score >= 52) return { label: "Cuerpo técnico mejorable", tone: "warn" };
  return { label: "Cuerpo técnico deficiente", tone: "bad" };
}
