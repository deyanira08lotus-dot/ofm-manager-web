/**
 * src/pages/CalendarPage.tsx — Calendario mensual: grilla de días con
 * partidos de liga/copas marcados, agenda del día seleccionado, acceso
 * rápido al amistoso en días libres.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { userFixtures, isPlayable } from "@/game/league";
import { worldMember } from "@/game/multiplayer";
import {
  cupTeam,
  cupPlayable,
  roundName,
  CUP_ICON,
  CUP_STYLE,
  type CupKind,
} from "@/game/cups";
import { formatGameDate, realTimeUntil, gameNow } from "@/game/time";
import { navigate } from "@/lib/router";

const CUP_KINDS: CupKind[] = ["nacional", "supercopa", "internacional"];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

type DayEvent = {
  id: string;
  date: string;
  label: string;
  badgeClass: string;
  dotClass: string;
  opponentName: string;
  isHome: boolean;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  playable: boolean;
  onClick: () => void;
};

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

export default function CalendarPage() {
  const { club, world, competitions } = useGame();
  const today = dateKey(gameNow().toISOString());

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = gameNow();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const [selectedDate, setSelectedDate] = useState(today);

  const eventsByDate = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    if (!club) return map;
    const push = (key: string, ev: DayEvent) => {
      (map[key] ??= []).push(ev);
    };

    if (world) {
      for (const f of userFixtures(world)) {
        const isHome = f.homeId === club.id;
        const opponentId = isHome ? f.awayId : f.homeId;
        const opponent = worldMember(world, opponentId);
        push(dateKey(f.date), {
          id: f.id,
          date: f.date,
          label: "Liga",
          badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-300",
          dotClass: "bg-sky-400",
          opponentName: opponent?.name ?? "Rival desconocido",
          isHome,
          played: f.played,
          homeGoals: f.homeGoals,
          awayGoals: f.awayGoals,
          playable: isPlayable(f),
          onClick: () => navigate("/liga"),
        });
      }
    }

    if (competitions) {
      for (const kind of CUP_KINDS) {
        const cup = competitions[kind];
        if (!cup) continue;
        const ties = cup.ties.filter(
          (t) => t.homeId === club.id || t.awayId === club.id
        );
        for (const t of ties) {
          const isHome = t.homeId === club.id;
          const opponentId = isHome ? t.awayId : t.homeId;
          const opponent = cupTeam(cup, opponentId);
          push(dateKey(t.date), {
            id: t.id,
            date: t.date,
            label: `${CUP_ICON[kind]} ${roundName(t.round, cup.totalRounds)}`,
            badgeClass: CUP_STYLE[kind],
            dotClass:
              kind === "nacional"
                ? "bg-sky-400"
                : kind === "supercopa"
                ? "bg-amber-400"
                : "bg-fuchsia-400",
            opponentName: opponent?.name ?? "Rival desconocido",
            isHome,
            played: t.played,
            homeGoals: t.homeGoals,
            awayGoals: t.awayGoals,
            playable: cupPlayable(cup, club.id),
            onClick: () => navigate("/copas"),
          });
        }
      }
    }

    return map;
  }, [world, competitions, club]);

  if (!club) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="Calendario no disponible"
        text="Recarga la aplicación para ver tu calendario."
      />
    );
  }

  const year = monthCursor.getUTCFullYear();
  const month = monthCursor.getUTCMonth();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: { key: string; day: number }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `pad-${i}`, day: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ key, day: d });
  }

  const monthLabel = monthCursor.toLocaleDateString("es", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const selectedEvents = eventsByDate[selectedDate] ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white/90">Calendario</h1>
        <p className="text-sm text-white/50">
          Tocá un día para ver los partidos o encontrar hueco para un amistoso.
        </p>
      </div>

      <Card dense>
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setMonthCursor(new Date(Date.UTC(year, month - 1, 1)))}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/5"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold capitalize text-white/85">
            {monthLabel}
          </span>
          <button
            onClick={() => setMonthCursor(new Date(Date.UTC(year, month + 1, 1)))}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/5"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 px-3 pb-1 text-center text-[10px] text-white/35">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 px-3 pb-4">
          {cells.map((c) => {
            if (c.day === 0) return <div key={c.key} />;
            const events = eventsByDate[c.key] ?? [];
            const isToday = c.key === today;
            const isSelected = c.key === selectedDate;
            return (
              <button
                key={c.key}
                onClick={() => setSelectedDate(c.key)}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs ${
                  isSelected
                    ? "bg-white/15 font-semibold text-white"
                    : isToday
                    ? "border border-white/30 text-white/85"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                <span>{c.day}</span>
                {events.length > 0 && (
                  <span className="flex gap-0.5">
                    {events.slice(0, 3).map((ev, i) => (
                      <span key={i} className={`h-1 w-1 rounded-full ${ev.dotClass}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        dense
        title={formatGameDate(selectedDate)}
        subtitle={selectedEvents.length === 0 ? "Día libre — podés jugar un amistoso" : undefined}
        action={
          selectedEvents.length === 0 ? (
            <button
              onClick={() => navigate("/liga")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80"
            >
              Amistoso
            </button>
          ) : undefined
        }
      >
        {selectedEvents.length > 0 && (
          <ul className="divide-y divide-white/5">
            {selectedEvents.map((ev) => {
              const win =
                ev.played &&
                ((ev.isHome && (ev.homeGoals ?? 0) > (ev.awayGoals ?? 0)) ||
                  (!ev.isHome && (ev.awayGoals ?? 0) > (ev.homeGoals ?? 0)));
              const draw = ev.played && ev.homeGoals === ev.awayGoals;
              return (
                <li key={ev.id}>
                  <button
                    onClick={ev.onClick}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
                  >
                    <span
                      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ev.badgeClass}`}
                    >
                      {ev.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-white/80">
                      {ev.isHome ? "vs" : "@"} {ev.opponentName}
                    </span>
                    {ev.played ? (
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold tabular-nums ${
                          win
                            ? "bg-emerald-500/20 text-emerald-300"
                            : draw
                            ? "bg-white/10 text-white/60"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {ev.homeGoals}-{ev.awayGoals}
                      </span>
                    ) : ev.playable ? (
                      <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                        Listo
                      </Badge>
                    ) : (
                      <span className="shrink-0 text-[11px] text-white/35">
                        {realTimeUntil(ev.date)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
