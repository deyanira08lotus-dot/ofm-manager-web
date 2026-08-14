/**
 * src/game/dressingroom.ts
 * VESTUARIO, QUÍMICA Y SALA DE PRENSA (FASE 15).
 *
 * Convierte en mecánicas jugables tres sistemas que hasta ahora solo existían
 * como números internos: PERSONALIDAD, MORAL y QUÍMICA.
 *
 * - Estado del vestuario: grupos (camarillas), líderes y descontentos.
 * - Conversaciones individuales: elogiar, advertir, prometer minutos, calmar.
 *   El resultado depende de la personalidad del jugador (un Temperamental
 *   reacciona fatal a una advertencia; un Profesional la agradece).
 * - Charla de equipo antes del partido: 5 tonos con efectos según contexto.
 * - Rueda de prensa: preguntas con respuestas que mueven directiva, afición
 *   y moral del vestuario.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player } from "@/types";
import { POSITION_MAP } from "./data/traits";
import { chemistryBetween } from "./players";
import { COUNTRY_BY_CODE } from "./data/countries";
import { Rng, clamp, uid } from "./rng";
import { addDays, gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type TalkTone = "calmado" | "motivador" | "exigente" | "apasionado" | "confiado";
export type ChatKind = "elogiar" | "advertir" | "prometer" | "calmar" | "liderazgo";

export interface Clique {
  id: string;
  label: string;
  reason: string;
  leaderId: string;
  leaderName: string;
  memberIds: string[];
  cohesion: number;
  positive: boolean;
}

export interface Concern {
  playerId: string;
  playerName: string;
  kind: "minutos" | "rol" | "contrato" | "salida" | "forma" | "ambiente";
  severity: "alta" | "media" | "baja";
  text: string;
  suggestion: ChatKind;
}

export interface ChatRecord {
  id: string;
  playerId: string;
  playerName: string;
  kind: ChatKind;
  success: boolean;
  moraleDelta: number;
  text: string;
  date: string;
}

export interface TeamTalkRecord {
  tone: TalkTone;
  effect: number;
  text: string;
  date: string;
}

export interface PressQuestion {
  id: string;
  topic: string;
  question: string;
  options: {
    id: string;
    label: string;
    board: number;
    fans: number;
    morale: number;
    reply: string;
  }[];
}

export interface DressingRoomState {
  id: string;
  ownerUid: string;
  clubId: string;
  /** playerId -> momento (ms reales) de la última charla */
  chatCooldowns: Record<string, number>;
  chatLog: ChatRecord[];
  lastTalk: TeamTalkRecord | null;
  /** Tono elegido para el próximo partido */
  pendingTalk: TalkTone | null;
  pressAnsweredAt: number;
  pressSeed: string;
  updatedAt: number;
}

export const CHAT_COOLDOWN_MS = 6 * 3600 * 1000; // 6 h reales
export const PRESS_COOLDOWN_MS = 12 * 3600 * 1000;

