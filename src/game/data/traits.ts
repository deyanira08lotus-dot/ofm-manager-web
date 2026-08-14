/**
 * src/game/data/traits.ts
 * Posiciones, pesos de valoración, personalidades, estilos y etiquetas en español.
 */
import type { AttributeKey, PositionCode, PositionGroup } from "@/types";

export const POSITIONS: {
  code: PositionCode;
  label: string;
  group: PositionGroup;
  short: string;
}[] = [
  { code: "GK", label: "Portero", group: "POR", short: "POR" },
  { code: "CB", label: "Defensa central", group: "DEF", short: "DFC" },
  { code: "LB", label: "Lateral izquierdo", group: "DEF", short: "LI" },
  { code: "RB", label: "Lateral derecho", group: "DEF", short: "LD" },
  { code: "DM", label: "Mediocentro defensivo", group: "MED", short: "MCD" },
  { code: "CM", label: "Mediocentro", group: "MED", short: "MC" },
  { code: "AM", label: "Mediapunta", group: "MED", short: "MP" },
  { code: "LW", label: "Extremo izquierdo", group: "DEL", short: "EI" },
  { code: "RW", label: "Extremo derecho", group: "DEL", short: "ED" },
  { code: "ST", label: "Delantero centro", group: "DEL", short: "DC" },
];

export const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.code, p]));

export const GROUP_COLORS: Record<PositionGroup, string> = {
  POR: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  DEF: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  MED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DEL: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

/** Pesos por posición para calcular el nivel actual (overall) */
export const POSITION_WEIGHTS: Record<PositionCode, Partial<Record<AttributeKey, number>>> = {
  GK: { reflexes: 5, handling: 4, aerialReach: 3, kicking: 2, oneOnOne: 4, communication: 3, concentration: 3, composure: 2, positioning: 3, agility: 2, jumping: 1 },
  CB: { marking: 5, tackling: 5, heading: 4, strength: 4, positioning: 4, decisions: 3, concentration: 3, jumping: 3, passing: 2, pace: 2, aggression: 2, composure: 2 },
  LB: { tackling: 4, marking: 3, crossing: 4, pace: 4, stamina: 4, workRate: 3, positioning: 3, dribbling: 2, passing: 3, agility: 2, decisions: 2 },
  RB: { tackling: 4, marking: 3, crossing: 4, pace: 4, stamina: 4, workRate: 3, positioning: 3, dribbling: 2, passing: 3, agility: 2, decisions: 2 },
  DM: { tackling: 5, marking: 4, positioning: 4, passing: 4, workRate: 4, stamina: 3, strength: 3, decisions: 4, concentration: 3, vision: 2, aggression: 2 },
  CM: { passing: 5, vision: 4, firstTouch: 4, stamina: 4, workRate: 4, decisions: 4, dribbling: 3, tackling: 3, composure: 3, longShots: 2, positioning: 2 },
  AM: { passing: 4, vision: 5, dribbling: 4, firstTouch: 4, longShots: 3, composure: 3, finishing: 3, decisions: 3, agility: 3, setPieces: 2, acceleration: 2 },
  LW: { dribbling: 5, pace: 5, acceleration: 4, crossing: 4, agility: 4, finishing: 3, firstTouch: 3, workRate: 2, composure: 2, passing: 2 },
  RW: { dribbling: 5, pace: 5, acceleration: 4, crossing: 4, agility: 4, finishing: 3, firstTouch: 3, workRate: 2, composure: 2, passing: 2 },
  ST: { finishing: 6, positioning: 4, firstTouch: 4, composure: 4, heading: 3, strength: 3, pace: 3, acceleration: 3, dribbling: 3, longShots: 2, jumping: 2 },
};

export const ATTRIBUTE_GROUPS: {
  key: "technical" | "physical" | "mental" | "goalkeeping";
  label: string;
  attrs: AttributeKey[];
}[] = [
  {
    key: "technical",
    label: "Técnicas",
    attrs: ["finishing","passing","dribbling","crossing","firstTouch","heading","tackling","marking","longShots","setPieces"],
  },
  {
    key: "physical",
    label: "Físicas",
    attrs: ["pace","acceleration","stamina","strength","agility","jumping"],
  },
  {
    key: "mental",
    label: "Mentales",
    attrs: ["vision","composure","workRate","positioning","decisions","leadership","aggression","concentration"],
  },
  {
    key: "goalkeeping",
    label: "Portería",
    attrs: ["reflexes","handling","aerialReach","kicking","oneOnOne","communication"],
  },
];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  finishing: "Definición",
  passing: "Pase",
  dribbling: "Regate",
  crossing: "Centros",
  firstTouch: "Control",
  heading: "Cabeceo",
  tackling: "Entradas",
  marking: "Marcaje",
  longShots: "Tiro lejano",
  setPieces: "Balón parado",
  pace: "Velocidad",
  acceleration: "Aceleración",
  stamina: "Resistencia",
  strength: "Fuerza",
  agility: "Agilidad",
  jumping: "Salto",
  vision: "Visión",
  composure: "Temple",
  workRate: "Sacrificio",
  positioning: "Colocación",
  decisions: "Decisiones",
  leadership: "Liderazgo",
  aggression: "Agresividad",
  concentration: "Concentración",
  reflexes: "Reflejos",
  handling: "Blocaje",
  aerialReach: "Juego aéreo",
  kicking: "Saque",
  oneOnOne: "Mano a mano",
  communication: "Comunicación",
};

