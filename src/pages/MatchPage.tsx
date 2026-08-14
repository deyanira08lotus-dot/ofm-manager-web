/**
 * src/pages/MatchPage.tsx — visor de partido en vivo + informe completo.
 * El resultado ya está calculado por el simulador; aquí se revela minuto a minuto.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FastForward, Pause, Play, Star, Trophy } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { formatGameDate } from "@/game/time";
import { navigate } from "@/lib/router";
import type { MatchEvent, MatchResult, MatchSideResult } from "@/game/match";
import { POSITION_MAP } from "@/game/data/traits";

const EVENT_ICON: Record<MatchEvent["type"], string> = {
  goal: "⚽", save: "🧤", miss: "😖", card: "🟨", sub: "🔄", injury: "🚑", info: "📣",
};

function StatRow({ label, home, away, invert }: { label: string; home: number; away: number; invert?: boolean }) {
  const total = home + away || 1;
  const hp = (home / total) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold tabular-nums">{home}</span>
        <span className="text-white/40">{label}</span>
        <span className="font-semibold tabular-nums">{away}</span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className={invert ? "bg-rose-400/70" : "bg-turf-500"} style={{ width: `${hp}%` }} />
        <div className={invert ? "bg-rose-300/40" : "bg-sky-500/70"} style={{ width: `${100 - hp}%` }} />
      </div>
    </div>
  );
}

function LineupTable({ side }: { side: MatchSideResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8 text-[10px] uppercase tracking-wider text-white/35">
            <th className="px-3 py-2 text-left">Jugador</th>
            <th className="px-2 py-2 text-center">Pos</th>
            <th className="px-2 py-2 text-center">Min</th>
            <th className="px-2 py-2 text-center">G</th>
            <th className="px-2 py-2 text-center">A</th>
            <th className="px-3 py-2 text-center">Nota</th>
          </tr>
        </thead>
        <tbody>
          {side.lineup.map((l) => (
            <tr key={l.playerId} className="border-b border-white/4">
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-1.5">
                  {!l.started && <span className="text-[9px] text-white/30">S</span>}
                  <span className="truncate">{l.name}</span>
                  {l.goals > 0 && <span>{"⚽".repeat(Math.min(3, l.goals))}</span>}
                  {l.yellow > 0 && <span>🟨</span>}
                  {l.red > 0 && <span>🟥</span>}
                </span>
              </td>
              <td className="px-2 py-1.5 text-center text-[11px] text-white/45">{POSITION_MAP[l.position]?.short ?? l.position}</td>
              <td className="px-2 py-1.5 text-center text-white/45">{l.minutes}'</td>
              <td className="px-2 py-1.5 text-center">{l.goals || "-"}</td>
              <td className="px-2 py-1.5 text-center">{l.assists || "-"}</td>
              <td className="px-3 py-1.5 text-center">
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                  l.rating >= 8 ? "bg-fuchsia-500/20 text-fuchsia-300" :
                  l.rating >= 7 ? "bg-emerald-500/20 text-emerald-300" :
                  l.rating >= 6 ? "bg-white/8 text-white/70" : "bg-rose-500/20 text-rose-300"}`}>
                  {l.rating.toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchPage({ matchId }: { matchId?: string }) {
  const { matches, lastMatch } = useGame();
  const match: MatchResult | null = useMemo(
    () => (matchId ? matches.find((m) => m.id === matchId) ?? null : lastMatch),
    [matchId, matches, lastMatch]
  );

  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tab, setTab] = useState<"local" | "visitante">("local");
  const timer = useRef<number | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMinute(0);
    setPlaying(true);
  }, [match?.id]);

  useEffect(() => {
    if (!match || !playing) return;
    if (minute >= 90) { setPlaying(false); return; }
    timer.current = window.setTimeout(() => setMinute((m) => Math.min(90, m + 1)), 55);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [match, playing, minute]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [minute]);

  if (!match) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="No hay ningún partido para mostrar"
        text="Juega una jornada desde la sección Liga para ver el partido en directo."
        action={<Button className="mt-3" onClick={() => navigate("/liga")}>Ir a la Liga</Button>}
      />
    );
  }

  const shown = match.events.filter((e) => e.minute <= minute);
  const score = shown.length ? shown[shown.length - 1].score : [0, 0];
  const finished = minute >= 90;
  const homeGoals = finished ? match.home.goals : score[0];
  const awayGoals = finished ? match.away.goals : score[1];

  return (
    <div className="space-y-5">
      <button onClick={() => navigate("/liga")} className="flex items-center gap-1.5 text-sm text-white/45 hover:text-white">
        <ArrowLeft size={15} /> Liga
      </button>

      {/* Marcador */}
      <div className="overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-ink-850 to-ink-900/80 shadow-[0_6px_18px_-12px_rgba(22,32,46,0.3)]">
        <div className="px-4 py-3 text-center text-[11px] uppercase tracking-widest text-white/35">
          {match.competition} · {formatGameDate(match.date)}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-4">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                 style={{ background: `linear-gradient(135deg, ${match.home.colors.primary}, ${match.home.colors.secondary})` }}>
              {match.home.short}
            </div>
            <p className="text-center text-xs font-semibold sm:text-sm">{match.home.name}</p>
            {match.home.isUser && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tu club</Badge>}
          </div>
          <div className="text-center">
            <p className="text-4xl font-black tabular-nums sm:text-5xl">{homeGoals} - {awayGoals}</p>
            <p className="mt-1 text-sm font-semibold text-turf-300">{finished ? "FINAL" : `${minute}'`}</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                 style={{ background: `linear-gradient(135deg, ${match.away.colors.primary}, ${match.away.colors.secondary})` }}>
              {match.away.short}
            </div>
            <p className="text-center text-xs font-semibold sm:text-sm">{match.away.name}</p>
            {match.away.isUser && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tu club</Badge>}
          </div>
        </div>
        <div className="h-1 w-full bg-white/6">
          <div className="h-full bg-turf-500 transition-all" style={{ width: `${(minute / 90) * 100}%` }} />
        </div>
        <div className="flex items-center justify-center gap-2 p-3">
          <Button variant="outline" size="sm" onClick={() => setPlaying((p) => !p)} disabled={finished}>
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pausar" : "Reanudar"}
          </Button>
          <Button variant="subtle" size="sm" onClick={() => { setPlaying(false); setMinute(90); }}>
            <FastForward size={14} /> Ver resultado
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* Narración */}
        <Card title="Narración en directo" subtitle={`${shown.length} eventos`}>
          <div ref={feedRef} className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {[...shown].reverse().map((e, i) => (
              <div key={i} className={`fm-fade flex gap-3 rounded-xl border p-2.5 ${
                e.type === "goal" ? "border-turf-500/40 bg-turf-500/10" :
                e.type === "card" ? "border-amber-500/25 bg-amber-500/8" :
                e.type === "injury" ? "border-rose-500/25 bg-rose-500/8" : "border-white/6 bg-ink-900/50"}`}>
                <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-white/40">{e.minute}'</span>
                <span>{EVENT_ICON[e.type]}</span>
                <p className="min-w-0 flex-1 text-sm text-white/70">{e.text}</p>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/35">{e.score[0]}-{e.score[1]}</span>
              </div>
            ))}
            {!shown.length && <p className="py-8 text-center text-sm text-white/35">El partido está a punto de comenzar...</p>}
          </div>
        </Card>

        {/* Estadísticas */}
        <div className="space-y-5">
          <Card title="Estadísticas del partido">
            <div className="space-y-3">
              <StatRow label="Posesión %" home={match.home.stats.possession} away={match.away.stats.possession} />
              <StatRow label="Remates" home={match.home.stats.shots} away={match.away.stats.shots} />
              <StatRow label="A puerta" home={match.home.stats.onTarget} away={match.away.stats.onTarget} />
              <StatRow label="xG" home={match.home.stats.xg} away={match.away.stats.xg} />
              <StatRow label="Córners" home={match.home.stats.corners} away={match.away.stats.corners} />
              <StatRow label="Faltas" home={match.home.stats.fouls} away={match.away.stats.fouls} invert />
              <StatRow label="Tarjetas" home={match.home.stats.yellow + match.home.stats.red} away={match.away.stats.yellow + match.away.stats.red} invert />
            </div>
          </Card>

          {finished && match.motm && (
            <Card title="Jugador del partido">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
                  <Star size={22} />
                </div>
                <div>
                  <p className="font-bold">{match.motm.name}</p>
                  <p className="text-xs text-white/45">
                    Nota {match.motm.rating.toFixed(1)} · {match.motm.side === "home" ? match.home.name : match.away.name}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Valoraciones */}
      <Card dense title="Valoraciones"
            action={
              <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
                {([["local", match.home.short], ["visitante", match.away.short]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)}
                          className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === k ? "bg-turf-500 text-ink-950" : "text-white/50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            }>
        <LineupTable side={tab === "local" ? match.home : match.away} />
      </Card>
    </div>
  );
}