export function createDressingRoom(club: Club): DressingRoomState {
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    chatCooldowns: {},
    chatLog: [],
    lastTalk: null,
    pendingTalk: null,
    pressAnsweredAt: 0,
    pressSeed: uid("press"),
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Química del vestuario                                               */
/* ------------------------------------------------------------------ */

export interface ChemistryReport {
  overall: number;
  label: string;
  tone: "good" | "warn" | "bad";
  bestPairs: { a: string; b: string; value: number }[];
  worstPairs: { a: string; b: string; value: number }[];
  cliques: Clique[];
  leaders: { playerId: string; name: string; influence: number }[];
}

const PERSONALITY_INFLUENCE: Record<string, number> = {
  "Líder nato": 26,
  "Modelo a seguir": 20,
  Profesional: 12,
  Determinado: 10,
  Ambicioso: 6,
  Leal: 8,
  Trabajador: 6,
  Bohemio: -4,
  Egoísta: -10,
  Temperamental: -12,
  Inconstante: -8,
  Tímido: -2,
};

export function analyseChemistry(players: Player[]): ChemistryReport {
  if (players.length < 2) {
    return { overall: 50, label: "Plantilla insuficiente", tone: "warn", bestPairs: [], worstPairs: [], cliques: [], leaders: [] };
  }

  const pairs: { a: Player; b: Player; value: number }[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairs.push({ a: players[i], b: players[j], value: chemistryBetween(players[i], players[j]) });
    }
  }
  const overall = Math.round(pairs.reduce((s, p) => s + p.value, 0) / pairs.length);
  const sorted = [...pairs].sort((x, y) => y.value - x.value);

  // Camarillas por nacionalidad (con 3+ jugadores del mismo país)
  const byCountry = new Map<string, Player[]>();
  players.forEach((p) => {
    const list = byCountry.get(p.nationality) ?? [];
    list.push(p);
    byCountry.set(p.nationality, list);
  });

  const cliques: Clique[] = [];
  for (const [code, list] of byCountry) {
    if (list.length < 3) continue;
    const leader = [...list].sort(
      (a, b) => b.attributes.leadership + b.reputation - (a.attributes.leadership + a.reputation)
    )[0];
    const cohesion = clamp(58 + list.length * 3 + leader.attributes.leadership * 0.2, 0, 100);
    cliques.push({
      id: `cl_${code}`,
      label: `Grupo ${COUNTRY_BY_CODE[code]?.name ?? code}`,
      reason: `${list.length} jugadores comparten nacionalidad e idioma`,
      leaderId: leader.id,
      leaderName: leader.name,
      memberIds: list.map((p) => p.id),
      cohesion: Math.round(cohesion),
      positive: true,
    });
  }

  // Camarilla negativa: descontentos con moral muy baja
  const unhappy = players.filter((p) => p.morale < 38);
  if (unhappy.length >= 2) {
    const leader = [...unhappy].sort((a, b) => b.reputation - a.reputation)[0];
    cliques.push({
      id: "cl_unhappy",
      label: "Núcleo de descontentos",
      reason: `${unhappy.length} jugadores con la moral por los suelos`,
      leaderId: leader.id,
      leaderName: leader.name,
      memberIds: unhappy.map((p) => p.id),
      cohesion: Math.round(40 + unhappy.length * 4),
      positive: false,
    });
  }

  const leaders = [...players]
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      influence: Math.round(
        p.attributes.leadership * 0.5 + p.reputation * 0.3 + (PERSONALITY_INFLUENCE[p.personality] ?? 0)
      ),
    }))
    .sort((a, b) => b.influence - a.influence)
    .slice(0, 4);

  const label =
    overall >= 72 ? "Vestuario muy unido" :
    overall >= 60 ? "Buen ambiente" :
    overall >= 48 ? "Ambiente normal" :
    overall >= 38 ? "Grupo fragmentado" : "Vestuario roto";

  return {
    overall,
    label,
    tone: overall >= 60 ? "good" : overall >= 45 ? "warn" : "bad",
    bestPairs: sorted.slice(0, 4).map((p) => ({ a: p.a.name, b: p.b.name, value: p.value })),
    worstPairs: sorted.slice(-4).reverse().map((p) => ({ a: p.a.name, b: p.b.name, value: p.value })),
    cliques,
    leaders,
  };
}

/* ------------------------------------------------------------------ */
/* Preocupaciones del vestuario                                        */
/* ------------------------------------------------------------------ */

