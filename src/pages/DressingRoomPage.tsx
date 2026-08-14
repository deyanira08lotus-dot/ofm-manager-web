/**
 * src/pages/DressingRoomPage.tsx — Vestuario, química y sala de prensa (FASE 15).
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, Check, Crown, Heart, Loader2, MessageSquare, Mic, Users2, Zap,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Modal, Rating, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { moraleLabel } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { GROUP_COLORS, POSITION_MAP } from "@/game/data/traits";
import {
  buildPressConference, chatAvailable, chatSuccessChance, CHAT_META, pressAvailable,
  previewTalks, TALK_META, type ChatKind, type PressQuestion, type TalkPreview,
} from "@/game/dressingroom";
import { clubOf, nextFixture, sortedTable } from "@/game/league";
import { resolveLineup } from "@/game/match";
import { squadStrength } from "@/game/players";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "ambiente", label: "Ambiente", icon: <Users2 size={15} /> },
  { key: "charlas", label: "Conversaciones", icon: <MessageSquare size={15} /> },
  { key: "arenga", label: "Charla de equipo", icon: <Zap size={15} /> },
  { key: "prensa", label: "Sala de prensa", icon: <Mic size={15} /> },
] as const;

export default function DressingRoomPage() {
  const {
    club, players, league, staffEffects, dressingRoom, chemistry, concerns,
    talkTo, giveTeamTalk, doPressConference,
  } = useGame();

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("ambiente");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [chatTarget, setChatTarget] = useState<string | null>(null);
  const [pressAnswers, setPressAnswers] = useState<Record<string, string>>({});
  const [pressResult, setPressResult] = useState<string[] | null>(null);

  const position = useMemo(
    () => (league && club ? sortedTable(league).findIndex((r) => r.clubId === club.id) + 1 : 0),
    [league, club]
  );

  const context = useMemo(() => {
    if (!league || !club) return null;
    const fx = nextFixture(league);
    if (!fx) return null;
    const rival = clubOf(league, fx.homeId === club.id ? fx.awayId : fx.homeId);
    const { starters } = resolveLineup(club.tactics, players);
    return { fx, rival, starters, isHome: fx.homeId === club.id };
  }, [league, club, players]);

  const talks = useMemo(() => {
    if (!context || !club) return [];
    return previewTalks({
      starters: context.starters,
      isHome: context.isHome,
      ourRating: squadStrength(players),
      rivalRating: context.rival?.rating ?? 55,
      coachLevel: staffEffects.coachLevel,
    });
  }, [context, club, players, staffEffects]);

  const questions = useMemo<PressQuestion[]>(
    () => (club ? buildPressConference(club, players, position, league?.clubs.length ?? 12) : []),
    [club, players, position, league]
  );

  if (!club || !dressingRoom) {
    return <EmptyState icon={<Users2 />} title="Vestuario no disponible" text="Recarga la aplicación para inicializar el módulo de vestuario." />;
  }

  const target = chatTarget ? players.find((p) => p.id === chatTarget) : null;
  const avgMorale = players.length ? players.reduce((s, p) => s + p.morale, 0) / players.length : 0;
  const unhappy = players.filter((p) => p.morale < 45).length;
  const canPress = pressAvailable(dressingRoom);
  const allAnswered = questions.every((q) => pressAnswers[q.id]);

  async function doChat(kind: ChatKind) {
    if (!target) return;
    setBusy(kind);
    setMsg(null);
    try {
      const err = await talkTo(target.id, kind);
      if (err) setMsg({ text: err, ok: false });
      else {
        const last = dressingRoom!.chatLog[0];
        setMsg({ text: last?.text ?? "Conversación mantenida.", ok: last?.success ?? true });
        setChatTarget(null);
      }
    } finally { setBusy(null); }
  }

  async function doTalk(preview: TalkPreview) {
    if (!context) return;
    setBusy(preview.tone);
    setMsg(null);
    try {
      const text = await giveTeamTalk(preview, context.starters.map((p) => p.id));
      setMsg({ text: text ?? "Charla realizada.", ok: true });
    } finally { setBusy(null); }
  }

  async function doPress() {
    setBusy("press");
    try {
      const summary = await doPressConference(
        questions.map((q) => ({ question: q, optionId: pressAnswers[q.id] }))
      );
      setPressResult(summary);
      setPressAnswers({});
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Vestuario</h1>
        <p className="text-sm text-white/45">
          Gestiona el ánimo del grupo: habla con tus jugadores, arenga al equipo y afronta a la prensa.
        </p>
      </header>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Química del grupo" value={`${chemistry.overall}%`} sub={chemistry.label} icon={<Heart size={15} />} tone={chemistry.tone} />
        <StatTile label="Moral media" value={moraleLabel(avgMorale)} sub={`${Math.round(avgMorale)}/100`} tone={avgMorale >= 60 ? "good" : avgMorale >= 45 ? "warn" : "bad"} />
        <StatTile label="Descontentos" value={unhappy} sub={`${concerns.filter((c) => c.severity === "alta").length} asunto(s) urgente(s)`} icon={<AlertTriangle size={15} />} tone={unhappy ? "warn" : "good"} />
        <StatTile label="Líder del vestuario" value={chemistry.leaders[0]?.name.split(" ").slice(-1)[0] ?? "—"} sub={`Influencia ${chemistry.leaders[0]?.influence ?? 0}`} icon={<Crown size={15} />} />
      </div>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
            {t.key === "charlas" && concerns.length > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-[#fff]">{concerns.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ---------------------- AMBIENTE ---------------------- */}
      {tab === "ambiente" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Grupos del vestuario" subtitle="Camarillas detectadas por el cuerpo técnico">
            {chemistry.cliques.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">
                No hay camarillas marcadas: el grupo está bastante equilibrado.
              </p>
            ) : (
              <div className="space-y-2.5">
                {chemistry.cliques.map((c) => (
                  <div key={c.id} className={`rounded-xl border p-3 ${c.positive ? "border-white/8 bg-ink-900/40" : "border-rose-500/30 bg-rose-500/8"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{c.positive ? "🤝" : "⚡"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.label}</p>
                        <p className="text-[11px] text-white/45">{c.reason}</p>
                      </div>
                      <span className="text-sm font-bold">{c.cohesion}%</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-white/40">
                      Referente: <b className="text-white/70">{c.leaderName}</b> · {c.memberIds.length} jugadores
                    </p>
                    <Bar value={c.cohesion} className="mt-2" />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card title="Líderes naturales" subtitle="Los jugadores con más influencia en el grupo">
              <div className="space-y-2">
                {chemistry.leaders.map((l, i) => {
                  const p = players.find((x) => x.id === l.playerId);
                  return (
                    <div key={l.playerId} className="flex items-center gap-3">
                      <span className="text-base">{["👑", "🥈", "🥉", "⭐"][i] ?? "⭐"}</span>
                      {p && <Rating value={p.overall} size="sm" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-[10px] text-white/40">{p?.personality}</p>
                      </div>
                      <Bar value={Math.min(100, l.influence)} className="w-16" />
                      <span className="w-8 text-right text-xs font-bold">{l.influence}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Mejores y peores conexiones">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-emerald-600">Mejor sintonía</p>
                  <div className="space-y-1">
                    {chemistry.bestPairs.map((p, i) => (
                      <div key={i} className="rounded-lg bg-emerald-500/8 px-2 py-1.5 text-[11px]">
                        {p.a.split(" ")[0]} + {p.b.split(" ")[0]} <b className="float-right">{p.value}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-rose-500">Peor sintonía</p>
                  <div className="space-y-1">
                    {chemistry.worstPairs.map((p, i) => (
                      <div key={i} className="rounded-lg bg-rose-500/8 px-2 py-1.5 text-[11px]">
                        {p.a.split(" ")[0]} + {p.b.split(" ")[0]} <b className="float-right">{p.value}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-white/35">
                La química sube con la nacionalidad y la personalidad compartidas, y afecta directamente al rendimiento
                del once en el simulador.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------- CHARLAS ---------------------- */}
      {tab === "charlas" && (
        <div className="space-y-5">
          {concerns.length > 0 && (
            <Card title="Asuntos pendientes" subtitle="Situaciones que conviene atender">
              <div className="space-y-2">
                {concerns.map((c, i) => (
                  <button key={i} onClick={() => setChatTarget(c.playerId)}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:brightness-105 ${
                            c.severity === "alta" ? "border-rose-500/35 bg-rose-500/8" :
                            c.severity === "media" ? "border-amber-500/30 bg-amber-500/8" : "border-white/8 bg-ink-900/40"}`}>
                    <Badge className={
                      c.severity === "alta" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" :
                      c.severity === "media" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" :
                      "border-white/15 bg-white/5 text-white/50"}>
                      {c.kind}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.playerName}</p>
                      <p className="text-[11px] text-white/50">{c.text}</p>
                    </div>
                    <span className="shrink-0 self-center rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold">
                      {CHAT_META[c.suggestion].icon} {CHAT_META[c.suggestion].label}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card dense title="Plantilla" subtitle="Habla individualmente con cualquier jugador">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="px-4 py-3 text-left">Jugador</th>
                    <th className="px-2 py-3 text-left">Personalidad</th>
                    <th className="px-2 py-3 text-left">Moral</th>
                    <th className="px-2 py-3 text-center">Rol</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id} className="border-b border-white/4">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{countryFlag(p.nationality)} {p.name}</span>
                          <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-white/50">{p.personality}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Bar value={p.morale} className="w-16" />
                          <span className="text-[11px] text-white/45">{moraleLabel(p.morale)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-white/50">{p.squadRole}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="outline" disabled={!chatAvailable(dressingRoom, p.id)}
                                onClick={() => setChatTarget(p.id)}>
                          <MessageSquare size={12} /> {chatAvailable(dressingRoom, p.id) ? "Hablar" : "Reciente"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {dressingRoom.chatLog.length > 0 && (
            <Card title="Últimas conversaciones">
              <div className="space-y-1.5">
                {dressingRoom.chatLog.slice(0, 8).map((c) => (
                  <div key={c.id} className={`rounded-lg px-3 py-2 text-xs ${c.success ? "bg-emerald-500/8" : "bg-rose-500/8"}`}>
                    <span className="font-semibold">{CHAT_META[c.kind].icon} {c.playerName}</span>
                    <span className="ml-2 text-white/55">{c.text}</span>
                    <span className={`float-right font-bold ${c.moraleDelta >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {c.moraleDelta >= 0 ? "+" : ""}{c.moraleDelta} moral
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---------------------- ARENGA ---------------------- */}
      {tab === "arenga" && (
        !context ? (
          <EmptyState icon={<Zap />} title="Sin partido programado" text="La charla de equipo se prepara antes de cada encuentro." />
        ) : (
          <div className="space-y-5">
            <Card title="Antes del partido" subtitle={`vs ${context.rival?.name ?? "rival"} · ${context.isHome ? "En casa" : "A domicilio"}`}>
              <p className="text-sm text-white/50">
                Elige el tono del mensaje. El efecto depende del contexto del partido y de las personalidades de tu once:
                un grupo con carácter responde a la exigencia, uno frágil se hunde.
              </p>
              {dressingRoom.lastTalk && (
                <p className="mt-3 rounded-lg bg-white/4 px-3 py-2 text-xs text-white/50">
                  Última charla ({TALK_META[dressingRoom.lastTalk.tone].label}): {dressingRoom.lastTalk.text}{" "}
                  <b className={dressingRoom.lastTalk.effect >= 0 ? "text-emerald-600" : "text-rose-500"}>
                    ({dressingRoom.lastTalk.effect >= 0 ? "+" : ""}{dressingRoom.lastTalk.effect} moral)
                  </b>
                </p>
              )}
            </Card>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {talks.map((t) => (
                <Card key={t.tone}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TALK_META[t.tone].icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{TALK_META[t.tone].label}</p>
                      <p className="text-[11px] text-white/45">{TALK_META[t.tone].desc}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[10px] uppercase text-white/35">Efecto esperado</p>
                      <p className={`font-bold ${t.expected > 3 ? "text-emerald-600" : t.expected > 0 ? "text-white/70" : "text-rose-500"}`}>
                        {t.expected > 0 ? "+" : ""}{t.expected}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[10px] uppercase text-white/35">Riesgo</p>
                      <p className={`font-bold ${t.risk === "alto" ? "text-rose-500" : t.risk === "medio" ? "text-amber-600" : "text-emerald-600"}`}>
                        {t.risk}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] italic text-white/40">{t.hint}</p>
                  <Button className="mt-3 w-full" size="sm" disabled={busy === t.tone} onClick={() => doTalk(t)}>
                    {busy === t.tone ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Dar esta charla
                  </Button>
                </Card>
              ))}
            </div>

            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-sm text-white/50">
                  Una vez arengado el grupo, sal al campo y comprueba el efecto en el rendimiento.
                </p>
                <Button onClick={() => navigate("/liga")}>Ir al partido</Button>
              </div>
            </Card>
          </div>
        )
      )}

      {/* ---------------------- PRENSA ---------------------- */}
      {tab === "prensa" && (
        <div className="space-y-5">
          {!canPress ? (
            <EmptyState icon={<Mic />} title="Sin rueda de prensa pendiente"
                        text="Ya has comparecido recientemente. Los periodistas volverán a citarte en unas horas." />
          ) : (
            <>
              <Card title="Rueda de prensa" subtitle="Tus respuestas afectan a la directiva, la afición y el vestuario">
                <p className="text-sm text-white/50">
                  Responde a las {questions.length} preguntas. Contentar a la grada suele enfadar al consejo, y viceversa.
                </p>
              </Card>

              {questions.map((q) => (
                <Card key={q.id} title={q.topic} subtitle={q.question}>
                  <div className="space-y-2">
                    {q.options.map((o) => {
                      const sel = pressAnswers[q.id] === o.id;
                      return (
                        <button key={o.id} onClick={() => setPressAnswers({ ...pressAnswers, [q.id]: o.id })}
                                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                                  sel ? "border-turf-500/60 bg-turf-500/10" : "border-white/8 bg-ink-900/40 hover:border-white/20"}`}>
                          <span className="min-w-0 flex-1 text-sm">{o.label}</span>
                          <span className="flex shrink-0 gap-1.5 text-[10px]">
                            <span className={o.board >= 0 ? "text-emerald-600" : "text-rose-500"}>Consejo {o.board >= 0 ? "+" : ""}{o.board}</span>
                            <span className={o.fans >= 0 ? "text-emerald-600" : "text-rose-500"}>Grada {o.fans >= 0 ? "+" : ""}{o.fans}</span>
                            <span className={o.morale >= 0 ? "text-emerald-600" : "text-rose-500"}>Moral {o.morale >= 0 ? "+" : ""}{o.morale}</span>
                          </span>
                          {sel && <Check size={15} className="shrink-0 text-turf-400" />}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              ))}

              <Button className="w-full" size="lg" disabled={!allAnswered || busy === "press"} onClick={doPress}>
                {busy === "press" ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
                {allAnswered ? "Comparecer ante la prensa" : "Responde a todas las preguntas"}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ------------------ MODAL DE CONVERSACIÓN ------------------ */}
      <Modal open={!!target} onClose={() => setChatTarget(null)} title="Conversación individual">
        {target && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Rating value={target.overall} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{countryFlag(target.nationality)} {target.name}</p>
                <p className="text-xs text-white/45">
                  {POSITION_MAP[target.position].label} · {target.personality} · {target.squadRole}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Bar value={target.morale} className="flex-1" />
                  <span className="text-[11px] text-white/50">{moraleLabel(target.morale)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {(Object.keys(CHAT_META) as ChatKind[]).map((k) => {
                const chance = chatSuccessChance(target, k, club);
                return (
                  <button key={k} onClick={() => doChat(k)} disabled={busy === k}
                          className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-ink-900/40 p-3 text-left transition hover:border-turf-500/40 disabled:opacity-50">
                    <span className="text-xl">{CHAT_META[k].icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{CHAT_META[k].label}</p>
                      <p className="text-[11px] text-white/40">{CHAT_META[k].desc}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold ${chance >= 70 ? "text-emerald-600" : chance >= 45 ? "text-amber-600" : "text-rose-500"}`}>
                        {chance}%
                      </p>
                      <p className="text-[9px] uppercase text-white/30">éxito</p>
                    </div>
                    {busy === k && <Loader2 size={14} className="animate-spin" />}
                  </button>
                );
              })}
            </div>

            <p className="rounded-lg bg-white/4 px-3 py-2 text-[11px] text-white/45">
              La probabilidad depende de su <b>personalidad</b> ({target.personality}), su moral actual y la reputación
              del club. Tras hablar tendrás que esperar antes de volver a hacerlo.
            </p>
          </div>
        )}
      </Modal>

      {/* ------------------ RESULTADO DE PRENSA ------------------ */}
      <Modal open={!!pressResult} onClose={() => setPressResult(null)} title="Titulares de la rueda de prensa">
        {pressResult && (
          <div className="space-y-3">
            {pressResult.map((r, i) => (
              <p key={i} className="rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white/60">{r}</p>
            ))}
            <Button className="w-full" onClick={() => setPressResult(null)}>Entendido</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
