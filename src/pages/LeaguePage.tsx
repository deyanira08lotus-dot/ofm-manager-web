/**
 * src/pages/LeaguePage.tsx — clasificación, calendario, próximo partido y goleadores.
 */
import { useMemo, useState } from "react";
import { CalendarDays, Loader2, Play, Radio, Swords, Timer, Trophy } from "lucide-react";
import { Badge, Button, Card, EmptyState, Rating } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { clubOf, isPlayable, nextFixture, sortedTable, userFixtures } from "@/game/league";
import { formatGameDate, realTimeUntil } from "@/game/time";
import { navigate } from "@/lib/router";

export default function LeaguePage() {
  const { league, club, players, playMatch, playFriendlyMatch, startLiveMatch, simulating, matches } = useGame();
  const [tab, setTab] = useState<"clasificacion" | "calendario" | "resultados" | "goleadores">("clasificacion");

  const table = useMemo(() => (league ? sortedTable(league) : []), [league]);
  const next = useMemo(() => (league ? nextFixture(league) : null), [league]);
  const fixtures = useMemo(() => (league ? userFixtures(league) : []), [league]);

  const scorers = useMemo(() => {
    if (!league) return [];
    return players
      .map((p) => ({ p, s: league.playerStats[p.id] }))
      .filter((x) => x.s && (x.s.goals > 0 || x.s.assists > 0))
      .sort((a, b) => (b.s!.goals - a.s!.goals) || (b.s!.assists - a.s!.assists))
      .slice(0, 12);
  }, [league, players]);

  if (!league || !club) {
    return <EmptyState icon={<Trophy />} title="Liga no disponible" text="Vuelve a cargar la aplicación para generar tu competición." />;
  }

  const rival = next ? clubOf(league, next.homeId === club.id ? next.awayId : next.homeId) : null;
  const playable = next ? isPlayable(next) : false;
  const myRow = table.findIndex((r) => r.clubId === club.id) + 1;

  async function play() {
    const res = await playMatch();
    if (res) navigate("/partido");
  }
  async function friendly() {
    const res = await playFriendlyMatch();
    if (res) navigate("/partido");
  }
  async function direct() {
    const err = await startLiveMatch();
    if (!err) navigate("/directo");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{league.name}</h1>
          <p className="text-sm text-white/45">
            Temporada {league.seasonId} · {league.clubs.length} equipos · Posición actual {myRow}º
          </p>
        </div>
      </header>

      {/* Próximo partido */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                 style={{ background: `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})` }}>
              {club.shortName}
            </div>
            <div className="text-center text-xs uppercase tracking-widest text-white/35">vs</div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                 style={{ background: rival ? `linear-gradient(135deg, ${rival.colors.primary}, ${rival.colors.secondary})` : "#1c2836" }}>
              {rival?.shortName ?? "—"}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold">{rival?.name ?? "Temporada finalizada"}</p>
              <p className="text-xs text-white/45">
                {next ? `Jornada ${next.round} · ${next.homeId === club.id ? "Local" : "Visitante"} · ${formatGameDate(next.date)}` : "No quedan partidos por jugar"}
                {rival && ` · Nivel rival ${rival.rating}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={friendly} disabled={simulating}>
              <Swords size={15} /> Amistoso
            </Button>
            <Button variant="outline" onClick={direct} disabled={!next || !playable || simulating}>
              <Radio size={15} /> Dirigir en directo
            </Button>
            <Button onClick={play} disabled={!next || !playable || simulating} size="lg">
              {simulating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {playable ? "Simular partido" : next ? `Disponible en ${realTimeUntil(next.date)}` : "Sin partidos"}
            </Button>
          </div>
        </div>
        {!playable && next && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/4 px-3 py-2 text-xs text-white/45">
            <Timer size={13} /> El calendario avanza en tiempo real (1 día real = 3 días de juego). Mientras esperas puedes
            disputar amistosos, ajustar la alineación o el entrenamiento.
          </p>
        )}
      </Card>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {([
          ["clasificacion", "Clasificación"],
          ["calendario", "Calendario"],
          ["resultados", "Resultados"],
          ["goleadores", "Goleadores"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === k ? "bg-turf-500 text-ink-950" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "clasificacion" && (
        <Card dense>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                  <th className="px-3 py-3 text-left">#</th>
                  <th className="px-2 py-3 text-left">Equipo</th>
                  <th className="px-2 py-3 text-center">PJ</th>
                  <th className="px-2 py-3 text-center">G</th>
                  <th className="px-2 py-3 text-center">E</th>
                  <th className="px-2 py-3 text-center">P</th>
                  <th className="hidden px-2 py-3 text-center sm:table-cell">GF</th>
                  <th className="hidden px-2 py-3 text-center sm:table-cell">GC</th>
                  <th className="px-2 py-3 text-center">DG</th>
                  <th className="px-2 py-3 text-center font-bold">Pts</th>
                  <th className="hidden px-3 py-3 text-left md:table-cell">Racha</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.clubId} className={`border-b border-white/4 ${r.clubId === club.id ? "bg-turf-500/10" : ""}`}>
                    <td className="px-3 py-2">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                        i < 2 ? "bg-emerald-500/20 text-emerald-300" : i < 6 ? "bg-sky-500/15 text-sky-300" : i >= table.length - 2 ? "bg-rose-500/15 text-rose-300" : "text-white/35"}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.club.colors.primary }} />
                        <span className="truncate font-medium">{r.club.name}</span>
                        {r.club.isUser && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tú</Badge>}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-white/60">{r.played}</td>
                    <td className="px-2 py-2 text-center text-white/60">{r.won}</td>
                    <td className="px-2 py-2 text-center text-white/60">{r.drawn}</td>
                    <td className="px-2 py-2 text-center text-white/60">{r.lost}</td>
                    <td className="hidden px-2 py-2 text-center text-white/45 sm:table-cell">{r.gf}</td>
                    <td className="hidden px-2 py-2 text-center text-white/45 sm:table-cell">{r.ga}</td>
                    <td className="px-2 py-2 text-center text-white/60">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td>
                    <td className="px-2 py-2 text-center font-black">{r.points}</td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      <span className="flex gap-1">
                        {r.form.map((f, j) => (
                          <span key={j} className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${
                            f === "V" ? "bg-emerald-500/25 text-emerald-300" : f === "E" ? "bg-white/10 text-white/50" : "bg-rose-500/20 text-rose-300"}`}>
                            {f}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/6 px-4 py-2.5 text-[11px] text-white/35">
            🟢 Ascenso directo · 🔵 Play-off · 🔴 Descenso (se aplicarán al cerrar la temporada)
          </p>
        </Card>
      )}

      {tab === "calendario" && (
        <Card dense>
          <ul className="divide-y divide-white/5">
            {fixtures.map((f) => {
              const home = clubOf(league, f.homeId);
              const away = clubOf(league, f.awayId);
              const win = f.played && ((f.homeId === club.id && (f.homeGoals ?? 0) > (f.awayGoals ?? 0)) || (f.awayId === club.id && (f.awayGoals ?? 0) > (f.homeGoals ?? 0)));
              const draw = f.played && f.homeGoals === f.awayGoals;
              return (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-8 shrink-0 text-[11px] text-white/30">J{f.round}</span>
                  <span className="hidden w-24 shrink-0 text-[11px] text-white/35 sm:block">{formatGameDate(f.date)}</span>
                  <span className={`min-w-0 flex-1 truncate text-right ${f.homeId === club.id ? "font-semibold" : "text-white/60"}`}>{home?.name}</span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold tabular-nums ${
                    !f.played ? "bg-white/6 text-white/40" : win ? "bg-emerald-500/20 text-emerald-300" : draw ? "bg-white/10 text-white/60" : "bg-rose-500/20 text-rose-300"}`}>
                    {f.played ? `${f.homeGoals}-${f.awayGoals}` : "vs"}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${f.awayId === club.id ? "font-semibold" : "text-white/60"}`}>{away?.name}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === "resultados" && (
        <div className="space-y-3">
          {matches.length === 0 && (
            <EmptyState icon={<CalendarDays />} title="Todavía no has disputado ningún partido" text="Juega tu primera jornada o un amistoso para ver aquí los informes completos." />
          )}
          {matches.map((m) => {
            const us = m.userSide === "home" ? m.home : m.away;
            const them = m.userSide === "home" ? m.away : m.home;
            const win = us.goals > them.goals;
            const draw = us.goals === them.goals;
            return (
              <button key={m.id} onClick={() => navigate(`/partido/${m.id}`)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-white/8 bg-ink-850/70 p-3.5 text-left hover:border-turf-500/40">
                <div className={`flex h-12 w-16 items-center justify-center rounded-xl text-lg font-black tabular-nums ${
                  win ? "bg-emerald-500/15 text-emerald-300" : draw ? "bg-white/8 text-white/70" : "bg-rose-500/15 text-rose-300"}`}>
                  {m.home.goals}-{m.away.goals}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.home.name} vs {m.away.name}</p>
                  <p className="truncate text-[11px] text-white/40">{m.competition} · {formatGameDate(m.date)}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">MVP</p>
                  <p className="text-xs font-semibold">{m.motm?.name ?? "—"}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === "goleadores" && (
        <Card dense>
          {scorers.length === 0 ? (
            <p className="p-6 text-center text-sm text-white/40">Aún no hay estadísticas: juega tu primera jornada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                  <th className="px-4 py-3 text-left">Jugador</th>
                  <th className="px-2 py-3 text-center">PJ</th>
                  <th className="px-2 py-3 text-center">Goles</th>
                  <th className="px-2 py-3 text-center">Asist.</th>
                  <th className="px-2 py-3 text-center">Min.</th>
                  <th className="px-4 py-3 text-center">Media</th>
                </tr>
              </thead>
              <tbody>
                {scorers.map(({ p, s }) => (
                  <tr key={p.id} className="cursor-pointer border-b border-white/4 hover:bg-white/4" onClick={() => navigate(`/jugador/${p.id}`)}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <Rating value={p.overall} size="sm" />
                        <span className="truncate font-medium">{p.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-white/60">{s!.apps}</td>
                    <td className="px-2 py-2 text-center font-bold text-turf-300">{s!.goals}</td>
                    <td className="px-2 py-2 text-center text-white/70">{s!.assists}</td>
                    <td className="px-2 py-2 text-center text-white/45">{s!.minutes}'</td>
                    <td className="px-4 py-2 text-center font-semibold">{(s!.ratingSum / Math.max(1, s!.apps)).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
