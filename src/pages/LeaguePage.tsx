/**
 * src/pages/LeaguePage.tsx — Liga Mundial compartida, resultados y traspasos.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft, CalendarDays, Check, Globe2, Inbox, Loader2, Play, Radio,
  Send, Swords, Timer, Trophy, Users, X,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Input, Modal, Rating, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { backend, isLocalMode } from "@/services/backend";
import { money } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { POSITION_MAP } from "@/game/data/traits";
import {
  humanCount, nextWorldFixture, OFFER_STATUS_STYLE, worldMember, worldStandings,
} from "@/game/multiplayer";
import { formatGameDate, gameNow, realTimeUntil } from "@/game/time";
import type { Player } from "@/types";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "clasificacion", label: "Clasificación", icon: <Trophy size={15} /> },
  { key: "calendario", label: "Calendario", icon: <CalendarDays size={15} /> },
  { key: "resultados", label: "Resultados", icon: <Radio size={15} /> },
  { key: "goleadores", label: "Goleadores", icon: <Users size={15} /> },
  { key: "managers", label: "Managers", icon: <Globe2 size={15} /> },
  { key: "ofertas", label: "Ofertas", icon: <Inbox size={15} /> },
] as const;

type Scorer = {
  player: Player;
  apps: number;
  goals: number;
  assists: number;
  minutes: number;
  ratingSum: number;
};

export default function LeaguePage() {
  const {
    club, players, world, inWorld, offersIn, offersOut, simulating, matches, rankings,
    playWorldMatch, playFriendlyMatch, startLiveMatch, kickoffWorld,
    makeUserOffer, respondUserOffer, refreshOffers,
  } = useGame();

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("clasificacion");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [target, setTarget] = useState<{ clubId: string; clubName: string; uid: string } | null>(null);
  const [squad, setSquad] = useState<Player[]>([]);
  const [pick, setPick] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");

  const standings = useMemo(() => (world ? worldStandings(world) : []), [world]);
  const next = useMemo(() => (world && club ? nextWorldFixture(world, club.id) : null), [world, club]);
  const fixtures = world?.fixtures ?? [];
  const rivals = useMemo(() => rankings.filter((r) => r.clubId !== club?.id), [rankings, club]);
  const pendingIn = offersIn.filter((o) => o.status === "pendiente");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const scorers = useMemo(() => {
    const totals = new Map<string, Scorer>();
    matches.forEach((m) => {
      if (!m.userSide) return;
      const own = m.userSide === "home" ? m.home : m.away;
      own.lineup.forEach((line) => {
        const player = byId.get(line.playerId);
        if (!player) return;
        const current = totals.get(line.playerId) ?? {
          player, apps: 0, goals: 0, assists: 0, minutes: 0, ratingSum: 0,
        };
        current.apps += line.minutes > 0 ? 1 : 0;
        current.goals += line.goals;
        current.assists += line.assists;
        current.minutes += line.minutes;
        current.ratingSum += line.rating;
        totals.set(line.playerId, current);
      });
    });
    return [...totals.values()]
      .filter((s) => s.goals > 0 || s.assists > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.ratingSum - a.ratingSum)
      .slice(0, 12);
  }, [matches, byId]);

  // Cargar la plantilla del club objetivo al abrir el modal de oferta.
  useEffect(() => {
    if (!target) return;
    setSquad([]);
    setPick("");
    backend.getPlayers(target.clubId).then((list) => {
      const sorted = list.sort((a, b) => b.overall - a.overall);
      setSquad(sorted);
      if (sorted[0]) {
        setPick(sorted[0].id);
        setAmount(Math.round(sorted[0].value * 1.15));
      }
    }).catch(() => {});
  }, [target]);

  if (!club || !world) {
    return <EmptyState icon={<Globe2 />} title="Liga no disponible" text="Recarga la aplicación para conectar con la Liga Mundial." />;
  }

  const rival = next ? worldMember(world, next.homeId === club.id ? next.awayId : next.homeId) : null;
  const playable = true; // TEMP: bypass para testear MatchPitch, revertir después
  const myRow = standings.findIndex((r) => r.clubId === club.id) + 1;
  const selected = squad.find((p) => p.id === pick);

  async function run(key: string, fn: () => Promise<string | null | void>, okText: string) {
    setBusy(key);
    setMsg(null);
    try {
      const err = await fn();
      setMsg(err ? { text: err as string, ok: false } : { text: okText, ok: true });
    } finally {
      setBusy(null);
    }
  }

  async function play() {
    const err = await playWorldMatch();
    if (!err) navigate("/partido");
  }

  async function friendly() {
    const result = await playFriendlyMatch();
    if (result) navigate("/partido");
  }

  async function direct() {
    const err = await startLiveMatch();
    if (!err) navigate("/directo");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{world.name}</h1>
          <p className="text-sm text-white/45">
            Temporada {world.seasonId} · {world.members.length} equipos · Posición actual {myRow || "—"}º
          </p>
        </div>
        <Button variant="outline" onClick={() => refreshOffers()}>
          <ArrowRightLeft size={15} /> Actualizar
        </Button>
      </header>

      {isLocalMode && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700">
          <b>Modo local:</b> la Liga Mundial funciona, pero solo verás a los managers registrados en este navegador.
          Conecta Firebase (pestaña Ajustes) para jugar contra usuarios de todo el mundo.
        </p>
      )}

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Liga" value={world.name.split("·")[1]?.trim() ?? "División"} sub={world.name.split("·")[0]?.trim()} icon={<Globe2 size={15} />} />
        <StatTile label="Managers reales" value={`${humanCount(world)} / ${world.capacity}`}
                  sub={`${world.capacity - humanCount(world)} plazas con IA`} icon={<Users size={15} />}
                  tone={humanCount(world) > 1 ? "good" : "default"} />
        <StatTile label="Estado" value={world.status === "abierta" ? "Inscripciones" : world.status === "en_juego" ? "En juego" : "Finalizada"}
                  sub={world.status === "en_juego" ? `Jornada ${world.round}` : `Temporada ${world.seasonId}`} />
        <StatTile label="Ofertas pendientes" value={pendingIn.length} sub={`${offersOut.length} enviada(s)`}
                  icon={<Inbox size={15} />} tone={pendingIn.length ? "warn" : "default"} />
      </div>

      {/* Próximo partido: la liga jugable es la Liga Mundial compartida. */}
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
              <p className="truncate font-bold">{rival?.name ?? (world.status === "finalizada" ? "Temporada finalizada" : "Sin rival")}</p>
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
            {world.status === "abierta" && (
              <Button variant="outline" disabled={busy === "kick"} onClick={() => run("kick", kickoffWorld, "Calendario sorteado: ¡que empiece la Liga Mundial!")}>
                {busy === "kick" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Sortear calendario
              </Button>
            )}
            <Button onClick={play} disabled={!next || !playable || simulating || world.status !== "en_juego"} size="lg">
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
        {!inWorld && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Tu club está pendiente de incorporarse a esta edición de la Liga Mundial.
          </p>
        )}
      </Card>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-ink-950" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
            {t.key === "ofertas" && pendingIn.length > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-[#fff]">{pendingIn.length}</span>
            )}
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
                  <th className="px-2 py-3 text-left">Club</th>
                  <th className="px-2 py-3 text-left">Manager</th>
                  <th className="px-2 py-3 text-center">PJ</th>
                  <th className="px-2 py-3 text-center">DG</th>
                  <th className="px-4 py-3 text-center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r, i) => (
                  <tr key={r.clubId} className={`border-b border-white/4 ${r.clubId === club.id ? "bg-turf-500/10" : ""}`}>
                    <td className="px-3 py-2">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                        i < 2 ? "bg-emerald-500/20 text-emerald-300" : i >= standings.length - 2 ? "bg-rose-500/15 text-rose-300" : "text-white/30"}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.member.colors.primary }} />
                        <span className="truncate font-medium">{r.member.name}</span>
                        {r.clubId === club.id && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tú</Badge>}
                        {!r.member.isAi && r.clubId !== club.id && <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-300">Real</Badge>}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-white/50">{r.member.managerName}</td>
                    <td className="px-2 py-2 text-center text-white/55">{r.played}</td>
                    <td className="px-2 py-2 text-center text-white/55">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td>
                    <td className="px-4 py-2 text-center font-black">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "calendario" && (
        <Card dense>
          <ul className="divide-y divide-white/5">
            {fixtures.map((f) => {
              const home = worldMember(world, f.homeId);
              const away = worldMember(world, f.awayId);
              const win = f.played && ((f.homeId === club.id && (f.homeGoals ?? 0) > (f.awayGoals ?? 0)) || (f.awayId === club.id && (f.awayGoals ?? 0) > (f.homeGoals ?? 0)));
              const draw = f.played && f.homeGoals === f.awayGoals;
              return (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-8 shrink-0 text-[11px] text-white/30">J{f.round}</span>
                  <span className="hidden w-24 shrink-0 text-[11px] text-white/35 sm:block">{formatGameDate(f.date)}</span>
                  <span className={`min-w-0 flex-1 truncate text-right ${f.homeId === club.id ? "font-semibold" : "text-white/60"}`}>{home?.name ?? "—"}</span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold tabular-nums ${
                    !f.played ? "bg-white/6 text-white/40" : win ? "bg-emerald-500/20 text-emerald-300" : draw ? "bg-white/10 text-white/60" : "bg-rose-500/20 text-rose-300"}`}>
                    {f.played ? `${f.homeGoals}-${f.awayGoals}` : "vs"}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${f.awayId === club.id ? "font-semibold" : "text-white/60"}`}>{away?.name ?? "—"}</span>
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
                {scorers.map((s) => (
                  <tr key={s.player.id} className="cursor-pointer border-b border-white/4 hover:bg-white/4" onClick={() => navigate(`/jugador/${s.player.id}`)}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <Rating value={s.player.overall} size="sm" />
                        <span className="truncate font-medium">{s.player.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-white/60">{s.apps}</td>
                    <td className="px-2 py-2 text-center font-bold text-turf-300">{s.goals}</td>
                    <td className="px-2 py-2 text-center text-white/70">{s.assists}</td>
                    <td className="px-2 py-2 text-center text-white/45">{s.minutes}'</td>
                    <td className="px-4 py-2 text-center font-semibold">{(s.ratingSum / Math.max(1, s.apps)).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "managers" && (
        rivals.length === 0 ? (
          <EmptyState icon={<Users />} title="No hay otros managers todavía"
                      text="Cuando más usuarios creen su club aparecerán aquí y podrás negociar traspasos con ellos." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rivals.map((r) => {
              const member = worldMember(world, r.clubId);
              return (
                <Card key={r.clubId}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-xl">
                      {countryFlag(r.country)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{r.name}</p>
                      <p className="text-xs text-white/45">Manager: {r.managerName}</p>
                      <div className="mt-1.5">
                        <div className="mb-1 flex justify-between text-[10px] text-white/35">
                          <span>Reputación</span><span>{Math.round(r.reputation)}</span>
                        </div>
                        <Bar value={r.reputation} />
                      </div>
                    </div>
                  </div>
                  <Button className="mt-3 w-full" size="sm" variant="outline"
                          onClick={() => setTarget({ clubId: r.clubId, clubName: r.name, uid: member?.ownerUid ?? "" })}>
                    <Send size={13} /> Negociar fichaje
                  </Button>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab === "ofertas" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Ofertas recibidas" subtitle={`${pendingIn.length} pendiente(s)`}>
            {offersIn.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">Ningún manager ha pujado por tus jugadores todavía.</p>
            ) : (
              <div className="space-y-2.5">
                {offersIn.map((o) => (
                  <div key={o.id} className="rounded-xl border border-white/8 bg-ink-900/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {o.playerName} <span className="text-white/40">({o.playerOverall} · {POSITION_MAP[o.playerPosition as never]?.short ?? o.playerPosition})</span>
                        </p>
                        <p className="text-[11px] text-white/45">{o.fromClubName} · {o.fromManager}</p>
                      </div>
                      <Badge className={OFFER_STATUS_STYLE[o.status]}>{o.status}</Badge>
                      <p className="text-lg font-black text-emerald-300">{money(o.amount)}</p>
                    </div>
                    {o.message && <p className="mt-1.5 text-xs italic text-white/45">"{o.message}"</p>}
                    {o.status === "pendiente" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" disabled={busy === o.id}
                                onClick={() => run(o.id, () => respondUserOffer(o.id, true), "Traspaso aceptado.")}>
                          {busy === o.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aceptar
                        </Button>
                        <Button size="sm" variant="outline"
                                onClick={() => run(o.id, () => respondUserOffer(o.id, false), "Oferta rechazada.")}>
                          <X size={13} /> Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Ofertas enviadas" subtitle={`${offersOut.length} en total`}>
            {offersOut.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">Ve a la pestaña «Managers» para pujar por jugadores de otros clubes.</p>
            ) : (
              <div className="space-y-2">
                {offersOut.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/4 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.playerName}</p>
                      <p className="text-[11px] text-white/40">a {o.toClubName}</p>
                    </div>
                    <Badge className={OFFER_STATUS_STYLE[o.status]}>{o.status}</Badge>
                    <span className="font-semibold tabular-nums">{money(o.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-white/35">
              Cuando el otro manager acepta, el jugador pasa a tu plantilla y el importe se descuenta automáticamente la próxima vez que entres.
            </p>
          </Card>
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Oferta al ${target?.clubName ?? ""}`} wide>
        {target && (
          <div className="space-y-4">
            {squad.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/45">Cargando plantilla del club...</p>
            ) : (
              <>
                <Select label="Jugador objetivo" value={pick}
                        onChange={(e) => {
                          setPick(e.target.value);
                          const p = squad.find((x) => x.id === e.target.value);
                          if (p) setAmount(Math.round(p.value * 1.15));
                        }}>
                  {squad.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {Math.round(p.overall)} · {p.age} años · {money(p.value)}
                    </option>
                  ))}
                </Select>

                {selected && (
                  <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                    <Rating value={selected.overall} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{countryFlag(selected.nationality)} {selected.name}</p>
                      <p className="text-xs text-white/45">
                        {POSITION_MAP[selected.position].label} · {selected.age} años · Valor {money(selected.value)}
                      </p>
                    </div>
                    <button onClick={() => navigate(`/jugador/${selected.id}`)} className="text-xs text-turf-300 hover:underline">Ficha</button>
                  </div>
                )}

                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/50">Importe ofrecido</span>
                    <span className="font-bold">{money(amount)}</span>
                  </div>
                  <input type="range" min={0} max={Math.max((selected?.value ?? 100000) * 3, 500000)} step={10000}
                         value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-emerald-500" />
                  <p className="mt-1 text-[11px] text-white/35">
                    Caja disponible: {money(club.finances.balance)} · Plantilla {players.length}/30
                  </p>
                </div>

                <Input label="Mensaje al manager" placeholder="Ej. Creo que encajaría perfecto en mi proyecto"
                       value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />

                <div className="flex gap-2">
                  <Button className="flex-1" disabled={busy === "offer" || !selected}
                          onClick={() => run("offer", async () => {
                            if (!selected || !target) return "Selecciona un jugador.";
                            const err = await makeUserOffer(target, selected, amount, note);
                            if (!err) { setTarget(null); setNote(""); }
                            return err;
                          }, "Oferta enviada al manager.")}>
                    {busy === "offer" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar oferta
                  </Button>
                  <Button variant="outline" onClick={() => setTarget(null)}>Cancelar</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-white/25">
        <Trophy size={11} /> Los resultados de la Liga Mundial son deterministas para todos los participantes
      </p>
    </div>
  );
}