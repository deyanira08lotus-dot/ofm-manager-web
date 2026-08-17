/**
 * src/components/Layout.tsx
 * Shell responsive: sidebar en PC / menú inferior en móvil + topbar con datos del club.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, Briefcase, CalendarDays, ChevronRight, ClipboardList, Coins, Dumbbell, Gavel, GraduationCap,
  Flag, Globe2, LayoutDashboard, LogOut, Menu, Newspaper, Settings, ShieldCheck, ShieldHalf, ShoppingCart,
  Sparkles, Star,
  MessagesSquare, Radar, Radio, RefreshCw, Trophy, User, Users, WifiOff, X,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useGame } from "@/state/GameContext";
import { usePwa } from "@/lib/pwa";
import { navigate, useRoute } from "@/lib/router";
import { money } from "@/game/format";
import { Modal } from "@/components/ui";
import { formatGameDate, gameNow, seasonIdOf } from "@/game/time";
import { countryFlag } from "@/game/data/countries";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  soon?: string;
  mobile?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Panel", icon: <LayoutDashboard size={18} />, mobile: true },
  { to: "/plantilla", label: "Plantilla", icon: <Users size={18} />, mobile: true },
  { to: "/alineacion", label: "Alineación", icon: <ClipboardList size={18} />, mobile: true },
  { to: "/entrenamiento", label: "Entrenamiento", icon: <Dumbbell size={18} /> },
  { to: "/vestuario", label: "Vestuario", icon: <MessagesSquare size={18} /> },
  { to: "/liga", label: "Liga y partidos", icon: <CalendarDays size={18} />, mobile: true },
  { to: "/copas", label: "Copas", icon: <Trophy size={18} /> },
  { to: "/club", label: "Club", icon: <ShieldHalf size={18} /> },
  { to: "/finanzas", label: "Economía", icon: <Coins size={18} /> },
  { to: "/noticias", label: "Noticias", icon: <Newspaper size={18} /> },
  { to: "/multijugador", label: "Multijugador", icon: <Globe2 size={18} /> },
  { to: "/fama", label: "Fama y legado", icon: <Star size={18} /> },
  { to: "/rankings", label: "Rankings", icon: <Trophy size={18} /> },
  { to: "/mercado", label: "Mercado", icon: <ShoppingCart size={18} />, mobile: true },
  { to: "/scouting", label: "Análisis y ojeo", icon: <Radar size={18} /> },
  { to: "/academia", label: "Academia", icon: <GraduationCap size={18} /> },
  { to: "/draft", label: "Draft", icon: <Gavel size={18} /> },
  { to: "/cuerpo-tecnico", label: "Cuerpo técnico", icon: <Briefcase size={18} /> },
  { to: "/selecciones", label: "Selecciones", icon: <Flag size={18} /> },
  { to: "/fases", label: "Hoja de ruta", icon: <Sparkles size={18} /> },
  { to: "/perfil", label: "Mi perfil", icon: <User size={18} /> },
  { to: "/sistema", label: "Sistema", icon: <ShieldCheck size={18} /> },
  { to: "/ajustes", label: "Ajustes", icon: <Settings size={18} /> },
];

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={() => { navigate(item.to); onClick?.(); }}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
        active ? "bg-turf-500/15 text-turf-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]" : "text-white/55 hover:bg-white/5 hover:text-white/90"
      )}
    >
      <span className={cn(active ? "text-turf-300" : "text-white/40 group-hover:text-white/70")}>{item.icon}</span>
      <span className="flex-1 text-left font-medium">{item.label}</span>
      {item.soon && <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-bold text-white/40">{item.soon}</span>}
      {active && !item.soon && <ChevronRight size={14} className="text-turf-400/60" />}
    </button>
  );
}

function ChileClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className="whitespace-nowrap tabular-nums">
      Chile · {new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        dateStyle: "short",
        timeStyle: "short",
      }).format(now)}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const {
    club, profile, news, logout, mode, lastSeasonSummary, dismissSeasonSummary, notifications, liveMatch,
  } = useGame();
  const badgeUrl = (profile as { clubBadgeUrl?: string | null } | null)?.clubBadgeUrl ?? null;
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const pwa = usePwa();
  const unread = news.filter((n) => !n.read).length;
  const active = (to: string) => (to === "/" ? route.path === "/" : route.path.startsWith(to));
  const now = gameNow();

  const sidebar = (onNav?: () => void) => (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-3 px-2 py-3">
        <div
          className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl text-sm font-black text-[#fff] shadow-md"
          style={badgeUrl ? undefined : { background: `linear-gradient(135deg, ${club?.colors.primary ?? "#10b981"}, ${club?.colors.secondary ?? "#0ea5e9"})` }}
        >
          {badgeUrl ? <img src={badgeUrl} alt="" className="h-full w-full object-cover" /> : club?.shortName ?? "FM"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{club?.name ?? "Fútbol Manager"}</p>
          <p className="truncate text-[11px] text-white/40">
            {club ? `${countryFlag(club.country)} División ${club.division} · ${club.seasonId}` : "Crea tu club"}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <NavLink key={item.to} item={item} active={active(item.to)} onClick={onNav} />
        ))}
      </nav>

      <div className="mt-2 rounded-xl border border-white/8 bg-ink-900/60 p-3">
        <p className="text-[11px] uppercase tracking-wider text-white/35">Manager</p>
        <p className="truncate text-sm font-semibold">{profile?.managerName ?? "—"}</p>
        <p className="mt-0.5 text-[11px] text-white/35">
          Nivel {profile?.managerLevel ?? 1} · {mode === "firebase" ? "Firebase" : "Modo local"}
        </p>
        <button
          onClick={() => logout()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white"
        >
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar PC */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/8 bg-ink-900/80 backdrop-blur lg:block">
        {sidebar()}
      </aside>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" />
          <aside className="fm-pop absolute inset-y-0 left-0 w-72 border-r border-white/10 bg-ink-900" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 text-white/50" onClick={() => setOpen(false)}><X size={20} /></button>
            {sidebar(() => setOpen(false))}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-white/8 bg-ink-950/85 backdrop-blur">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
            <button className="rounded-lg p-2 text-white/60 hover:bg-white/5 lg:hidden" onClick={() => setOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold sm:text-base">{club?.name ?? "Fútbol Manager Online"}</p>
              <p className="truncate text-[11px] text-white/40">
                {formatGameDate(now)} · Temporada {seasonIdOf(now)}
              </p>
            </div>
            {club && (
              <div className="hidden items-center gap-2 rounded-xl border border-white/8 bg-ink-850 px-3 py-1.5 sm:flex">
                <Coins size={15} className="text-amber-300" />
                <span className="text-sm font-semibold tabular-nums">{money(club.finances.balance)}</span>
              </div>
            )}
            <div className="hidden rounded-xl border border-white/8 bg-ink-850 px-3 py-1.5 text-[11px] text-white/55 sm:block">
              <ChileClock />
            </div>
            <button className="relative rounded-lg p-2 text-white/60 hover:bg-white/5" onClick={() => navigate("/noticias")}>
              <Bell size={18} />
              {unread + notifications.filter((n) => n.urgency === "alta").length > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-[#fff]">
                  {unread + notifications.filter((n) => n.urgency === "alta").length}
                </span>
              )}
            </button>
          </div>
          {club && (
            <div className="flex items-center gap-2 overflow-x-auto border-t border-white/5 px-3 py-1.5 text-[11px] text-white/45 sm:hidden">
              <Coins size={12} className="text-amber-300" />
              <span className="font-semibold text-white/70">{money(club.finances.balance)}</span>
              <span>·</span>
              <ChileClock />
              <span>·</span>
              <span>Rep. {club.reputation}</span>
              <span>·</span>
              <span>{club.fanbase.followers.toLocaleString("es-ES")} seguidores</span>
            </div>
          )}
        </header>

        {/* Avisos globales (FASE 10) */}
        {!pwa.online && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-700">
            <WifiOff size={13} /> Sin conexión · los cambios se guardarán al recuperarla
          </div>
        )}
        {pwa.updateReady && (
          <button onClick={() => pwa.applyUpdate()}
                  className="flex w-full items-center justify-center gap-2 bg-sky-500/15 px-4 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-500/25">
            <RefreshCw size={13} /> Nueva versión disponible · toca para actualizar
          </button>
        )}
        {liveMatch && !route.path.startsWith("/directo") && (
          <button onClick={() => navigate("/directo")}
                  className="flex w-full items-center justify-center gap-2 bg-turf-500/20 px-4 py-1.5 text-xs font-semibold text-turf-600 hover:bg-turf-500/30">
            <Radio size={13} /> Partido en directo · {liveMatch.minute}' ·{" "}
            {liveMatch.goals.home}-{liveMatch.goals.away} · volver al banquillo
          </button>
        )}

        <main className="fm-fade mx-auto w-full max-w-7xl px-3 pb-28 pt-4 sm:px-5 lg:pb-10">{children}</main>
      </div>

      {/* Menú inferior móvil */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink-900/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => n.mobile).map((item) => {
            const isActive = active(item.to);
            return (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  isActive ? "text-turf-300" : "text-white/45")}
              >
                <span className={cn("rounded-lg px-3 py-1", isActive && "bg-turf-500/15")}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Resumen de fin de temporada (FASE 10) */}
      <Modal open={!!lastSeasonSummary} onClose={dismissSeasonSummary} title="Temporada finalizada" wide>
        {lastSeasonSummary && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl bg-turf-500/10 p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-turf-500/20 text-2xl font-black text-turf-300">
                {lastSeasonSummary.position || "—"}º
              </div>
              <div>
                <p className="text-lg font-black">Temporada {lastSeasonSummary.seasonId}</p>
                <p className="text-sm text-white/50">
                  {lastSeasonSummary.won}V {lastSeasonSummary.drawn}E {lastSeasonSummary.lost}D · {lastSeasonSummary.points} puntos
                </p>
              </div>
            </div>

            {lastSeasonSummary.promoted && (
              <p className="rounded-xl border border-turf-500/40 bg-turf-500/10 px-3 py-2.5 text-sm font-semibold text-turf-300">
                🎉 ¡El club asciende de categoría!
              </p>
            )}
            {lastSeasonSummary.relegated && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
                El club desciende de categoría. Toca reconstruir.
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-white/5 p-3 text-sm">
                <p className="text-xs text-white/40">Premios recibidos</p>
                <p className="font-bold text-emerald-300">{money(lastSeasonSummary.prize)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-sm">
                <p className="text-xs text-white/40">Máximo goleador</p>
                <p className="font-bold">
                  {lastSeasonSummary.topScorer ? `${lastSeasonSummary.topScorer.name} (${lastSeasonSummary.topScorer.goals})` : "—"}
                </p>
              </div>
            </div>

            {lastSeasonSummary.retired.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">Se retiran del fútbol</p>
                <div className="space-y-1.5">
                  {lastSeasonSummary.retired.map((r) => (
                    <div key={r.name} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-sm">
                      <span>{r.legend && "👑 "}{r.name} ({r.age} años)</span>
                      <span className="text-xs text-white/40">{r.apps} PJ · {r.goals} goles</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastSeasonSummary.breakthroughs.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">Grandes progresiones</p>
                <div className="space-y-1.5">
                  {lastSeasonSummary.breakthroughs.map((b) => (
                    <div key={b.name} className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
                      <span>{b.name}</span>
                      <span className="font-bold text-emerald-300">{b.from} → {b.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={dismissSeasonSummary}
                    className="w-full rounded-xl bg-turf-500 py-3 text-sm font-semibold text-[#fff] hover:bg-turf-400">
              Comenzar nueva temporada
            </button>
          </div>
        )}
      </Modal>

      {/* Accesos rápidos secundarios (móvil) */}
      <div className="pointer-events-none fixed bottom-20 right-3 z-20 flex flex-col gap-2 lg:hidden">
        <button
          onClick={() => navigate("/finanzas")}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-ink-850/90 text-white/70 shadow-lg"
        >
          <Coins size={18} />
        </button>
        <button
          onClick={() => navigate("/club")}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-ink-850/90 text-white/70 shadow-lg"
        >
          <ShieldHalf size={18} />
        </button>
      </div>
    </div>
  );
}
