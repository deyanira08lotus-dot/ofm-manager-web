/**
 * src/game/manager.ts
 * PERFIL Y PROGRESIÓN DEL MANAGER (FASE 13).
 * - Nivel y experiencia del manager según su rendimiento real.
 * - Centro de notificaciones agregado a partir de todos los sistemas.
 * - Preferencias de avisos.
 *
 * Motor puro (sin React ni Firebase).
 */
import type { Club, NewsItem, Player, UserProfile } from "@/types";
import type { LeagueState } from "./league";
import type { FameState } from "./fame";
import type { SeasonHistoryState } from "./season";
import type { NationalState } from "./national";
import type { MarketState } from "./market";
import type { AcademyState, DraftState } from "./youth";
import type { StaffState } from "./staff";
import type { CompetitionsState } from "./cups";
import { sortedTable } from "./league";
import { realTimeUntil } from "./time";

/* ------------------------------------------------------------------ */
/* Progresión del manager                                              */
/* ------------------------------------------------------------------ */

export interface ManagerStats {
  level: number;
  xp: number;
  xpForNext: number;
  progress: number;
  title: string;
  totals: {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    trophies: number;
    seasons: number;
    achievements: number;
    signings: number;
    graduates: number;
  };
  winRate: number;
}

const TITLES = [
  { min: 1, label: "Manager novato" },
  { min: 4, label: "Técnico prometedor" },
  { min: 8, label: "Entrenador consolidado" },
  { min: 13, label: "Estratega respetado" },
  { min: 19, label: "Manager de élite" },
  { min: 26, label: "Maestro del banquillo" },
  { min: 35, label: "Leyenda viva" },
];

/** XP necesaria para alcanzar un nivel (curva suave) */
export function xpForLevel(level: number): number {
  return Math.round(180 * Math.pow(level, 1.42));
}

