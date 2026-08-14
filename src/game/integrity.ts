/**
 * src/game/integrity.ts
 * CAPA DE INTEGRIDAD (FASE 10).
 *
 * Defensa en profundidad. El orden de confianza es:
 *   1) Cloud Functions (Admin SDK)  → autoridad absoluta
 *   2) Reglas de Firestore          → cortafuegos declarativo
 *   3) Esta capa (cliente)          → detecta y corrige estados imposibles
 *
 * No sustituye a 1 y 2: sirve para que un estado corrupto (por un bug, por
 * manipulación de localStorage o por un exploit) no se propague ni se guarde.
 */
import type { Club, Player } from "@/types";
import { GAME_CONFIG } from "./config";
import { SQUAD_MAX, SQUAD_MIN } from "./market";
import { marketValue, overallFor, potentialClassOf } from "./players";

export interface IntegrityIssue {
  severity: "critical" | "warning";
  code: string;
  message: string;
  fixed: boolean;
}

export interface IntegrityReport {
  ok: boolean;
  issues: IntegrityIssue[];
  club: Club;
  players: Player[];
  checkedAt: number;
}

/** Techos absolutos: nada del juego puede superarlos legítimamente */
export const LIMITS = {
  maxBalance: 2_000_000_000,
  maxWage: 2_000_000,
  maxValue: 500_000_000,
  maxOverall: 99,
  maxReputation: 100,
  maxCapacity: 120_000,
  maxFacilityLevel: 10,
  maxSquad: SQUAD_MAX,
  minSquad: SQUAD_MIN,
};

/**
 * Verifica y CORRIGE el estado antes de mostrarlo o guardarlo.
 * Devuelve copias saneadas: nunca muta la entrada.
 */
