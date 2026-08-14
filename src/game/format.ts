/**
 * src/game/format.ts — utilidades de formato (moneda, números, colores).
 */

export function money(n: number, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (opts.compact !== false) {
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)} B €`;
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)} M €`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} K €`;
  }
  return `${sign}${Math.round(abs).toLocaleString("es-ES")} €`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString("es-ES");
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** Color por valor 1-99 (escala tipo scouting) */
export function ratingColor(v: number): string {
  if (v >= 88) return "text-fuchsia-300";
  if (v >= 80) return "text-emerald-300";
  if (v >= 70) return "text-lime-300";
  if (v >= 60) return "text-yellow-300";
  if (v >= 50) return "text-orange-300";
  return "text-rose-400";
}

export function ratingBg(v: number): string {
  if (v >= 88) return "bg-fuchsia-500";
  if (v >= 80) return "bg-emerald-500";
  if (v >= 70) return "bg-lime-500";
  if (v >= 60) return "bg-yellow-500";
  if (v >= 50) return "bg-orange-500";
  return "bg-rose-500";
}

export const CLASS_STYLE: Record<string, string> = {
  SS: "bg-gradient-to-r from-fuchsia-500 to-amber-400 text-black",
  S: "bg-gradient-to-r from-violet-500 to-fuchsia-400 text-black",
  A: "bg-emerald-500 text-black",
  B: "bg-lime-500 text-black",
  C: "bg-yellow-500 text-black",
  D: "bg-zinc-500 text-black",
};

export function moraleLabel(v: number): string {
  if (v >= 85) return "Eufórico";
  if (v >= 70) return "Muy buena";
  if (v >= 55) return "Buena";
  if (v >= 40) return "Normal";
  if (v >= 25) return "Baja";
  return "Muy baja";
}

export function formLabel(v: number): string {
  if (v >= 85) return "En racha";
  if (v >= 70) return "Muy buena";
  if (v >= 55) return "Buena";
  if (v >= 40) return "Irregular";
  return "Mala";
}
