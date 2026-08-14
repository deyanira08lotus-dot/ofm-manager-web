/**
 * src/game/time.ts
 * Reloj del mundo. Es determinista: cualquier cliente y las Cloud Functions
 * calculan la misma fecha de juego a partir del tiempo real -> el juego avanza
 * aunque el usuario esté desconectado.
 */
import { GAME_CONFIG } from "./config";

const REAL_EPOCH = Date.parse(GAME_CONFIG.realEpochISO);
const GAME_EPOCH = Date.parse(GAME_CONFIG.gameEpochISO);
const RATE = GAME_CONFIG.gameDaysPerRealDay;

export function gameNow(realMs: number = Date.now()): Date {
  return new Date(GAME_EPOCH + (realMs - REAL_EPOCH) * RATE);
}

export function gameNowISO(): string {
  return gameNow().toISOString();
}

export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addYears(date: Date | string, years: number): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === "string" ? Date.parse(a) : a.getTime();
  const db = typeof b === "string" ? Date.parse(b) : b.getTime();
  return Math.round((db - da) / 86400000);
}

export function ageAt(birthISO: string, at: Date = gameNow()): number {
  const b = new Date(birthISO);
  let age = at.getUTCFullYear() - b.getUTCFullYear();
  const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** Temporada 1 julio -> 30 junio. Devuelve "2026-27" */
export function seasonIdOf(date: Date = gameNow()): string {
  const y = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= GAME_CONFIG.seasonStartMonth ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

export function formatGameDate(d: Date | string, opts: { long?: boolean } = {}): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return opts.long ? `${day} de ${month}. de ${year}` : `${day} ${month} ${year}`;
}

/** Tiempo real que falta hasta una fecha del juego */
export function realTimeUntil(gameISO: string): string {
  const diffGameMs = Date.parse(gameISO) - gameNow().getTime();
  if (diffGameMs <= 0) return "listo";
  const realMs = diffGameMs / RATE;
  const h = Math.floor(realMs / 3600000);
  const m = Math.floor((realMs % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h >= 1) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}
