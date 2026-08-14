/**
 * src/pages/MultiplayerPage.tsx — Liga mundial compartida y traspasos entre managers (FASE 12).
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft, Check, Globe2, Inbox, Loader2, LogIn, LogOut, Play, Send, Timer, Trophy, Users, X,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Input, Modal, Rating, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { backend, isLocalMode } from "@/services/backend";
import { money } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { POSITION_MAP } from "@/game/data/traits";
import {
  humanCount, nextWorldFixture, OFFER_STATUS_STYLE, WORLD_CAPACITY, worldMember, worldStandings,
} from "@/game/multiplayer";
import { formatGameDate, realTimeUntil } from "@/game/time";
import type { Player } from "@/types";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "liga", label: "Liga mundial", icon: <Globe2 size={15} /> },
  { key: "managers", label: "Managers", icon: <Users size={15} /> },
  { key: "ofertas", label: "Ofertas", icon: <Inbox size={15} /> },
] as const;

export default function MultiplayerPage() {
  const {
    club, players, world, inWorld, offersIn, offersOut, simulating,
    joinWorld, leaveWorld, kickoffWorld, playWorldMatch, makeUserOffer, respondUserOffer, refreshOffers,
    rankings,
  } = useGame();

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("liga");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [target, setTarget] = useState<{ clubId: string; clubName: string; uid: string } | null>(null);
  const [squad, setSquad] = useState<Player[]>([]);
  const [pick, setPick] = useState<string>("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");

  const standings = useMemo(() => (world ? worldStandings(world) : []), [world]);
  const fixture = useMemo(() => (world && club ? nextWorldFixture(world, club.id) : null), [world, club]);
  const rivals = useMemo(() => rankings.filter((r) => r.clubId !== club?.id), [rankings, club]);
  const pendingIn = offersIn.filter((o) => o.status === "pendiente");

  // Cargar la plantilla del club objetivo al abrir el modal de oferta
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
    return <EmptyState icon={<Globe2 />} title="Multijugador no disponible" text="Recarga la aplicación para conectar con la liga mundial." />;
  }

  const selected = squad.find((p) => p.id === pick);

  async function run(key: string, fn: () => Promise<string | null | void>, okText: string) {
    setBusy(key);
    setMsg(null);
    try {
      const err = await fn();
      setMsg(err ? { text: err as string, ok: false } : { text: okText, ok: true });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Multijugador</h1>
          <p className="text-sm text-white/45">
            Compite en una liga compartida y negocia traspasos con otros managers reales.
          </p>
        </div>
        <Button variant="outline" onClick={() => refreshOffers()}>
          <ArrowRightLeft size={15} /> Actualizar
        </Button>
      </header>

      {isLocalMode && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700">
          <b>Modo local:</b> la liga mundial funciona, pero solo verás a los managers registrados en este navegador.
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
        <StatTile label="Managers reales" value={`${humanCount(world)} / ${WORLD_CAPACITY}`}
                  sub={`${WORLD_CAPACITY - humanCount(world)} plazas con IA`} icon={<Users size={15} />}
                  tone={humanCount(world) > 1 ? "good" : "default"} />
        <StatTile label="Estado" value={world.status === "abierta" ? "Inscripciones" : world.status === "en_juego" ? "En juego" : "Finalizada"}
                  sub={world.status === "en_juego" ? `Jornada ${world.round}` : `Temporada ${world.seasonId}`} />
        <StatTile label="Ofertas pendientes" value={pendingIn.length} sub={`${offersOut.length} enviada(s)`}
                  icon={<Inbox size={15} />} tone={pendingIn.length ? "warn" : "default"} />
      </div>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
            {t.key === "ofertas" && pendingIn.length > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-[#fff]">{pendingIn.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------ LIGA ------------------------ */}
      {tab === "liga" && (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {inWorld ? "Participas en esta liga mundial" : "Aún no estás inscrito"}
                </p>
                <p className="text-xs text-white/45">
                  {inWorld
                    ? world.status === "abierta"
                      ? "Esperando el sorteo del calendario. Puedes lanzarlo cuando quieras."
                      : `Jornada ${world.round} de ${world.fixtures.length / (WORLD_CAPACITY / 2)}`
                    : "Al inscribirte ocuparás la plaza del club IA de nivel más parecido al tuyo."}
                </p>
              </div>
              {!inWorld ? (
                <Button disabled={busy === "join"} onClick={() => run("join", joinWorld, "Inscripción completada.")}>
                  {busy === "join" ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} Inscribirme
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {world.status === "abierta" && (
                    <Button disabled={busy === "kick"} onClick={() => run("kick", kickoffWorld, "Calendario sorteado: ¡que empiece la liga!")}>
                      {busy === "kick" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Sortear calendario
                    </Button>
                  )}
                  {world.status === "en_juego" && fixture && (() => {
                    const rivalId = fixture.homeId === club.id ? fixture.awayId : fixture.homeId;
                    const rival = worldMember(world, rivalId);
                    const ready = Date.parse(fixture.date) <= Date.now();
                    return (
                      <Button size="lg" disabled={!ready || simulating}
                              onClick={() => run("play", playWorldMatch, "Partido disputado.")}>
                        {simulating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        {ready ? `Jugar vs ${rival?.shortName ?? "rival"}` : `En ${realTimeUntil(fixture.date)}`}
                      </Button>
                    );
                  })()}
                  <Button variant="ghost" onClick={() => run("leave", leaveWorld, "Has abandonado la liga mundial.")}>
                    <LogOut size={15} />
                  </Button>
                </div>
              )}
            </div>
            {inWorld && fixture && world.status === "en_juego" && (() => {
              const rivalId = fixture.homeId === club.id ? fixture.awayId : fixture.homeId;
              const rival = worldMember(world, rivalId);
              return (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/4 px-3 py-2 text-xs text-white/50">
                  <Timer size={13} /> Jornada {fixture.round} · {formatGameDate(fixture.date)} ·{" "}
                  {fixture.homeId === club.id ? "Local" : "Visitante"} contra{" "}
                  <b className="text-white/70">{rival?.name}</b>
                  {rival && !rival.isAi && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Manager real</Badge>}
                </p>
              );
            })()}
          </Card>

          <Card dense title="Clasificación" subtitle={`${world.members.length} equipos`}>
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
                          {!r.member.isAi && r.clubId !== club.id && (
                            <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-300">Real</Badge>
                          )}
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
        </div>
      )}

      {/* ---------------------- MANAGERS ---------------------- */}
      {tab === "managers" && (
        rivals.length === 0 ? (
          <EmptyState icon={<Users />} title="No hay otros managers todavía"
                      text="Cuando más usuarios creen su club aparecerán aquí y podrás negociar traspasos con ellos." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rivals.map((r) => (
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
                        onClick={() => setTarget({ clubId: r.clubId, clubName: r.name, uid: "" })}>
                  <Send size={13} /> Negociar fichaje
                </Button>
              </Card>
            ))}
          </div>
        )
      )}

      {/* ----------------------- OFERTAS ----------------------- */}
      {tab === "ofertas" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Ofertas recibidas" subtitle={`${pendingIn.length} pendiente(s)`}>
            {offersIn.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">
                Ningún manager ha pujado por tus jugadores todavía.
              </p>
            ) : (
              <div className="space-y-2.5">
                {offersIn.map((o) => (
                  <div key={o.id} className="rounded-xl border border-white/8 bg-ink-900/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {o.playerName} <span className="text-white/40">({o.playerOverall} · {POSITION_MAP[o.playerPosition as never]?.short ?? o.playerPosition})</span>
                        </p>
                        <p className="text-[11px] text-white/45">
                          {o.fromClubName} · {o.fromManager}
                        </p>
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
              <p className="py-6 text-center text-sm text-white/40">
                Ve a la pestaña «Managers» para pujar por jugadores de otros clubes.
              </p>
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
              Cuando el otro manager acepta, el jugador pasa a tu plantilla y el importe se descuenta
              automáticamente la próxima vez que entres.
            </p>
          </Card>
        </div>
      )}

      {/* -------------------- MODAL DE OFERTA -------------------- */}
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
                            if (!selected) return "Selecciona un jugador.";
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
        <Trophy size={11} /> Los resultados son deterministas: todos los participantes ven la misma clasificación
      </p>
    </div>
  );
}
