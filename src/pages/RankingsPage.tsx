/**
 * src/pages/RankingsPage.tsx — Rankings globales (FASE 9).
 * Clubes, managers, goleadores, jugadores por valor y fama, y selecciones.
 */
import { useMemo, useState } from "react";
import { Coins, Crown, Globe2, Star, Target, Trophy, Users } from "lucide-react";
import { Badge, Bar, Card, EmptyState, Rating } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { POSITION_MAP } from "@/game/data/traits";
import { fameIndex } from "@/game/fame";
import { sortedTable } from "@/game/league";
import { worldRanking } from "@/game/national";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "clubes", label: "Clubes", icon: <Trophy size={15} /> },
  { key: "managers", label: "Managers", icon: <Users size={15} /> },
  { key: "goleadores", label: "Goleadores", icon: <Target size={15} /> },
  { key: "valor", label: "Valor", icon: <Coins size={15} /> },
  { key: "fama", label: "Fama", icon: <Star size={15} /> },
  { key: "selecciones", label: "Selecciones", icon: <Globe2 size={15} /> },
] as const;

export default function RankingsPage() {
  const { rankings, club, players, league, national, profile, fame } = useGame();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("clubes");

  const table = useMemo(() => (league ? sortedTable(league) : []), [league]);
  const nations = useMemo(() => worldRanking(national, club?.country ?? "ESP"), [national, club]);

  const scorers = useMemo(() => {
    if (!league) return [];
    return players
      .map((p) => ({ p, s: league.playerStats[p.id] }))
      .filter((x) => x.s && x.s.goals > 0)
      .sort((a, b) => b.s!.goals - a.s!.goals || b.s!.assists - a.s!.assists)
      .slice(0, 20);
  }, [league, players]);

  const byValue = useMemo(() => [...players].sort((a, b) => b.value - a.value).slice(0, 20), [players]);
  const byFame = useMemo(() => [...players].sort((a, b) => fameIndex(b) - fameIndex(a)).slice(0, 20), [players]);

  /** Ranking de managers: liga + reputación + logros */
  const managers = useMemo(() => {
    if (!league) return [];
    return table.map((row) => {
      const isUser = row.clubId === club?.id;
      const points = row.points * 3 + row.club.reputation + (isUser ? (fame?.unlocked.length ?? 0) * 4 : 0);
      return {
        clubId: row.clubId,
        name: isUser ? profile?.managerName ?? row.club.managerName : row.club.managerName,
        clubName: row.club.name,
        isUser,
        points,
        record: `${row.won}V ${row.drawn}E ${row.lost}D`,
        achievements: isUser ? fame?.unlocked.length ?? 0 : 0,
      };
    }).sort((a, b) => b.points - a.points);
  }, [table, club, profile, fame, league]);

  const pos = (i: number) => (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${
      i === 0 ? "bg-amber-500/25 text-amber-300" :
      i === 1 ? "bg-slate-400/25 text-slate-300" :
      i === 2 ? "bg-orange-500/20 text-orange-300" : "text-white/30"}`}>
      {i + 1}
    </span>
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Rankings globales</h1>
        <p className="text-sm text-white/45">Clasificaciones de clubes, managers, jugadores y selecciones.</p>
      </header>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------- CLUBES ------------------------- */}
      {tab === "clubes" && (
        <div className="space-y-5">
          <Card dense title="Liga actual" subtitle="Clasificación por puntos">
            {table.length === 0 ? (
              <p className="p-6 text-center text-sm text-white/40">La liga aún no ha comenzado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-2 py-3 text-left">Club</th>
                    <th className="px-2 py-3 text-center">PJ</th>
                    <th className="px-2 py-3 text-center">DG</th>
                    <th className="px-2 py-3 text-center">Nivel</th>
                    <th className="px-4 py-3 text-center">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r, i) => (
                    <tr key={r.clubId} className={`border-b border-white/4 ${r.clubId === club?.id ? "bg-turf-500/10" : ""}`}>
                      <td className="px-4 py-2">{pos(i)}</td>
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.club.colors.primary }} />
                          <span className="truncate font-medium">{r.club.name}</span>
                          {r.club.isUser && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tú</Badge>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center text-white/55">{r.played}</td>
                      <td className="px-2 py-2 text-center text-white/55">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td>
                      <td className="px-2 py-2 text-center text-white/45">{r.club.rating}</td>
                      <td className="px-4 py-2 text-center font-black">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {rankings.length > 0 && (
            <Card dense title="Ranking mundial de clubes" subtitle="Por reputación">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-2 py-3 text-left">Club</th>
                    <th className="px-2 py-3 text-left">Manager</th>
                    <th className="px-2 py-3 text-center">Rep.</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => (
                    <tr key={r.clubId} className={`border-b border-white/4 ${r.clubId === club?.id ? "bg-turf-500/10" : ""}`}>
                      <td className="px-4 py-2">{pos(i)}</td>
                      <td className="px-2 py-2 font-medium">{countryFlag(r.country)} {r.name}</td>
                      <td className="px-2 py-2 text-white/55">{r.managerName}</td>
                      <td className="px-2 py-2 text-center font-bold text-turf-300">{Math.round(r.reputation)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-white/60">{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* ------------------------ MANAGERS ------------------------ */}
      {tab === "managers" && (
        managers.length === 0 ? (
          <EmptyState icon={<Users />} title="Sin datos de managers" text="Juega partidos de liga para generar la clasificación." />
        ) : (
          <Card dense>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-2 py-3 text-left">Manager</th>
                  <th className="px-2 py-3 text-left">Club</th>
                  <th className="px-2 py-3 text-center">Balance</th>
                  <th className="px-2 py-3 text-center">Logros</th>
                  <th className="px-4 py-3 text-center">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m, i) => (
                  <tr key={m.clubId} className={`border-b border-white/4 ${m.isUser ? "bg-turf-500/10" : ""}`}>
                    <td className="px-4 py-2">{pos(i)}</td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        {m.isUser && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tú</Badge>}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-white/55">{m.clubName}</td>
                    <td className="px-2 py-2 text-center text-white/55">{m.record}</td>
                    <td className="px-2 py-2 text-center">{m.achievements || "—"}</td>
                    <td className="px-4 py-2 text-center font-black text-turf-300">{Math.round(m.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* ----------------------- GOLEADORES ----------------------- */}
      {tab === "goleadores" && (
        scorers.length === 0 ? (
          <EmptyState icon={<Target />} title="Sin goles todavía" text="Disputa partidos de liga para llenar la tabla de goleadores." />
        ) : (
          <Card dense>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-2 py-3 text-left">Jugador</th>
                  <th className="px-2 py-3 text-center">PJ</th>
                  <th className="px-2 py-3 text-center">Goles</th>
                  <th className="px-2 py-3 text-center">Asist.</th>
                  <th className="px-4 py-3 text-center">Media</th>
                </tr>
              </thead>
              <tbody>
                {scorers.map(({ p, s }, i) => (
                  <tr key={p.id} className="cursor-pointer border-b border-white/4 hover:bg-white/4" onClick={() => navigate(`/jugador/${p.id}`)}>
                    <td className="px-4 py-2">{pos(i)}</td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <Rating value={p.overall} size="sm" />
                        <span className="truncate font-medium">{countryFlag(p.nationality)} {p.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-white/55">{s!.apps}</td>
                    <td className="px-2 py-2 text-center font-black text-turf-300">{s!.goals}</td>
                    <td className="px-2 py-2 text-center text-white/60">{s!.assists}</td>
                    <td className="px-4 py-2 text-center font-semibold">{(s!.ratingSum / Math.max(1, s!.apps)).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* ------------------------- VALOR ------------------------- */}
      {tab === "valor" && (
        <div className="space-y-2">
          {byValue.map((p, i) => (
            <button key={p.id} onClick={() => navigate(`/jugador/${p.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/80 p-3 text-left hover:border-turf-500/40">
              {pos(i)}
              <Rating value={p.overall} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{countryFlag(p.nationality)} {p.name}</p>
                <p className="text-[11px] text-white/40">{POSITION_MAP[p.position].label} · {p.age} años · Pot. {p.potential}</p>
              </div>
              <span className="font-bold tabular-nums text-emerald-300">{money(p.value)}</span>
            </button>
          ))}
        </div>
      )}

      {/* -------------------------- FAMA -------------------------- */}
      {tab === "fama" && (
        <div className="space-y-2">
          {byFame.map((p, i) => (
            <button key={p.id} onClick={() => navigate(`/jugador/${p.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/80 p-3 text-left hover:border-turf-500/40">
              {pos(i)}
              <Rating value={p.overall} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{countryFlag(p.nationality)} {p.name}</p>
                <Bar value={fameIndex(p)} className="mt-1" />
              </div>
              <span className="flex items-center gap-1 font-bold text-fuchsia-300">
                <Crown size={13} /> {fameIndex(p)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ---------------------- SELECCIONES ---------------------- */}
      {tab === "selecciones" && (
        <Card dense>
          <ul className="divide-y divide-white/5">
            {nations.map((n, i) => (
              <li key={n.code} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${n.code === club?.country ? "bg-turf-500/10" : ""}`}>
                {pos(i)}
                <span className="text-lg">{n.flag}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{n.name}</span>
                <span className={`text-xs ${n.trend > 0 ? "text-emerald-300" : n.trend < 0 ? "text-rose-300" : "text-white/30"}`}>
                  {n.trend > 0 ? `▲${n.trend}` : n.trend < 0 ? `▼${Math.abs(n.trend)}` : "—"}
                </span>
                <span className="font-bold tabular-nums">{n.points}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