export const PERSONALITIES = [
  { name: "Profesional", desc: "Entrena por encima de la media y cuida su forma." },
  { name: "Ambicioso", desc: "Quiere jugar en grandes clubes y ganar títulos." },
  { name: "Líder nato", desc: "Mejora la moral del vestuario." },
  { name: "Determinado", desc: "Crece más rápido cuando compite." },
  { name: "Trabajador", desc: "Gana condición física con facilidad." },
  { name: "Temperamental", desc: "Rendimiento irregular, riesgo de tarjetas." },
  { name: "Egoísta", desc: "Busca su gol antes que el pase." },
  { name: "Tímido", desc: "Le cuesta rendir en partidos grandes." },
  { name: "Leal", desc: "Difícil de convencer para salir del club." },
  { name: "Bohemio", desc: "Talento puro, disciplina cuestionable." },
  { name: "Modelo a seguir", desc: "Mejora el desarrollo de los jóvenes." },
  { name: "Inconstante", desc: "Grandes picos y grandes caídas de forma." },
];

export const PLAY_STYLES: Record<PositionGroup, string[]> = {
  POR: ["Portero-líbero", "Especialista en penaltis", "Muro clásico", "Portero moderno"],
  DEF: ["Central contundente", "Líbero moderno", "Lateral profundo", "Carrilero ofensivo", "Defensa constructor", "Marcador implacable"],
  MED: ["Cerebro organizador", "Box-to-box", "Destructor", "Enganche clásico", "Mediocentro llegador", "Pivote posicional"],
  DEL: ["Killer del área", "Falso 9", "Torre de referencia", "Extremo veloz", "Regateador vertical", "Segundo punta"],
};

export const SQUAD_ROLES = ["Estrella", "Titular", "Rotación", "Suplente", "Promesa"] as const;

export const STAFF_ROLES = [
  { key: "headCoach", label: "Entrenador principal", specialities: ["Táctica", "Motivación", "Gestión de vestuario"] },
  { key: "assistant", label: "Segundo entrenador", specialities: ["Táctica", "Análisis rival"] },
  { key: "gkCoach", label: "Entrenador de porteros", specialities: ["Reflejos", "Juego con los pies"] },
  { key: "fitnessCoach", label: "Preparador físico", specialities: ["Resistencia", "Prevención de lesiones"] },
  { key: "attackCoach", label: "Preparador ofensivo", specialities: ["Definición", "Movilidad"] },
  { key: "defenceCoach", label: "Preparador defensivo", specialities: ["Marcaje", "Colocación"] },
  { key: "analyst", label: "Analista", specialities: ["Datos", "Balón parado"] },
  { key: "doctor", label: "Médico", specialities: ["Diagnóstico", "Recuperación"] },
  { key: "physio", label: "Fisioterapeuta", specialities: ["Rehabilitación", "Fatiga"] },
  { key: "sportingDirector", label: "Director deportivo", specialities: ["Negociación", "Planificación"] },
  { key: "scout", label: "Ojeador", specialities: ["Sudamérica", "Europa", "Juveniles"] },
];

export const FACILITIES = [
  { key: "stands", label: "Gradas", icon: "🪑", desc: "Aumenta el aforo y los ingresos por entradas.", maxLevel: 10 },
  { key: "shops", label: "Tiendas comerciales", icon: "🛍️", desc: "Ingresos por merchandising y fidelidad de la afición.", maxLevel: 10 },
  { key: "trainingGround", label: "Campo de entrenamiento", icon: "🏟️", desc: "Mejora la progresión de todos los jugadores.", maxLevel: 10 },
  { key: "academy", label: "Academia de jugadores", icon: "🎓", desc: "Mejores canteranos cada mes y mejores potenciales.", maxLevel: 10 },
  { key: "medical", label: "Centro médico", icon: "🩺", desc: "Menos lesiones y recuperación más rápida.", maxLevel: 10 },
  { key: "analytics", label: "Centro de análisis", icon: "📊", desc: "Mejor scouting, informes de rival y precisión de datos.", maxLevel: 10 },
  { key: "directors", label: "Centro de formación de directores", icon: "🧠", desc: "Permite mejorar y formar al cuerpo técnico.", maxLevel: 10 },
] as const;

export const FORMATIONS: Record<string, string[]> = {
  "4-3-3": ["GK", "LB", "CB1", "CB2", "RB", "DM", "CM1", "CM2", "LW", "ST", "RW"],
  "4-4-2": ["GK", "LB", "CB1", "CB2", "RB", "LM", "CM1", "CM2", "RM", "ST1", "ST2"],
  "4-2-3-1": ["GK", "LB", "CB1", "CB2", "RB", "DM1", "DM2", "LW", "AM", "RW", "ST"],
  "3-5-2": ["GK", "CB1", "CB2", "CB3", "LM", "DM", "CM1", "CM2", "RM", "ST1", "ST2"],
  "5-3-2": ["GK", "LB", "CB1", "CB2", "CB3", "RB", "CM1", "CM2", "CM3", "ST1", "ST2"],
};

export const BOARD_OBJECTIVES = [
  "Evitar el descenso",
  "Terminar en la mitad alta de la tabla",
  "Luchar por plazas europeas",
  "Ascender de categoría",
  "Desarrollar jugadores de la cantera",
];

export const CHAIRMAN_NAMES = [
  "Aurelio Vandermeer","Nadia Kovač","Bruno Estévez","Helena Ashcroft","Marco Ferrante",
  "Yusuf Okonjo","Clara Bettencourt","Teodoro Nakamura","Ingrid Solberg","Ramiro Cifuentes",
];
