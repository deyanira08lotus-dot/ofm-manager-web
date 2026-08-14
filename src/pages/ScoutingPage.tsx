/**
 * src/pages/ScoutingPage.tsx — Centro de Análisis y Scouting (FASE 14).
 */
import { useMemo, useState } from "react";
import {
  BarChart3, Binoculars, Check, Eye, Loader2, MapPin, Plane, Radar, ScanSearch, Swords, Timer,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Modal, Rating, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, ratingColor } from "@/game/format";
import { COUNTRIES, countryFlag, countryName } from "@/game/data/countries";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GROUP_COLORS, POSITION_MAP, POSITIONS } from "@/game/data/traits";
import {
  availableScouts, comparePlayers, FOCUS_META, MAX_MISSIONS, MISSION_DURATIONS, missionCost,
  rivalReport, scoutPrecision, type ScoutFocus,
} from "@/game/scouting";
import { clubOf, nextFixture } from "@/game/league";
import { squadStrength } from "@/game/players";
import { realTimeUntil } from "@/game/time";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "misiones", label: "Ojeadores", icon: <Plane size={15} /> },
  { key: "hallazgos", label: "Descubrimientos", icon: <Binoculars size={15} /> },
  { key: "rival", label: "Informe rival", icon: <Swords size={15} /> },
  { key: "comparar", label: "Comparador", icon: <BarChart3 size={15} /> },
] as const;

