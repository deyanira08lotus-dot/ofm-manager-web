/**
 * src/pages/CalendarPage.tsx — Calendario unificado: próximos partidos de
 * liga, copas y acceso rápido al amistoso.
 */
import { CalendarDays } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { userFixtures, isPlayable } from "@/game/league";
import { worldMember } from "@/game/multiplayer";
import {
  userTie,
  cupTeam,
  cupPlayable,
  roundName,
  CUP_ICON,
  CUP_STYLE,
  type CupKind,
} from "@/game/cups";
import { formatGameDate, realTimeUntil } from "@/game/time";
import { navigate } from "@/lib/router";

const CUP_KINDS: CupKind[] = ["nacional", "supercopa", "internacional"];

type CalItem = {
  id: string;
  date: string;
  playable: boolean;
  isHome: boolean;
  opponentName: string;
  label: string;
  badgeClass: string;
  onClick: () => void;
};

export default function CalendarPage() {
  const { club, world, competitions } = useGame();

  if (!club) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="Calendario no disponible"
        text="Recarga la aplicación para ver tu calendario."
      />
    );
  }

  const items: CalItem[] = [];

  if (world) {
    const upcoming = userFixtures(world).filter((f) => !f.played);
    for (const f of upcoming) {
      const isHome = f.homeId === club.id;
      const opponentId = isHome ? f.awayId : f.homeId;
      const opponent = worldMember(world, opponentId);
      items.push({
        id: f.id,
        date: f.date,
        playable: isPlayable(f),
        isHome,
        opponentName: opponent?.name ?? "Rival desconocido",
        label: "Liga",
        badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-300",
        onClick: () => navigate("/liga"),
      });
    }
  }

  if (competitions) {
    for (const kind of CUP_KINDS) {
      const cup = competitions[kind];
      if (!cup) continue;
      const tie = userTie(cup, club.id);
      if (!tie) continue;
      const isHome = tie.homeId === club.id;
      const opponentId = isHome ? tie.awayId : tie.homeId;
      const opponent = cupTeam(cup, opponentId);
      items.push({
        id: tie.id,
        date: tie.date,
        playable: cupPlayable(cup, club.id),
        isHome,
        opponentName: opponent?.name ?? "Rival desconocido",
        label: `${CUP_ICON[kind]} ${roundName(tie.round, cup.totalRounds)}`,
        badgeClass: CUP_STYLE[kind],
        onClick: () => navigate("/copas"),
      });
    }
  }

  items.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white/90">Calendario</h1>
        <p className="text-sm text-white/50">
          Todos tus próximos partidos de liga y copas, en un solo lugar.
        </p>
      </div>

      <Card
        dense
        title="Amistoso"
        subtitle="Jugá un partido instantáneo contra un rival"
        action={
          <button
            onClick={() => navigate("/liga")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80"
          >
            Ir a jugar
          </button>
        }
      />

      {items.length === 0 && (
        <EmptyState
          icon={<CalendarDays />}
          title="No tenés partidos pendientes"
          text="Cuando arranquen nuevas jornadas de liga o rondas de copa, van a aparecer aquí."
        />
      )}

      {items.length > 0 && (
        <Card dense>
          <ul className="divide-y divide-white/5">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={it.onClick}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
                >
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${it.badgeClass}`}
                  >
                    {it.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/80">
                    {it.isHome ? "vs" : "@"} {it.opponentName}
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-white/40 sm:block">
                    {formatGameDate(it.date)}
                  </span>
                  {it.playable ? (
                    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                      Listo
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-[11px] text-white/35">
                      {realTimeUntil(it.date)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