export function computeManagerStats(params: {
  club: Club | null;
  league: LeagueState | null;
  fame: FameState | null;
  history: SeasonHistoryState | null;
  market: MarketState | null;
  academy: AcademyState | null;
  achievementsUnlocked: number;
}): ManagerStats {
  const { club, league, history, market, academy, achievementsUnlocked } = params;

  const row = league && club ? Object.values(league.table).find((r) => r.clubId === club.id) : null;
  const seasons = history?.seasons ?? [];
  const histMatches = seasons.reduce((s, x) => s + x.played, 0);
  const histWins = seasons.reduce((s, x) => s + x.won, 0);
  const histDraws = seasons.reduce((s, x) => s + x.drawn, 0);
  const histLosses = seasons.reduce((s, x) => s + x.lost, 0);

  const totals = {
    matches: (row?.played ?? 0) + histMatches,
    wins: (row?.won ?? 0) + histWins,
    draws: (row?.drawn ?? 0) + histDraws,
    losses: (row?.lost ?? 0) + histLosses,
    trophies: club?.trophies.length ?? 0,
    seasons: seasons.length,
    achievements: achievementsUnlocked,
    signings: market?.history.filter((h) => h.type === "compra" || h.type === "libre").length ?? 0,
    graduates: academy?.graduatesTotal ?? 0,
  };

  // XP: victorias, títulos, logros, temporadas y desarrollo de cantera
  const xp = Math.round(
    totals.wins * 28 +
    totals.draws * 9 +
    totals.matches * 4 +
    totals.trophies * 320 +
    totals.achievements * 55 +
    totals.seasons * 140 +
    totals.graduates * 35 +
    (club ? club.reputation * 6 : 0)
  );

  let level = 1;
  while (level < 60 && xp >= xpForLevel(level + 1)) level++;
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const title = [...TITLES].reverse().find((t) => level >= t.min)?.label ?? TITLES[0].label;

  return {
    level,
    xp,
    xpForNext: nextFloor,
    progress: Math.max(0, Math.min(1, (xp - currentFloor) / Math.max(1, nextFloor - currentFloor))),
    title,
    totals,
    winRate: totals.matches ? Math.round((totals.wins / totals.matches) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Centro de notificaciones                                            */
/* ------------------------------------------------------------------ */

export type NotifKind =
  | "partido" | "mercado" | "academia" | "draft" | "obra" | "contrato"
  | "seleccion" | "finanzas" | "logro" | "multijugador";

export interface Notification {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  urgency: "alta" | "media" | "baja";
  actionLabel?: string;
  actionPath?: string;
  timeHint?: string;
}

export interface NotifPrefs {
  partido: boolean;
  mercado: boolean;
  academia: boolean;
  draft: boolean;
  obra: boolean;
  contrato: boolean;
  seleccion: boolean;
  finanzas: boolean;
  logro: boolean;
  multijugador: boolean;
}

export const DEFAULT_PREFS: NotifPrefs = {
  partido: true, mercado: true, academia: true, draft: true, obra: true,
  contrato: true, seleccion: true, finanzas: true, logro: true, multijugador: true,
};

export const NOTIF_META: Record<NotifKind, { label: string; icon: string }> = {
  partido: { label: "Partidos", icon: "⚽" },
  mercado: { label: "Mercado", icon: "🔄" },
  academia: { label: "Academia", icon: "🎓" },
  draft: { label: "Draft", icon: "🎲" },
  obra: { label: "Obras", icon: "🏗️" },
  contrato: { label: "Contratos", icon: "📄" },
  seleccion: { label: "Selecciones", icon: "🏳️" },
  finanzas: { label: "Finanzas", icon: "💰" },
  logro: { label: "Logros", icon: "🏅" },
  multijugador: { label: "Multijugador", icon: "🌍" },
};

/**
 * Genera las notificaciones ACCIONABLES del momento: no repite las noticias
 * históricas, sino lo que el manager debería atender ahora mismo.
 */
export function buildNotifications(params: {
  club: Club | null;
  players: Player[];
  league: LeagueState | null;
  market: MarketState | null;
  academy: AcademyState | null;
  draft: DraftState | null;
  staffMarket: StaffState | null;
  national: NationalState | null;
  competitions: CompetitionsState | null;
  offersPending: number;
  news: NewsItem[];
  prefs: NotifPrefs;
}): Notification[] {
  const out: Notification[] = [];
  const { club, players, league, market, academy, draft, staffMarket, national, competitions, offersPending, prefs } = params;
  if (!club) return out;

  const push = (n: Notification) => {
    if (prefs[n.kind]) out.push(n);
  };

  /* Partido de liga disponible */
  if (league) {
    const next = league.fixtures.find((f) => !f.played && (f.homeId === league.clubId || f.awayId === league.clubId));
    if (next) {
      const ready = Date.parse(next.date) <= Date.now();
      push({
        id: "match_next",
        kind: "partido",
        title: ready ? "Tienes un partido listo" : "Próximo partido de liga",
        body: ready ? `Jornada ${next.round}: el equipo espera tus órdenes.` : `Jornada ${next.round} disponible pronto.`,
        urgency: ready ? "alta" : "baja",
        actionLabel: "Ir a la Liga",
        actionPath: "/liga",
        timeHint: ready ? "Disponible" : realTimeUntil(next.date),
      });
    }
  }

  /* Copas */
  if (competitions) {
    for (const [kind, cup] of Object.entries(competitions).filter(([, c]) => c && typeof c === "object" && "ties" in (c as object))) {
      const c = cup as CompetitionsState["nacional"];
      if (!c || c.status !== "activa") continue;
      const tie = c.ties.find((t) => !t.played && t.round === c.round && (t.homeId === club.id || t.awayId === club.id));
      if (tie && Date.parse(tie.date) <= Date.now()) {
        push({
          id: `cup_${kind}`,
          kind: "partido",
          title: `Eliminatoria de ${c.name}`,
          body: "Tu equipo tiene un partido de copa pendiente de disputar.",
          urgency: "alta",
          actionLabel: "Ir a Copas",
          actionPath: "/copas",
          timeHint: "Disponible",
        });
      }
    }
  }

  /* Multijugador */
  if (offersPending > 0) {
    push({
      id: "mp_offers",
      kind: "multijugador",
      title: `${offersPending} oferta(s) de otros managers`,
      body: "Hay propuestas de traspaso esperando tu respuesta.",
      urgency: "alta",
      actionLabel: "Ver ofertas",
      actionPath: "/multijugador",
    });
  }

  /* Mercado: ofertas de la IA */
  if (market && market.incomingOffers.length > 0) {
    push({
      id: "market_offers",
      kind: "mercado",
      title: `${market.incomingOffers.length} oferta(s) por tus jugadores`,
      body: "Clubes interesados en los futbolistas que has puesto en el mercado.",
      urgency: "media",
      actionLabel: "Ir al Mercado",
      actionPath: "/mercado",
    });
  }

  /* Academia */
  if (academy && academy.candidates.length > 0 && academy.promoted.length < 2) {
    push({
      id: "academy_intake",
      kind: "academia",
      title: `${academy.candidates.length} canteranos esperan decisión`,
      body: `Puedes promocionar hasta ${2 - academy.promoted.length} jugador(es) este mes.`,
      urgency: "media",
      actionLabel: "Ver academia",
      actionPath: "/academia",
    });
  }

  /* Draft */
  if (draft && draft.phase === "abierto") {
    const left = 2 - (draft.picks[club.id]?.length ?? 0);
    push({
      id: "draft_open",
      kind: "draft",
      title: left > 0 ? `Draft abierto: ${left} selección(es) libre(s)` : "Draft listo para cerrar",
      body: left > 0 ? "Elige a tus candidatos antes de cerrar el draft." : "Cierra el draft para revelar los datos reales.",
      urgency: left > 0 ? "media" : "alta",
      actionLabel: "Ir al Draft",
      actionPath: "/draft",
    });
  }

  /* Obras en curso */
  for (const [key, f] of Object.entries(club.facilities)) {
    if (f.upgrading) {
      const done = Date.parse(f.upgrading.finishesAt) <= Date.now();
      push({
        id: `work_${key}`,
        kind: "obra",
        title: done ? "Obra finalizada" : "Obra en curso",
        body: done ? `La ampliación a nivel ${f.upgrading.toLevel} ya está lista.` : `Ampliación a nivel ${f.upgrading.toLevel} en marcha.`,
        urgency: done ? "media" : "baja",
        actionLabel: "Ver instalaciones",
        actionPath: "/club",
        timeHint: done ? "Completada" : realTimeUntil(f.upgrading.finishesAt),
      });
    }
  }

  /* Cursos del cuerpo técnico */
  if (staffMarket) {
    for (const c of staffMarket.courses) {
      push({
        id: `course_${c.staffId}`,
        kind: "contrato",
        title: `${c.staffName} en formación`,
        body: `${c.courseLabel}: +${c.gain} niveles al completarse.`,
        urgency: "baja",
        actionLabel: "Cuerpo técnico",
        actionPath: "/cuerpo-tecnico",
        timeHint: realTimeUntil(c.finishesAt),
      });
    }
  }

  /* Contratos a punto de expirar (menos de 180 días de juego) */
  const soon = players.filter((p) => {
    const days = (Date.parse(p.contract.expires) - Date.now()) / 86400000;
    return days > 0 && days < 180;
  });
  if (soon.length) {
    push({
      id: "contracts_soon",
      kind: "contrato",
      title: `${soon.length} contrato(s) por expirar`,
      body: `${soon.slice(0, 3).map((p) => p.name).join(", ")}${soon.length > 3 ? "…" : ""} acaban contrato pronto.`,
      urgency: "media",
      actionLabel: "Renovar",
      actionPath: "/mercado",
    });
  }

  /* Lesionados */
  const injured = players.filter((p) => p.injury && p.injury.daysOut > 0);
  if (injured.length) {
    push({
      id: "injuries",
      kind: "contrato",
      title: `${injured.length} jugador(es) en la enfermería`,
      body: `${injured[0].name} y compañía están de baja. Revisa el entrenamiento.`,
      urgency: "baja",
      actionLabel: "Entrenamiento",
      actionPath: "/entrenamiento",
    });
  }

  /* Finanzas en rojo */
  if (club.finances.balance < 0) {
    push({
      id: "debt",
      kind: "finanzas",
      title: "El club está en números rojos",
      body: "La directiva exige contención inmediata del gasto.",
      urgency: "alta",
      actionLabel: "Ver economía",
      actionPath: "/finanzas",
    });
  } else if (club.finances.weeklyIncome < club.finances.weeklyExpense) {
    push({
      id: "deficit",
      kind: "finanzas",
      title: "Balance semanal negativo",
      body: "Gastas más de lo que ingresas cada semana.",
      urgency: "media",
      actionLabel: "Ver economía",
      actionPath: "/finanzas",
    });
  }

  /* Patrocinio libre */
  if (!club.finances.sponsorship) {
    push({
      id: "no_sponsor",
      kind: "finanzas",
      title: "Sin patrocinador principal",
      body: "Estás perdiendo ingresos semanales: revisa las ofertas disponibles.",
      urgency: "media",
      actionLabel: "Buscar patrocinio",
      actionPath: "/finanzas",
    });
  }

  /* Elecciones de selección abiertas */
  if (national) {
    for (const [key, team] of Object.entries(national.teams)) {
      if (team.election && !team.election.resolved) {
        push({
          id: `election_${key}`,
          kind: "seleccion",
          title: `Elecciones abiertas: selección ${key}`,
          body: "Puedes presentar tu candidatura o votar a otro manager.",
          urgency: "media",
          actionLabel: "Ir a Selecciones",
          actionPath: "/selecciones",
          timeHint: realTimeUntil(team.election.closesAt),
        });
      }
    }
  }

  /* Puesto de la liga en zona de descenso */
  if (league) {
    const table = sortedTable(league);
    const pos = table.findIndex((r) => r.clubId === club.id) + 1;
    if (pos > 0 && pos >= table.length - 1 && (table[pos - 1]?.played ?? 0) >= 4) {
      push({
        id: "relegation",
        kind: "partido",
        title: "Zona de descenso",
        body: `Vais ${pos}º de ${table.length}. La directiva empieza a inquietarse.`,
        urgency: "alta",
        actionLabel: "Ver clasificación",
        actionPath: "/liga",
      });
    }
  }

  const order = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => order[a.urgency] - order[b.urgency]);
}

export const URGENCY_STYLE: Record<Notification["urgency"], string> = {
  alta: "border-rose-500/40 bg-rose-500/8",
  media: "border-amber-500/35 bg-amber-500/8",
  baja: "border-white/8 bg-ink-900/40",
};

/** Perfil por defecto ampliado con los campos de la FASE 13 */
export interface ExtendedProfile extends UserProfile {
  avatarUrl?: string | null;
  clubBadgeUrl?: string | null;
  bio?: string;
  notifPrefs?: NotifPrefs;
}