export function verifyState(club: Club, players: Player[]): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const nextClub: Club = JSON.parse(JSON.stringify(club));
  let nextPlayers = players;

  const flag = (severity: IntegrityIssue["severity"], code: string, message: string, fixed = true) =>
    issues.push({ severity, code, message, fixed });

  /* ---------------------- Club ---------------------- */
  if (!Number.isFinite(nextClub.finances.balance)) {
    nextClub.finances.balance = 0;
    flag("critical", "BALANCE_NAN", "Saldo no numérico corregido a 0.");
  }
  if (nextClub.finances.balance > LIMITS.maxBalance) {
    nextClub.finances.balance = LIMITS.maxBalance;
    flag("critical", "BALANCE_MAX", "Saldo por encima del máximo permitido: recortado.");
  }
  if (nextClub.reputation > LIMITS.maxReputation || nextClub.reputation < 0) {
    nextClub.reputation = Math.max(1, Math.min(LIMITS.maxReputation, nextClub.reputation));
    flag("critical", "REP_RANGE", "Reputación fuera de rango: ajustada.");
  }
  if (nextClub.stadium.capacity > LIMITS.maxCapacity) {
    nextClub.stadium.capacity = LIMITS.maxCapacity;
    flag("critical", "CAPACITY_MAX", "Aforo del estadio por encima del máximo: recortado.");
  }
  for (const [key, f] of Object.entries(nextClub.facilities)) {
    if (f.level > LIMITS.maxFacilityLevel) {
      f.level = LIMITS.maxFacilityLevel;
      flag("critical", `FAC_${key}`, `Instalación ${key} por encima del nivel máximo.`);
    }
    if (f.upgrading && f.upgrading.toLevel > f.level + 1) {
      f.upgrading = null;
      flag("critical", `FAC_UP_${key}`, `Obra imposible en ${key}: cancelada.`);
    }
  }
  const presetBalances = GAME_CONFIG.budgetPresets.map((p) => p.balance);
  if (nextClub.record.played === 0 && nextClub.finances.balance > Math.max(...presetBalances) * 3) {
    flag("warning", "BALANCE_START", "Saldo inicial sospechosamente alto sin partidos jugados.", false);
  }

  /* --------------------- Jugadores -------------------- */
  const seen = new Set<string>();
  const seeds = new Set<string>();
  let mutated = false;

  const cleaned = players.map((p) => {
    let player = p;
    const fix = (patch: Partial<Player>) => {
      player = { ...player, ...patch };
      mutated = true;
    };

    // Duplicados (mismo id o misma semilla = mismo jugador clonado)
    if (seen.has(p.id)) {
      flag("critical", "DUP_ID", `Jugador duplicado detectado: ${p.name}.`);
      return null;
    }
    seen.add(p.id);
    if (p.seed && seeds.has(p.seed)) {
      flag("critical", "DUP_SEED", `Clon de jugador detectado: ${p.name}.`);
      return null;
    }
    if (p.seed) seeds.add(p.seed);

    // Rango de atributos y coherencia nivel/potencial
    const recomputed = overallFor(p.position, p.attributes);
    if (Math.abs(recomputed - p.overall) > 6) {
      fix({ overall: recomputed });
      flag("critical", "OVR_MISMATCH", `Nivel de ${p.name} no coincide con sus atributos: recalculado.`);
    }
    if (p.potential < p.overall) {
      fix({ potential: Math.round(p.overall) });
      flag("warning", "POT_LOW", `Potencial de ${p.name} inferior al nivel: ajustado.`);
    }
    if (p.potential > LIMITS.maxOverall || p.overall > LIMITS.maxOverall) {
      fix({ potential: Math.min(LIMITS.maxOverall, p.potential), overall: Math.min(LIMITS.maxOverall, p.overall) });
      flag("critical", "OVR_MAX", `${p.name} superaba el nivel máximo permitido.`);
    }
    if (potentialClassOf(player.potential) !== p.potentialClass) {
      fix({ potentialClass: potentialClassOf(player.potential) });
      flag("warning", "CLASS_MISMATCH", `Clase de ${p.name} recalculada.`);
    }

    // Economía del jugador
    const fairValue = marketValue(player.overall, player.potential, p.age, p.reputation);
    if (p.value > Math.max(LIMITS.maxValue, fairValue * 6)) {
      fix({ value: fairValue });
      flag("critical", "VALUE_MAX", `Valor de ${p.name} fuera de escala: recalculado.`);
    }
    if (p.contract.wage > LIMITS.maxWage || p.contract.wage < 0) {
      fix({ contract: { ...p.contract, wage: Math.max(400, Math.min(LIMITS.maxWage, p.contract.wage)) } });
      flag("critical", "WAGE_RANGE", `Salario de ${p.name} fuera de rango.`);
    }

    // Estados imposibles
    if (p.age < 14 || p.age > 45) {
      flag("critical", "AGE_RANGE", `Edad imposible en ${p.name}: jugador descartado.`);
      return null;
    }
    if (p.clubId !== club.id) {
      flag("warning", "CLUB_MISMATCH", `${p.name} no pertenece a este club.`, false);
    }
    return player;
  }).filter((p): p is Player => p !== null);

  if (cleaned.length !== players.length || mutated) nextPlayers = cleaned;

  /* ------------------- Tamaño de plantilla ------------------ */
  if (nextPlayers.length > LIMITS.maxSquad) {
    flag("warning", "SQUAD_MAX", `Plantilla con ${nextPlayers.length} jugadores (máximo ${LIMITS.maxSquad}).`, false);
  }
  if (nextPlayers.length > 0 && nextPlayers.length < LIMITS.minSquad) {
    flag("warning", "SQUAD_MIN", `Plantilla corta: ${nextPlayers.length} jugadores (mínimo ${LIMITS.minSquad}).`, false);
  }
  nextClub.squadSize = nextPlayers.length;

  return {
    ok: issues.filter((i) => i.severity === "critical").length === 0,
    issues,
    club: nextClub,
    players: nextPlayers,
    checkedAt: Date.now(),
  };
}

/** Resumen legible para la pantalla de sistema */
export function integritySummary(report: IntegrityReport | null): {
  label: string;
  tone: "good" | "warn" | "bad";
  detail: string;
} {
  if (!report) return { label: "Sin verificar", tone: "warn", detail: "Aún no se ha ejecutado la comprobación." };
  const critical = report.issues.filter((i) => i.severity === "critical").length;
  const warnings = report.issues.filter((i) => i.severity === "warning").length;
  if (critical > 0) {
    return { label: "Anomalías corregidas", tone: "bad", detail: `${critical} problema(s) crítico(s) saneado(s).` };
  }
  if (warnings > 0) {
    return { label: "Estado con avisos", tone: "warn", detail: `${warnings} aviso(s) sin gravedad.` };
  }
  return { label: "Datos íntegros", tone: "good", detail: "Todas las comprobaciones superadas." };
}
