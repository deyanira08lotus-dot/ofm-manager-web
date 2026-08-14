/**
 * src/pages/FamePage.tsx — Fama, afición, logros, récords y leyendas (FASE 9).
 */
import { useMemo, useState } from "react";
import { Award, Crown, Flame, Heart, Medal, Star, TrendingUp, Trophy, Users } from "lucide-react";
import { Badge, Bar, Card, EmptyState, Rating, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, num } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { POSITION_MAP } from "@/game/data/traits";
import {
  fameIndex, fameLabel, fanReport, recordList, TIER_STYLE, type Achievement,
} from "@/game/fame";
import { sortedTable } from "@/game/league";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "fama", label: "Fama", icon: <Star size={15} /> },
  { key: "aficion", label: "Afición", icon: <Heart size={15} /> },
  { key: "logros", label: "Logros", icon: <Award size={15} /> },
  { key: "records", label: "Récords", icon: <Medal size={15} /> },
  { key: "leyendas", label: "Leyendas", icon: <Crown size={15} /> },
] as const;

export default function FamePage() {
  const { club, players, league, fame, achievements } = useGame();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("fama");

  const position = useMemo(
    () => (league && club ? sortedTable(league).findIndex((r) => r.clubId === club.id) + 1 : 0),
    [league, club]
  );
  const report = useMemo(
    () => (club ? fanReport(club, players, position, league?.clubs.length ?? 12) : null),
    [club, players, position, league]
  );
  const famous = useMemo(
    () => [...players].sort((a, b) => fameIndex(b) - fameIndex(a)),
    [players]
  );
  const records = useMemo(() => (fame ? recordList(fame, league, players) : []), [fame, league, players]);

  if (!club || !fame || !report) {
    return <EmptyState icon={<Star />} title="Sección no disponible" text="Recarga la aplicación para inicializar el sistema de fama." />;
  }

  const unlocked = achievements.filter((a) => a.progress >= 1);
  const clubFame = Math.round(
    (club.reputation * 0.5 + (famous[0] ? fameIndex(famous[0]) * 0.3 : 0) + Math.min(100, club.fanbase.followers / 1200) * 0.2)
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Fama y legado</h1>
        <p className="text-sm text-white/45">
          Popularidad de tus jugadores, estado de la afición, logros del club, récords históricos y leyendas.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Fama del club" value={clubFame} sub={`Reputación ${Math.round(club.reputation)}`} icon={<Flame size={15} />} tone={clubFame >= 60 ? "good" : "default"} />
        <StatTile label="Seguidores" value={num(club.fanbase.followers)} sub={`Fidelidad ${Math.round(club.fanbase.loyalty)}%`} icon={<Users size={15} />} />
        <StatTile label="Logros" value={`${unlocked.length} / ${achievements.length}`} sub={`${Math.round((unlocked.length / Math.max(1, achievements.length)) * 100)}% completado`} icon={<Award size={15} />} tone="good" />
        <StatTile label="Leyendas" value={fame.legends.filter((l) => l.status === "leyenda").length} sub={`${fame.legends.length} nombres en el legado`} icon={<Crown size={15} />} />
      </div>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------- FAMA ------------------------- */}
      {tab === "fama" && (
        <div className="space-y-3">
          {famous.map((p) => {
            const idx = fameIndex(p);
            const label = fameLabel(idx);
            return (
              <button key={p.id} onClick={() => navigate(`/jugador/${p.id}`)}
                      className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/80 p-3.5 text-left hover:border-turf-500/40">
                <Rating value={p.overall} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{countryFlag(p.nationality)} {p.name}</p>
                  <p className="text-[11px] text-white/40">
                    {POSITION_MAP[p.position].short} · {p.age} años · <span className={label.tone}>{label.label}</span>
                  </p>
                </div>
                <div className="grid w-full grid-cols-3 gap-2 sm:w-64">
                  {([
                    ["Local", p.popularity.local],
                    ["Nacional", p.popularity.national],
                    ["Mundial", p.popularity.international],
                  ] as const).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[9px] uppercase text-white/30">{k}</p>
                      <Bar value={v} />
                      <p className="mt-0.5 text-[10px] font-semibold text-white/50">{Math.round(v)}</p>
                    </div>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-turf-300">{idx}</p>
                  <p className="text-[10px] uppercase text-white/30">Fama</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ------------------------ AFICIÓN ------------------------ */}
      {tab === "aficion" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Estado de la grada" subtitle={report.mood}>
            <div className="space-y-3">
              {([
                ["Satisfacción", club.fanbase.satisfaction],
                ["Fidelidad", club.fanbase.loyalty],
                ["Confianza de la directiva", club.board.confidence],
              ] as const).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/45">{k}</span>
                    <span className="font-semibold">{Math.round(v)}%</span>
                  </div>
                  <Bar value={v} />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {report.notes.map((n, i) => (
                <p key={i} className="flex gap-2 rounded-lg bg-white/4 px-3 py-2 text-xs text-white/55">
                  <span className="text-white/25">›</span>{n}
                </p>
              ))}
              <p className="rounded-lg bg-white/4 px-3 py-2 text-xs text-white/55">
                <span className="text-white/25">› </span>{report.ticketOpinion}
              </p>
            </div>
          </Card>

          <Card title="Ídolos de la afición" subtitle="Los jugadores más queridos por la grada">
            <div className="space-y-2.5">
              {report.favourites.map((f, i) => {
                const p = players.find((x) => x.id === f.playerId);
                return (
                  <div key={f.playerId} className="flex items-center gap-3 rounded-xl bg-rose-500/8 p-2.5">
                    <span className="text-lg">{["🥇", "🥈", "🥉"][i] ?? "⭐"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{f.name}</p>
                      <Bar value={f.fame} className="mt-1" />
                    </div>
                    {p && <span className="text-xs text-white/40">{POSITION_MAP[p.position].short}</span>}
                    <span className="text-sm font-bold text-rose-300">{f.fame}</span>
                  </div>
                );
              })}
              {report.favourites.length === 0 && (
                <p className="py-4 text-center text-sm text-white/40">Aún no hay ídolos: juega partidos para crear fama.</p>
              )}
            </div>
            <div className="mt-4 rounded-xl bg-white/4 p-3 text-xs text-white/50">
              <p className="font-semibold text-white/70">Expectativa de la temporada</p>
              <p className="mt-0.5">{club.fanbase.expectation}</p>
              <p className="mt-2 text-white/35">
                La masa social crece cuando la satisfacción supera el 50% y decrece si baja de ahí.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------- LOGROS ------------------------- */}
      {tab === "logros" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...achievements].sort((a, b) => Number(b.progress >= 1) - Number(a.progress >= 1) || b.progress - a.progress)
            .map((a: Achievement) => (
              <Card key={a.id} className={a.progress >= 1 ? "border-turf-500/40" : "opacity-90"}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${a.progress >= 1 ? "bg-turf-500/15" : "bg-white/5 grayscale"}`}>
                    {a.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{a.label}</p>
                      <Badge className={TIER_STYLE[a.tier]}>{a.tier}</Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/45">{a.desc}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Bar value={a.progress * 100} className="flex-1" />
                  <span className={`text-[11px] font-bold ${a.progress >= 1 ? "text-turf-300" : "text-white/40"}`}>
                    {a.progress >= 1 ? "✓" : `${Math.round(a.progress * 100)}%`}
                  </span>
                </div>
              </Card>
            ))}
        </div>
      )}

      {/* ------------------------ RÉCORDS ------------------------ */}
      {tab === "records" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {records.map((r) => (
            <Card key={r.key}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{r.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">{r.label}</p>
                  <p className="text-xl font-black">{r.value}</p>
                  <p className="truncate text-[11px] text-white/40">{r.detail}</p>
                </div>
              </div>
            </Card>
          ))}
          <Card className="md:col-span-2 xl:col-span-3">
            <p className="flex items-start gap-2 text-xs text-white/45">
              <TrendingUp size={14} className="mt-0.5 shrink-0 text-turf-300" />
              Los récords se actualizan automáticamente tras cada partido oficial y se conservan entre temporadas.
              Saldo máximo histórico: {money(fame.records.highestBalance)}.
            </p>
          </Card>
        </div>
      )}

      {/* ----------------------- LEYENDAS ----------------------- */}
      {tab === "leyendas" && (
        fame.legends.length === 0 ? (
          <EmptyState icon={<Crown />} title="Aún no hay leyendas"
                      text="Los jugadores entran en el legado del club acumulando goles, partidos, internacionalidades y fama." />
        ) : (
          <div className="space-y-3">
            {fame.legends.map((l, i) => {
              const p = players.find((x) => x.id === l.playerId);
              return (
                <button key={l.playerId} onClick={() => navigate(`/jugador/${l.playerId}`)}
                        className={`flex w-full flex-wrap items-center gap-3 rounded-2xl border p-3.5 text-left transition hover:border-turf-500/40 ${
                          l.status === "leyenda" ? "border-fuchsia-500/40 bg-fuchsia-500/8" :
                          l.status === "icono" ? "border-amber-500/35 bg-amber-500/8" : "border-white/8 bg-ink-850/80"}`}>
                  <span className="w-6 text-center text-sm font-black text-white/25">{i + 1}</span>
                  {p ? <Rating value={p.overall} size="lg" /> : <Trophy size={22} className="text-white/30" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold">{l.name}</p>
                      <Badge className={
                        l.status === "leyenda" ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300" :
                        l.status === "icono" ? "border-amber-500/40 bg-amber-500/15 text-amber-300" :
                        "border-white/15 bg-white/5 text-white/50"}>
                        {l.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-white/45">
                      {l.reasons.length ? l.reasons.join(" · ") : "En construcción"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-turf-300">{l.score}</p>
                    <p className="text-[10px] uppercase text-white/30">Legado</p>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
