/**
 * src/components/ui.tsx — sistema de componentes reutilizables.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { ratingBg, ratingColor } from "@/game/format";

export function Card({
  children, className, title, subtitle, action, dense,
}: {
  children?: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; dense?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/8 bg-ink-850/90 backdrop-blur-sm shadow-[0_1px_2px_rgba(22,32,46,0.06),0_6px_18px_-12px_rgba(22,32,46,0.25)]",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold tracking-wide text-white/90">{title}</h2>}
            {subtitle && <p className="truncate text-xs text-white/45">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn(dense ? "p-0" : "p-4")}>{children}</div>
    </section>
  );
}

export function Button({
  variant = "primary", size = "md", className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-turf-500 text-[#fff] hover:bg-turf-400 font-semibold shadow-lg shadow-emerald-500/15",
    ghost: "text-white/70 hover:text-white hover:bg-white/5",
    outline: "border border-white/15 text-white/80 hover:bg-white/5",
    danger: "bg-rose-500 text-[#fff] hover:bg-rose-600",
    subtle: "bg-white/8 text-white hover:bg-white/12",
  };
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant], sizes[size], className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">{label}</span>}
      <input
        className={cn(
          "w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition",
          "placeholder:text-white/25 focus:border-turf-500/60 focus:ring-2 focus:ring-turf-500/20",
          className
        )}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-white/35">{hint}</span>}
    </label>
  );
}

export function Select({ label, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">{label}</span>}
      <select
        className={cn(
          "w-full appearance-none rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-white outline-none",
          "focus:border-turf-500/60 focus:ring-2 focus:ring-turf-500/20",
          className
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}>
      {children}
    </span>
  );
}

export function Rating({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-6 w-6 text-[11px]", md: "h-8 w-8 text-sm", lg: "h-12 w-12 text-lg" };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 font-bold tabular-nums",
        sizes[size], ratingColor(value)
      )}
    >
      {Math.round(value)}
    </span>
  );
}

export function Bar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/8", className)}>
      <div className={cn("h-full rounded-full transition-all", ratingBg(value))} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

export function StatTile({
  label, value, sub, icon, tone = "default",
}: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "default" | "good" | "bad" | "warn" }) {
  const tones = {
    default: "text-white",
    good: "text-emerald-300",
    bad: "text-rose-300",
    warn: "text-amber-300",
  };
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-850/70 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</span>
        {icon && <span className="text-white/30">{icon}</span>}
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums sm:text-2xl", tones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/40">{sub}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-turf-400" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <h3 className="font-semibold text-white/85">{title}</h3>
      {text && <p className="max-w-md text-sm text-white/45">{text}</p>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cn(
          "fm-pop max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-5 sm:rounded-3xl",
          wide ? "sm:max-w-4xl" : "sm:max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3 className="mb-4 text-lg font-bold">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

/** Gráfico radar SVG sin dependencias */
export function RadarChart({ data, size = 220 }: { data: { label: string; value: number }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const n = data.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rr = (v / 100) * r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const poly = data.map((d, i) => pt(i, d.value).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[260px]">
      {[25, 50, 75, 100].map((ring) => (
        <polygon
          key={ring}
          points={data.map((_, i) => pt(i, ring).join(",")).join(" ")}
          fill="none"
          stroke="rgba(22,32,46,0.12)"
          strokeWidth={1}
        />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(22,32,46,0.10)" />;
      })}
      <polygon points={poly} fill="rgba(16,185,129,0.25)" stroke="#34d399" strokeWidth={2} />
      {data.map((d, i) => {
        const [x, y] = pt(i, 118);
        return (
          <text key={d.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-white/45" style={{ fontSize: 9 }}>
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Barras verticales simples */
export function MiniBars({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="flex h-28 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={cn("w-full rounded-t-md", d.color ?? "bg-turf-500/80")}
            style={{ height: `${Math.max(4, (Math.abs(d.value) / max) * 88)}%` }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="truncate text-[10px] text-white/40">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