export default function ScoutingPage() {
  const { club, players, staff, scouting, league, sendScout, signScoutedPlayer } = useGame();

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("misiones");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Formulario de misión
  const [scoutId, setScoutId] = useState("");
  const [country, setCountry] = useState(club?.country ?? "ESP");
  const [position, setPosition] = useState<string>("any");
  const [focus, setFocus] = useState<ScoutFocus>("any");
  const [days, setDays] = useState(14);

  // Comparador
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [detail, setDetail] = useState<string | null>(null);

  const scouts = useMemo(() => (scouting ? availableScouts(staff, scouting) : []), [staff, scouting]);
  const analyticsLevel = club?.facilities.analytics?.level ?? 1;
  const analyst = staff.find((s) => s.role === "Analista");

  const rival = useMemo(() => {
    if (!league || !club) return null;
    const fx = nextFixture(league);
    if (!fx) return null;
    return clubOf(league, fx.homeId === club.id ? fx.awayId : fx.homeId) ?? null;
  }, [league, club]);

  const report = useMemo(() => {
    if (!rival || !club) return null;
    return rivalReport({
      rival, club, ourRating: squadStrength(players),
      analystLevel: analyst?.level ?? 0, analyticsLevel,
    });
  }, [rival, club, players, analyst, analyticsLevel]);

  const comparison = useMemo(() => {
    const a = players.find((p) => p.id === cmpA);
    const b = players.find((p) => p.id === cmpB);
    return a && b ? { a, b, ...comparePlayers(a, b) } : null;
  }, [cmpA, cmpB, players]);

  if (!club || !scouting) {
    return <EmptyState icon={<Radar />} title="Centro de análisis no disponible" text="Recarga la aplicación para inicializar el módulo de scouting." />;
  }

  const activeMissions = scouting.missions.filter((m) => !m.completed);
  const selectedScout = staff.find((s) => s.id === scoutId) ?? scouts[0];
  const cost = selectedScout ? missionCost(selectedScout.level, days, country === club.country) : 0;
  const precision = selectedScout ? scoutPrecision(selectedScout, country, analyticsLevel, days) : 0;
  const detailItem = detail ? scouting.discoveries.find((d) => d.id === detail) : null;

  async function launch() {
    if (!selectedScout) return;
    setBusy("launch");
    setMsg(null);
    try {
      const err = await sendScout(selectedScout.id, country, position, focus, days);
      setMsg(err ? { text: err, ok: false } : { text: `${selectedScout.name} viaja a ${countryName(country)}.`, ok: true });
    } finally { setBusy(null); }
  }

  async function sign(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const err = await signScoutedPlayer(id);
      setMsg(err ? { text: err, ok: false } : { text: "Fichaje completado.", ok: true });
      if (!err) setDetail(null);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Centro de análisis</h1>
        <p className="text-sm text-white/45">
          Envía ojeadores por el mundo, estudia al rival y compara a tus jugadores.
        </p>
      </header>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Centro de análisis" value={`N${analyticsLevel}`} sub={`+${analyticsLevel * 5}% de precisión`} icon={<Radar size={15} />} />
        <StatTile label="Misiones activas" value={`${activeMissions.length} / ${MAX_MISSIONS}`} sub={`${scouts.length} ojeador(es) libres`} icon={<Plane size={15} />} />
        <StatTile label="Descubrimientos" value={scouting.discoveries.length} sub={`${scouting.totalSignings} fichado(s) por scouting`} icon={<Binoculars size={15} />} tone={scouting.discoveries.length ? "good" : "default"} />
        <StatTile label="Analista" value={analyst ? analyst.level : "—"} sub={analyst?.name ?? "Sin analista contratado"} tone={analyst ? "default" : "warn"} />
      </div>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
            {t.key === "hallazgos" && scouting.discoveries.length > 0 && (
              <span className="rounded-full bg-turf-600 px-1.5 text-[10px] font-bold text-[#fff]">{scouting.discoveries.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ---------------------- MISIONES ---------------------- */}
      {tab === "misiones" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Card title="Nueva misión de ojeo" subtitle="Los ojeadores encuentran jugadores fuera del mercado">
            {scouts.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-white/45">
                  No tienes ojeadores libres. Contrata uno en <b>Cuerpo técnico</b> o espera a que vuelvan de viaje.
                </p>
                <Button className="mt-3" variant="outline" onClick={() => navigate("/cuerpo-tecnico")}>
                  Ir a Cuerpo técnico
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Select label="Ojeador" value={selectedScout?.id ?? ""} onChange={(e) => setScoutId(e.target.value)}>
                  {scouts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.role} · nivel {s.level}
                      {s.specialities.length ? ` (${s.specialities.join(", ")})` : ""}
                    </option>
                  ))}
                </Select>

                <div className="grid grid-cols-2 gap-3">
                  <Select label="País de destino" value={country} onChange={(e) => setCountry(e.target.value)}>
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </Select>
                  <Select label="Posición buscada" value={position} onChange={(e) => setPosition(e.target.value)}>
                    <option value="any">Cualquiera</option>
                    {POSITIONS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                  </Select>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Perfil</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(FOCUS_META) as ScoutFocus[]).map((f) => (
                      <button key={f} onClick={() => setFocus(f)}
                              className={`rounded-xl border p-2.5 text-left transition ${
                                focus === f ? "border-turf-500/60 bg-turf-500/10" : "border-white/8 bg-ink-900/50 hover:border-white/20"}`}>
                        <p className="text-sm font-semibold">{FOCUS_META[f].icon} {FOCUS_META[f].label}</p>
                        <p className="text-[10px] leading-snug text-white/40">{FOCUS_META[f].desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Duración</span>
                  <div className="grid grid-cols-3 gap-2">
                    {MISSION_DURATIONS.map((d) => (
                      <button key={d.days} onClick={() => setDays(d.days)}
                              className={`rounded-xl border p-2.5 text-center transition ${
                                days === d.days ? "border-turf-500/60 bg-turf-500/10" : "border-white/8 bg-ink-900/50 hover:border-white/20"}`}>
                        <p className="text-sm font-bold">{d.days} días</p>
                        <p className="text-[10px] text-white/40">{d.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/5 p-2.5 text-center">
                    <p className="text-[10px] uppercase text-white/35">Coste del viaje</p>
                    <p className={`font-bold ${club.finances.balance >= cost ? "" : "text-rose-300"}`}>{money(cost)}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-2.5 text-center">
                    <p className="text-[10px] uppercase text-white/35">Fiabilidad estimada</p>
                    <p className={`font-bold ${precision >= 70 ? "text-emerald-300" : precision >= 50 ? "text-amber-300" : "text-rose-300"}`}>
                      {precision}%
                    </p>
                  </div>
                </div>

                <Button className="w-full" disabled={busy === "launch" || activeMissions.length >= MAX_MISSIONS || club.finances.balance < cost}
                        onClick={launch}>
                  {busy === "launch" ? <Loader2 size={15} className="animate-spin" /> : <Plane size={15} />}
                  {activeMissions.length >= MAX_MISSIONS ? "Máximo de misiones alcanzado" : `Enviar por ${money(cost)}`}
                </Button>
                <p className="text-[11px] text-white/35">
                  Los especialistas en la zona (Sudamérica, Europa, Juveniles, Datos) elaboran informes mucho más precisos.
                </p>
              </div>
            )}
          </Card>

          <Card title="Misiones en curso" subtitle={`${activeMissions.length} de ${MAX_MISSIONS}`}>
            {activeMissions.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/40">
                Ningún ojeador está de viaje. Los informes llegan aunque cierres la aplicación.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activeMissions.map((m) => (
                  <div key={m.id} className="rounded-xl border border-sky-500/25 bg-sky-500/8 p-3">
                    <div className="flex items-center gap-2">
                      <MapPin size={15} className="text-sky-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{m.scoutName}</p>
                        <p className="text-[11px] text-white/45">
                          {countryFlag(m.country)} {countryName(m.country)} ·{" "}
                          {m.position === "any" ? "Cualquier posición" : POSITION_MAP[m.position].label} ·{" "}
                          {FOCUS_META[m.focus].label}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-sky-700">{realTimeUntil(m.finishesAt)}</p>
                        <p className="text-[10px] text-white/35">{m.days} días</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl bg-white/4 p-3 text-[11px] text-white/45">
              <p className="flex items-start gap-1.5">
                <Timer size={12} className="mt-0.5 shrink-0" />
                Cada misión completada genera de 1 a 4 informes. Mejorar el Centro de análisis
                (ahora N{analyticsLevel}) estrecha los márgenes de error de todos los informes.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------- HALLAZGOS ---------------------- */}
      {tab === "hallazgos" && (
        scouting.discoveries.length === 0 ? (
          <EmptyState icon={<Binoculars />} title="Sin descubrimientos activos"
                      text="Envía ojeadores a explorar países: encontrarán jugadores que no aparecen en el mercado normal." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {scouting.discoveries.map((d) => {
              const p = d.player;
              const affordable = club.finances.balance >= d.askingPrice;
              return (
                <Card key={d.id}>
                  <div className="flex items-start gap-3">
                    <PlayerAvatar seed={p.seed} nationality={p.nationality} age={p.age} size={56} className="rounded-2xl border border-white/10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{p.name}</p>
                      <p className="text-xs text-white/45">{p.age} años · {POSITION_MAP[p.position].label}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                        <Badge className="border-white/10 bg-white/5 text-white/50">{p.personality}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-ink-900/50 p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/35">
                      <span>Informe de {d.foundBy}</span>
                      <span className={d.report.confidence >= 70 ? "text-emerald-600" : d.report.confidence >= 50 ? "text-amber-600" : "text-rose-500"}>
                        {d.report.confidence}% fiable
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-white/45">Nivel estimado</span>
                          <span className="font-bold">{d.report.low}–{d.report.high}</span>
                        </div>
                        <Bar value={(d.report.low + d.report.high) / 2} />
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-white/45">Techo estimado</span>
                          <span className="font-bold text-turf-300">{d.report.potLow}–{d.report.potHigh}</span>
                        </div>
                        <Bar value={(d.report.potLow + d.report.potHigh) / 2} />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] italic text-white/50">"{d.report.verdict}"</p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.report.standoutAttrs.map((a) => (
                      <span key={a.key} className="rounded bg-white/6 px-1.5 py-0.5 text-[10px]">
                        {a.label} <b className={ratingColor(a.value)}>{a.value}</b>
                      </span>
                    ))}
                  </div>

                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between"><dt className="text-white/40">Precio</dt><dd className={`font-semibold ${affordable ? "" : "text-rose-300"}`}>{money(d.askingPrice)}</dd></div>
                    <div className="flex justify-between"><dt className="text-white/40">Ficha</dt><dd className="font-semibold">{money(d.wageDemand)}/sem</dd></div>
                    <div className="flex justify-between"><dt className="text-white/40">Disponible</dt><dd className="font-semibold">{realTimeUntil(d.expiresAt)}</dd></div>
                  </dl>

                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" disabled={!affordable || busy === d.id} onClick={() => sign(d.id)}>
                      {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {affordable ? "Fichar" : "Sin saldo"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDetail(d.id)}>
                      <Eye size={13} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ------------------------ RIVAL ------------------------ */}
      {tab === "rival" && (
        !report || !rival ? (
          <EmptyState icon={<Swords />} title="Sin próximo rival" text="Cuando tengas un partido programado, el analista preparará el informe." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <Card title="Próximo rival" subtitle={report.rivalName}>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                     style={{ background: `linear-gradient(135deg, ${rival.colors.primary}, ${rival.colors.secondary})` }}>
                  {rival.shortName}
                </div>
                <div>
                  <p className="font-bold">{rival.name}</p>
                  <p className="text-xs text-white/45">Entrenador: {rival.managerName}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/5 p-2.5">
                  <p className="text-lg font-black">{report.rating}</p>
                  <p className="text-[10px] uppercase text-white/35">Nivel</p>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5">
                  <p className="text-lg font-black">{report.predictedFormation}</p>
                  <p className="text-[10px] uppercase text-white/35">Formación</p>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5">
                  <p className={`text-lg font-black ${report.threatLevel === "alta" ? "text-rose-500" : report.threatLevel === "media" ? "text-amber-600" : "text-emerald-600"}`}>
                    {report.threatLevel}
                  </p>
                  <p className="text-[10px] uppercase text-white/35">Amenaza</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-white/45">Fiabilidad del informe</span>
                  <span className="font-bold">{report.precision}%</span>
                </div>
                <Bar value={report.precision} />
                <p className="mt-1 text-[10px] text-white/35">
                  Depende del nivel de tu analista{analyst ? ` (${analyst.name}, ${analyst.level})` : " (sin analista)"} y del Centro de análisis.
                </p>
              </div>
            </Card>

            <div className="space-y-4">
              <Card title="Puntos fuertes del rival">
                <ul className="space-y-1.5">
                  {report.strengths.map((s) => (
                    <li key={s} className="flex gap-2 rounded-lg bg-rose-500/8 px-3 py-2 text-sm text-white/60">
                      <span className="text-rose-500">▲</span>{s}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Debilidades detectadas">
                <ul className="space-y-1.5">
                  {report.weaknesses.map((s) => (
                    <li key={s} className="flex gap-2 rounded-lg bg-emerald-500/8 px-3 py-2 text-sm text-white/60">
                      <span className="text-emerald-600">▼</span>{s}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Recomendaciones tácticas">
                <ul className="space-y-1.5">
                  {report.advice.map((s) => (
                    <li key={s} className="flex gap-2 rounded-lg bg-white/4 px-3 py-2 text-sm text-white/60">
                      <ScanSearch size={14} className="mt-0.5 shrink-0 text-turf-300" />{s}
                    </li>
                  ))}
                </ul>
                <Button className="mt-3 w-full" variant="outline" onClick={() => navigate("/alineacion")}>
                  Ajustar alineación
                </Button>
              </Card>
            </div>
          </div>
        )
      )}

      {/* ---------------------- COMPARADOR ---------------------- */}
      {tab === "comparar" && (
        <div className="space-y-5">
          <Card title="Comparador de jugadores" subtitle="Enfrenta dos fichas atributo por atributo">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Jugador A" value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
                <option value="">Selecciona…</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.name} ({Math.round(p.overall)})</option>)}
              </Select>
              <Select label="Jugador B" value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
                <option value="">Selecciona…</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.name} ({Math.round(p.overall)})</option>)}
              </Select>
            </div>
          </Card>

          {comparison && (
            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar seed={comparison.a.seed} nationality={comparison.a.nationality} age={comparison.a.age} size={40} className="rounded-xl border border-white/10" />
                  <Rating value={comparison.a.overall} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{comparison.a.name}</p>
                    <p className="text-[11px] text-white/40">{POSITION_MAP[comparison.a.position].short} · {comparison.a.age} años</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-bold text-white/30">VS</span>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 text-right">
                    <p className="truncate text-sm font-bold">{comparison.b.name}</p>
                    <p className="text-[11px] text-white/40">{POSITION_MAP[comparison.b.position].short} · {comparison.b.age} años</p>
                  </div>
                  <Rating value={comparison.b.overall} />
                  <PlayerAvatar seed={comparison.b.seed} nationality={comparison.b.nationality} age={comparison.b.age} size={40} className="rounded-xl border border-white/10" />
                </div>
              </div>

              <div className="space-y-1.5">
                {comparison.rows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2 text-xs">
                    <span className={`w-7 text-right font-bold tabular-nums ${r.winner === "a" ? "text-turf-300" : "text-white/45"}`}>{r.a}</span>
                    <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                      <div className={r.winner === "a" ? "bg-turf-500" : "bg-white/20"} style={{ width: `${(r.a / (r.a + r.b)) * 100}%` }} />
                      <div className={r.winner === "b" ? "bg-sky-500" : "bg-white/12"} style={{ width: `${(r.b / (r.a + r.b)) * 100}%` }} />
                    </div>
                    <span className={`w-7 font-bold tabular-nums ${r.winner === "b" ? "text-sky-600" : "text-white/45"}`}>{r.b}</span>
                    <span className="w-24 shrink-0 truncate text-[10px] text-white/35">{r.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-white/5 p-3 text-center text-sm">
                <p className="font-semibold">
                  <span className="text-turf-300">{comparison.summary.aWins}</span>
                  <span className="mx-2 text-white/30">—</span>
                  <span className="text-sky-600">{comparison.summary.bWins}</span>
                </p>
                <p className="mt-1 text-xs text-white/50">{comparison.summary.verdict}</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ------------------ MODAL DE DETALLE ------------------ */}
      <Modal open={!!detailItem} onClose={() => setDetail(null)} title="Informe completo del ojeador">
        {detailItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <PlayerAvatar seed={detailItem.player.seed} nationality={detailItem.player.nationality} age={detailItem.player.age} size={56} className="rounded-2xl border border-white/10" />
              <div className="min-w-0">
                <p className="text-lg font-bold">{detailItem.player.name}</p>
                <p className="text-sm text-white/45">
                  {detailItem.player.age} años · {POSITION_MAP[detailItem.player.position].label} · {countryName(detailItem.player.nationality)}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 p-3 text-sm">
              <p className="text-xs text-white/40">Veredicto del ojeador {detailItem.foundBy}</p>
              <p className="mt-1 italic">"{detailItem.report.verdict}"</p>
            </div>

            <div className="space-y-2">
              {detailItem.report.standoutAttrs.map((a) => (
                <div key={a.key} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-white/50">{a.label}</span>
                  <Bar value={a.value} className="flex-1" />
                  <span className={`w-7 text-right text-xs font-bold ${ratingColor(a.value)}`}>{a.value}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              El informe tiene un <b>{detailItem.report.confidence}%</b> de fiabilidad: los valores reales pueden
              diferir. Mejorar el Centro de análisis y contratar mejores ojeadores reduce ese margen.
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy === detailItem.id || club.finances.balance < detailItem.askingPrice}
                      onClick={() => sign(detailItem.id)}>
                {busy === detailItem.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Fichar por {money(detailItem.askingPrice)}
              </Button>
              <Button variant="outline" onClick={() => setDetail(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