export function detectConcerns(players: Player[], club: Club): Concern[] {
  const out: Concern[] = [];
  const nowMs = gameNow().getTime();

  for (const p of players) {
    // Rol prometido vs minutos reales
    const expected = p.squadRole === "Estrella" ? 0.8 : p.squadRole === "Titular" ? 0.6 : p.squadRole === "Rotación" ? 0.3 : 0.1;
    const played = p.stats.apps > 0 ? Math.min(1, p.stats.minutes / (p.stats.apps * 90 + 1)) : 0;
    const hasMatches = p.stats.apps > 0;

    if (hasMatches && played < expected - 0.3) {
      out.push({
        playerId: p.id,
        playerName: p.name,
        kind: "minutos",
        severity: p.squadRole === "Estrella" ? "alta" : "media",
        text: `Esperaba muchos más minutos como ${p.squadRole.toLowerCase()} y apenas participa.`,
        suggestion: "prometer",
      });
    }

    if (p.morale < 30) {
      out.push({
        playerId: p.id,
        playerName: p.name,
        kind: "ambiente",
        severity: "alta",
        text: "Está profundamente desmotivado y contagia al resto del vestuario.",
        suggestion: "calmar",
      });
    } else if (p.morale < 45) {
      out.push({
        playerId: p.id,
        playerName: p.name,
        kind: "ambiente",
        severity: "media",
        text: "No se le ve cómodo en el grupo últimamente.",
        suggestion: "elogiar",
      });
    }

    const daysLeft = (Date.parse(p.contract.expires) - nowMs) / 86400000;
    if (daysLeft > 0 && daysLeft < 150) {
      out.push({
        playerId: p.id,
        playerName: p.name,
        kind: "contrato",
        severity: p.overall >= 70 ? "alta" : "baja",
        text: `Su contrato termina pronto y su agente pregunta por la renovación.`,
        suggestion: "prometer",
      });
    }

    if (p.form < 38 && p.stats.apps >= 3) {
      out.push({
        playerId: p.id,
        playerName: p.name,
        kind: "forma",
        severity: "media",
        text: "Atraviesa una racha de rendimiento muy pobre.",
        suggestion: "advertir",
      });
    }

    if (p.personality === "Ambicioso" && p.overall > club.reputation + 18) {
      out.push({
        playerId: p.id,
        playerName: p.name,
        kind: "salida",
        severity: "alta",
        text: "Cree que su nivel está por encima del proyecto del club.",
        suggestion: "liderazgo",
      });
    }
  }

  const order = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* Conversaciones individuales                                         */
/* ------------------------------------------------------------------ */

export const CHAT_META: Record<ChatKind, { label: string; icon: string; desc: string }> = {
  elogiar: { label: "Elogiar", icon: "👏", desc: "Reconocer públicamente su trabajo. Sube la moral, pero abusar le relaja." },
  advertir: { label: "Advertir", icon: "⚠️", desc: "Exigirle más. Los profesionales reaccionan; los temperamentales explotan." },
  prometer: { label: "Prometer minutos", icon: "🤝", desc: "Compromiso de titularidad. Gran subida ahora, riesgo si no cumples." },
  calmar: { label: "Calmar", icon: "🧊", desc: "Rebajar tensión con un jugador desmotivado." },
  liderazgo: { label: "Apelar al liderazgo", icon: "🎖️", desc: "Pedirle que tire del grupo. Solo funciona con jugadores influyentes." },
};

/** Probabilidad de éxito según personalidad y tipo de charla */
export function chatSuccessChance(player: Player, kind: ChatKind, club: Club): number {
  const p = player.personality;
  let base = 55;

  if (kind === "elogiar") {
    base = 74;
    if (p === "Egoísta") base += 10;
    if (p === "Tímido") base += 8;
    if (p === "Profesional") base -= 6;
    if (p === "Bohemio") base -= 4;
  }
  if (kind === "advertir") {
    base = 48;
    if (p === "Profesional" || p === "Determinado" || p === "Trabajador") base += 26;
    if (p === "Modelo a seguir") base += 18;
    if (p === "Temperamental") base -= 30;
    if (p === "Bohemio" || p === "Inconstante") base -= 16;
    if (p === "Tímido") base -= 12;
  }
  if (kind === "prometer") {
    base = 70;
    if (p === "Ambicioso") base += 14;
    if (p === "Leal") base += 8;
    if (p === "Inconstante") base -= 10;
  }
  if (kind === "calmar") {
    base = 62;
    if (p === "Temperamental") base += 12;
    if (p === "Tímido") base += 14;
    if (p === "Egoísta") base -= 12;
  }
  if (kind === "liderazgo") {
    base = 38 + player.attributes.leadership * 0.45;
    if (p === "Líder nato") base += 26;
    if (p === "Modelo a seguir") base += 18;
    if (p === "Tímido") base -= 22;
    if (p === "Egoísta") base -= 14;
  }

  // La reputación del club y la moral actual también pesan
  base += (club.reputation - player.reputation) * 0.15;
  base += (player.morale - 50) * 0.12;
  return clamp(Math.round(base), 5, 96);
}

export interface ChatResult {
  state: DressingRoomState;
  player: Player;
  record: ChatRecord;
  error?: string;
}

export function talkToPlayer(
  state: DressingRoomState,
  club: Club,
  player: Player,
  kind: ChatKind
): ChatResult {
  const last = state.chatCooldowns[player.id] ?? 0;
  if (Date.now() - last < CHAT_COOLDOWN_MS) {
    return {
      state, player,
      record: { id: "", playerId: player.id, playerName: player.name, kind, success: false, moraleDelta: 0, text: "", date: "" },
      error: `Ya has hablado con ${player.name} hace poco. Deja que pase un tiempo.`,
    };
  }

  const rng = new Rng(`chat:${player.id}:${Date.now()}`);
  const chance = chatSuccessChance(player, kind, club);
  const success = rng.int(1, 100) <= chance;

  const gains: Record<ChatKind, [number, number]> = {
    elogiar: [7, -4],
    advertir: [11, -13],
    prometer: [14, -8],
    calmar: [9, -3],
    liderazgo: [10, -9],
  };
  const [up, down] = gains[kind];
  const moraleDelta = success ? up + rng.int(0, 4) : down - rng.int(0, 4);

  const texts: Record<ChatKind, [string, string]> = {
    elogiar: [
      `${player.name} agradece el reconocimiento y sale motivado del despacho.`,
      `${player.name} se lo toma con indiferencia: cree que solo son palabras.`,
    ],
    advertir: [
      `${player.name} acepta la crítica y promete dar un paso adelante.`,
      `${player.name} se marcha visiblemente enfadado por el tono de la charla.`,
    ],
    prometer: [
      `${player.name} se ilusiona con la promesa de minutos y renueva su compromiso.`,
      `${player.name} desconfía: ya ha oído promesas parecidas antes.`,
    ],
    calmar: [
      `${player.name} se relaja y reconoce que estaba siendo demasiado duro consigo mismo.`,
      `${player.name} sigue igual de tenso pese a la conversación.`,
    ],
    liderazgo: [
      `${player.name} asume el papel de referente y arrastrará al grupo.`,
      `${player.name} no se siente cómodo con esa responsabilidad.`,
    ],
  };

  const record: ChatRecord = {
    id: uid("chat"),
    playerId: player.id,
    playerName: player.name,
    kind,
    success,
    moraleDelta,
    text: texts[kind][success ? 0 : 1],
    date: gameNow().toISOString(),
  };

  const updated: Player = {
    ...player,
    morale: clamp(player.morale + moraleDelta, 5, 99),
    // Apelar al liderazgo con éxito también sube su influencia
    attributes: success && kind === "liderazgo"
      ? { ...player.attributes, leadership: clamp(player.attributes.leadership + 1) }
      : player.attributes,
    history: success && kind === "prometer"
      ? [...player.history, { date: gameNow().toISOString(), type: "milestone" as const, text: "El club le promete minutos como pieza clave." }].slice(-25)
      : player.history,
  };

  return {
    state: {
      ...state,
      chatCooldowns: { ...state.chatCooldowns, [player.id]: Date.now() },
      chatLog: [record, ...state.chatLog].slice(0, 30),
      updatedAt: Date.now(),
    },
    player: updated,
    record,
  };
}

/* ------------------------------------------------------------------ */
/* Charla de equipo antes del partido                                  */
/* ------------------------------------------------------------------ */

export const TALK_META: Record<TalkTone, { label: string; icon: string; desc: string }> = {
  calmado: { label: "Tranquilos", icon: "🧘", desc: "Baja la presión. Ideal ante rivales superiores." },
  motivador: { label: "Motivador", icon: "🔥", desc: "Arenga positiva. Funciona casi siempre, sin picos." },
  exigente: { label: "Exigente", icon: "📢", desc: "Mucha presión. Gran efecto si el grupo tiene carácter." },
  apasionado: { label: "Apasionado", icon: "❤️", desc: "Apela al escudo y a la afición. Mejor en casa." },
  confiado: { label: "Confiados", icon: "😎", desc: "Transmite superioridad. Peligroso ante rivales fuertes." },
};

export interface TalkPreview {
  tone: TalkTone;
  expected: number;
  risk: "bajo" | "medio" | "alto";
  hint: string;
}

/**
 * Calcula el efecto esperado de cada tono según el contexto del partido y
 * las personalidades del once.
 */
export function previewTalks(params: {
  starters: Player[];
  isHome: boolean;
  ourRating: number;
  rivalRating: number;
  coachLevel: number;
}): TalkPreview[] {
  const { starters, isHome, ourRating, rivalRating, coachLevel } = params;
  const gap = ourRating - rivalRating;
  const avgMorale = starters.length ? starters.reduce((s, p) => s + p.morale, 0) / starters.length : 55;
  const character = starters.filter((p) =>
    ["Determinado", "Líder nato", "Profesional", "Trabajador", "Modelo a seguir"].includes(p.personality)
  ).length;
  const fragile = starters.filter((p) => ["Tímido", "Inconstante", "Temperamental"].includes(p.personality)).length;
  const coachMod = 0.7 + coachLevel / 140;

  const build = (tone: TalkTone, raw: number, risk: TalkPreview["risk"], hint: string): TalkPreview => ({
    tone,
    expected: Math.round(raw * coachMod * 10) / 10,
    risk,
    hint,
  });

  return [
    build("calmado", gap < -4 ? 5.5 : gap > 6 ? 0.5 : 2.5, "bajo",
      gap < -4 ? "El rival es superior: rebajar la presión ayuda." : "Efecto discreto ante un rival asequible."),
    build("motivador", 3.6 + avgMorale / 60, "bajo", "Siempre funciona razonablemente bien."),
    build("exigente", character >= 5 ? 6.2 : fragile >= 4 ? -2.5 : 2.2, character >= 5 ? "medio" : "alto",
      character >= 5 ? `${character} jugadores con carácter responderán bien.` : `${fragile} jugadores frágiles pueden hundirse.`),
    build("apasionado", isHome ? 5.4 : 1.8, "medio",
      isHome ? "Jugar en casa multiplica el efecto." : "Fuera de casa pierde fuerza."),
    build("confiado", gap > 8 ? 5.8 : gap < 0 ? -3.2 : 1.5, gap > 8 ? "bajo" : "alto",
      gap > 8 ? "Sois claramente superiores: la confianza es real." : "Sobrevalorarse ante este rival puede salir caro."),
  ];
}

export interface ApplyTalkResult {
  state: DressingRoomState;
  players: Player[];
  record: TeamTalkRecord;
}

export function applyTeamTalk(
  state: DressingRoomState,
  players: Player[],
  starterIds: string[],
  preview: TalkPreview
): ApplyTalkResult {
  const rng = new Rng(`talk:${preview.tone}:${Date.now()}`);
  const variance = preview.risk === "alto" ? 5 : preview.risk === "medio" ? 3 : 1.5;
  const effect = preview.expected + rng.float(-variance, variance);

  const starters = new Set(starterIds);
  const updated = players.map((p) => {
    if (!starters.has(p.id)) return p;
    // Cada personalidad amplifica o amortigua el efecto
    const mult =
      p.personality === "Determinado" || p.personality === "Líder nato" ? 1.25 :
      p.personality === "Inconstante" ? 1.4 :
      p.personality === "Profesional" ? 0.8 :
      p.personality === "Tímido" ? 1.2 : 1;
    return { ...p, morale: clamp(p.morale + effect * mult, 5, 99), form: clamp(p.form + effect * 0.35, 5, 99) };
  });

  const record: TeamTalkRecord = {
    tone: preview.tone,
    effect: Math.round(effect * 10) / 10,
    text:
      effect >= 4 ? "El vestuario sale enchufado al campo." :
      effect >= 1 ? "El mensaje ha calado razonablemente bien." :
      effect >= -1 ? "La charla no ha movido demasiado al grupo." :
      "El mensaje ha caído mal: los jugadores salen tensos.",
    date: gameNow().toISOString(),
  };

  return {
    state: { ...state, lastTalk: record, pendingTalk: null, updatedAt: Date.now() },
    players: updated,
    record,
  };
}

/* ------------------------------------------------------------------ */
/* Sala de prensa                                                      */
/* ------------------------------------------------------------------ */

export function buildPressConference(club: Club, players: Player[], position: number, teams: number): PressQuestion[] {
  const rng = new Rng(`${club.id}:press:${Math.floor(Date.now() / PRESS_COOLDOWN_MS)}`);
  const star = [...players].sort((a, b) => b.reputation - a.reputation)[0];
  const worst = [...players].filter((p) => p.stats.apps > 0).sort((a, b) => a.form - b.form)[0];
  const questions: PressQuestion[] = [];

  // 1) Situación clasificatoria
  const doingWell = position > 0 && position <= Math.ceil(teams / 3);
  questions.push({
    id: "q_table",
    topic: "Clasificación",
    question: doingWell
      ? `Vais ${position}º. ¿Se atreve a fijar el objetivo de ascenso?`
      : `La posición ${position || "actual"} no es la esperada. ¿Preocupado?`,
    options: [
      { id: "a", label: "Somos candidatos y lo vamos a pelear", board: 3, fans: 6, morale: 4, reply: "El vestuario recoge el guante y la afición se ilusiona, pero la directiva toma nota." },
      { id: "b", label: "Vamos partido a partido, sin especular", board: 2, fans: 0, morale: 1, reply: "Respuesta prudente: nadie se molesta, nadie se emociona." },
      { id: "c", label: "Nos falta nivel para más", board: -4, fans: -7, morale: -6, reply: "Los jugadores se sienten señalados y la grada no perdona el derrotismo." },
    ],
  });

  // 2) Un jugador concreto
  if (star) {
    questions.push({
      id: "q_star",
      topic: "Plantilla",
      question: `Se rumorea interés de otros clubes en ${star.name}. ¿Es intocable?`,
      options: [
        { id: "a", label: "No está en venta bajo ningún concepto", board: -2, fans: 7, morale: 6, reply: `${star.name} agradece el respaldo público y la grada lo celebra.` },
        { id: "b", label: "Todos tenemos un precio", board: 4, fans: -5, morale: -5, reply: "La directiva valora el pragmatismo; el vestuario, no tanto." },
        { id: "c", label: "No comento rumores", board: 1, fans: 0, morale: 0, reply: "Salida diplomática sin consecuencias." },
      ],
    });
  }

  // 3) Crítica a un jugador en mala forma
  if (worst) {
    questions.push({
      id: "q_form",
      topic: "Rendimiento",
      question: `${worst.name} está muy por debajo de su nivel. ¿Hasta cuándo confiará en él?`,
      options: [
        { id: "a", label: "Tiene toda mi confianza, saldrá de esta", board: 0, fans: -2, morale: 7, reply: `${worst.name} se siente respaldado y trabaja con más ánimo.` },
        { id: "b", label: "Debe rendir o perderá el sitio", board: 3, fans: 3, morale: -6, reply: "El mensaje llega alto y claro, aunque tensa el vestuario." },
        { id: "c", label: "Es un problema de todo el equipo", board: -1, fans: 1, morale: 2, reply: "Repartir la responsabilidad protege al jugador señalado." },
      ],
    });
  }

  // 4) Pregunta económica o de proyecto
  questions.push({
    id: "q_project",
    topic: "Proyecto",
    question: rng.pick([
      "¿Cree que la directiva le respalda lo suficiente en el mercado?",
      "La afición pide fichajes. ¿Habrá refuerzos?",
      "¿Se ve dirigiendo a este club dentro de tres temporadas?",
    ]),
    options: [
      { id: "a", label: "Confío plenamente en el club", board: 6, fans: 1, morale: 2, reply: "La directiva agradece públicamente la lealtad del entrenador." },
      { id: "b", label: "Necesitamos más ambición arriba", board: -6, fans: 8, morale: 3, reply: "La grada aplaude la valentía; el consejo, en cambio, se incomoda." },
      { id: "c", label: "Prefiero centrarme en lo deportivo", board: 2, fans: -1, morale: 0, reply: "Respuesta neutra que zanja el asunto." },
    ],
  });

  return questions.slice(0, 3);
}

export interface PressResult {
  state: DressingRoomState;
  club: Club;
  players: Player[];
  summary: string[];
}

export function answerPress(
  state: DressingRoomState,
  club: Club,
  players: Player[],
  answers: { question: PressQuestion; optionId: string }[]
): PressResult {
  const nextClub: Club = JSON.parse(JSON.stringify(club));
  const summary: string[] = [];
  let moraleTotal = 0;

  for (const { question, optionId } of answers) {
    const opt = question.options.find((o) => o.id === optionId);
    if (!opt) continue;
    nextClub.board.confidence = clamp(nextClub.board.confidence + opt.board, 0, 100);
    nextClub.fanbase.satisfaction = clamp(nextClub.fanbase.satisfaction + opt.fans, 5, 100);
    moraleTotal += opt.morale;
    summary.push(opt.reply);
  }

  const updated = players.map((p) => ({ ...p, morale: clamp(p.morale + moraleTotal / 2, 5, 99) }));
  nextClub.updatedAt = Date.now();

  return {
    state: { ...state, pressAnsweredAt: Date.now(), pressSeed: uid("press"), updatedAt: Date.now() },
    club: nextClub,
    players: updated,
    summary,
  };
}

export function pressAvailable(state: DressingRoomState): boolean {
  return Date.now() - state.pressAnsweredAt >= PRESS_COOLDOWN_MS;
}

export function chatAvailable(state: DressingRoomState, playerId: string): boolean {
  return Date.now() - (state.chatCooldowns[playerId] ?? 0) >= CHAT_COOLDOWN_MS;
}

export function positionShort(p: Player): string {
  return POSITION_MAP[p.position]?.short ?? p.position;
}

export { addDays };
