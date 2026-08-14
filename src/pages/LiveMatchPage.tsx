/**
 * src/pages/LiveMatchPage.tsx — Dirección de partido en vivo (FASE 16).
 * El banquillo: cambios, ajustes tácticos y lectura del encuentro.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft, Check, ChevronsRight, Flag, Gauge, Loader2, Megaphone, Pause, Play, Radio, Timer, Zap,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Modal, Select } from "@/components/ui";
import { MatchPitch } from "@/components/MatchPitch";
import { useGame } from "@/state/GameContext";
import { POSITION_MAP } from "@/game/data/traits";
import {
  benchPlayers, conditionOf, dugoutAdvice, MAX_ADJUSTMENTS, MAX_SUBS, momentumLabel,
  onPitchPlayers, type LivePlayerState,
} from "@/game/livematch";
import { navigate } from "@/lib/router";
import type { Tactics } from "@/types";

const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "😖", card: "🟨", sub: "🔄", injury: "🚑", info: "📣",
};

export default function LiveMatchPage() {
  const {
    liveMatch, advanceLiveMatch, liveSubstitution, liveTacticChange, finishLiveMatch, abandonLiveMatch,
  } = useGame();

  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [subOut, setSubOut] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const lastEventCount = useRef(0);
  const lastMatchId = useRef<string | null>(null);

  const SPEED_DELAYS: Record<typeof speed, { quiet: number; event: number }> = {
    slow: { quiet: 1500, event: 3200 },
    normal: { quiet: 900, event: 2100 },
    fast: { quiet: 320, event: 850 },
  };

  // Al empezar un partido nuevo, reinicia el contador de eventos ya vistos
  useEffect(() => {
    if (liveMatch && liveMatch.id !== lastMatchId.current) {
      lastMatchId.current = liveMatch.id;
      lastEventCount.current = liveMatch.events.length;
    }
  }, [liveMatch]);

  // Reproducción automática: ritmo variable, como en Hattrick/PowerPlay Manager.
  // Los minutos sin nada relevante pasan rápido; cuando ocurre un evento
  // (gol, ocasión, tarjeta...) el motor hace una pausa más larga para poder
  // disfrutarlo antes de seguir.
  useEffect(() => {
    if (!auto || !liveMatch || liveMatch.finished) return;
    const hadNewEvent = liveMatch.events.length > lastEventCount.current;
    lastEventCount.current = liveMatch.events.length;
    const delays = SPEED_DELAYS[speed];
    const delay = hadNewEvent ? delays.event : delays.quiet;
    timer.current = window.setTimeout(() => advanceLiveMatch(liveMatch.minute + 1), delay);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, liveMatch, advanceLiveMatch, speed]);

  useEffect(() => {
    if (liveMatch?.finished) setAuto(false);
  }, [liveMatch?.finished]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [liveMatch?.minute]);

  const advice = useMemo(() => (liveMatch ? dugoutAdvice(liveMatch) : []), [liveMatch]);

  if (!liveMatch) {
    return (
      <EmptyState
        icon={<Radio />}
        title="No hay ningún partido en directo"
        text="Ve a la sección Liga y elige «Dirigir en directo» para sentarte en el banquillo."
        action={<Button className="mt-3" onClick={() => navigate("/liga")}>Ir a la Liga</Button>}
      />
    );
  }

  const us = liveMatch.userSide;
  const pitch = onPitchPlayers(liveMatch, us);
  const bench = benchPlayers(liveMatch, us);
  const tactics = liveMatch.teams[us].tactics;
  const shown = [...liveMatch.events].reverse();
  const subsLeft = MAX_SUBS - liveMatch.subsUsed[us];
  const adjLeft = MAX_ADJUSTMENTS - liveMatch.adjustments;
  const outPlayer = subOut ? liveMatch.squads[us][subOut] : null;

  function doSub(inId: string) {
    if (!subOut) return;
    const err = liveSubstitution(subOut, inId);
    setMsg(err ? { text: err, ok: false } : { text: "Cambio realizado.", ok: true });
    setSubOut(null);
  }

  function doTactic(patch: Partial<Tactics>) {
    const err = liveTacticChange(patch);
    setMsg(err ? { text: err, ok: false } : { text: "Instrucción transmitida al campo.", ok: true });
  }

  async function finish() {
    setBusy(true);
    try {
      const res = await finishLiveMatch();
      if (res) navigate("/partido");
    } finally { setBusy(false); }
  }

  const PlayerRow = ({ s, action }: { s: LivePlayerState; action?: React.ReactNode }) => {
    const cond = conditionOf(s);
    return (
      <div className="flex items-center gap-2 rounded-lg bg-white/4 px-2.5 py-1.5">
        <span className="w-8 shrink-0 text-[10px] font-semibold text-white/40">
          {POSITION_MAP[s.player.position]?.short ?? s.player.position}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {s.player.name}
          {s.goals > 0 && <span className="ml-1">{"⚽".repeat(Math.min(3, s.goals))}</span>}
          {s.yellow > 0 && <span className="ml-1">🟨</span>}
          {s.red > 0 && <span className="ml-1">🟥</span>}
        </span>
        <div className="w-14 shrink-0">
          <Bar value={cond} />
        </div>
        <span className={`w-8 shrink-0 text-right text-[11px] font-bold ${cond < 45 ? "text-rose-500" : cond < 65 ? "text-amber-600" : "text-white/50"}`}>
          {Math.round(cond)}%
        </span>
        {action}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Marcador */}
      <div className="overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-ink-850 to-ink-900/80 shadow-[0_6px_18px_-12px_rgba(22,32,46,0.3)]">
        <div className="px-4 py-2.5 text-center text-[11px] uppercase tracking-widest text-white/35">
          {liveMatch.competition} · {liveMatch.finished ? "FINALIZADO" : "EN DIRECTO"}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-3">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-black text-[#fff] shadow-md"
                 style={{ background: `linear-gradient(135deg, ${liveMatch.teams.home.colors.primary}, ${liveMatch.teams.home.colors.secondary})` }}>
              {liveMatch.teams.home.short}
            </div>
            <p className="text-center text-xs font-semibold">{liveMatch.teams.home.name}</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black tabular-nums">{liveMatch.goals.home} - {liveMatch.goals.away}</p>
            <p className="mt-0.5 text-sm font-bold text-turf-300">{liveMatch.minute}'</p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-black text-[#fff] shadow-md"
                 style={{ background: `linear-gradient(135deg, ${liveMatch.teams.away.colors.primary}, ${liveMatch.teams.away.colors.secondary})` }}>
              {liveMatch.teams.away.short}
            </div>
            <p className="text-center text-xs font-semibold">{liveMatch.teams.away.name}</p>
          </div>
        </div>

        {/* Inercia del partido */}
        <div className="px-4 pb-3">
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-white/35">
            <span>Rival</span>
            <span className="font-bold text-white/60">{momentumLabel(liveMatch.momentum)}</span>
            <span>Nosotros</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-white/8">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
            <div
              className={`absolute inset-y-0 ${liveMatch.momentum >= 0 ? "bg-turf-500" : "bg-rose-500"}`}
              style={
                liveMatch.momentum >= 0
                  ? { left: "50%", width: `${Math.min(50, liveMatch.momentum / 2)}%` }
                  : { right: "50%", width: `${Math.min(50, Math.abs(liveMatch.momentum) / 2)}%` }
              }
            />
          </div>
        </div>

        <div className="h-1 w-full bg-white/6">
          <div className="h-full bg-turf-500 transition-all" style={{ width: `${(liveMatch.minute / 90) * 100}%` }} />
        </div>

        {/* Controles */}
        <div className="flex flex-wrap items-center justify-center gap-2 p-3">
          {!liveMatch.finished ? (
            <>
              <Button size="sm" variant={auto ? "subtle" : "primary"} onClick={() => setAuto((v) => !v)}>
                {auto ? <Pause size={14} /> : <Play size={14} />} {auto ? "Pausar" : "Reanudar"}
              </Button>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/4 p-1">
                <Gauge size={13} className="ml-1 text-white/35" />
                {([["slow", "Lento"], ["normal", "Normal"], ["fast", "Rápido"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setSpeed(key)}
                          className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                            speed === key ? "bg-turf-500 text-[#fff]" : "text-white/50 hover:text-white/80"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setAuto(false); advanceLiveMatch(liveMatch.minute + 5); }}>
                <ChevronsRight size={14} /> +5 min
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAuto(false); advanceLiveMatch(liveMatch.minute < 45 ? 45 : 90); }}>
                <Timer size={14} /> {liveMatch.minute < 45 ? "Al descanso" : "Al final"}
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={finish} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />} Confirmar resultado
            </Button>
          )}
        </div>
      </div>

      {/* Campo visual */}
      <MatchPitch state={liveMatch} />

      {msg && (
        <p className={`rounded-xl border px-4 py-2 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Banquillo */}
        <div className="space-y-4">
          <Card title="Sobre el campo" subtitle={`${pitch.length} jugadores · ${subsLeft} cambio(s) disponible(s)`}>
            <div className="space-y-1.5">
              {pitch.map((s) => (
                <PlayerRow key={s.player.id} s={s}
                  action={
                    !liveMatch.finished && subsLeft > 0 ? (
                      <button onClick={() => { setAuto(false); setSubOut(s.player.id); }}
                              className="shrink-0 rounded-md bg-white/10 px-1.5 py-1 text-[10px] font-semibold hover:bg-white/20">
                        <ArrowRightLeft size={11} />
                      </button>
                    ) : null
                  } />
              ))}
            </div>
          </Card>

          <Card title="Instrucciones desde el banquillo" subtitle={`${adjLeft} ajuste(s) restante(s)`}>
            <div className="space-y-3">
              <Select label="Mentalidad" value={tactics.mentality} disabled={liveMatch.finished || adjLeft <= 0}
                      onChange={(e) => doTactic({ mentality: e.target.value as Tactics["mentality"] })}>
                {["Muy defensiva", "Defensiva", "Equilibrada", "Ofensiva", "Muy ofensiva"].map((m) => <option key={m}>{m}</option>)}
              </Select>

              <div className="grid grid-cols-3 gap-2">
                {([
                  ["pressing", "Presión"],
                  ["tempo", "Ritmo"],
                  ["width", "Amplitud"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="rounded-xl bg-white/4 p-2 text-center">
                    <p className="text-[10px] uppercase text-white/35">{label}</p>
                    <p className="text-sm font-bold">{tactics[key]}</p>
                    <div className="mt-1 flex gap-1">
                      <button disabled={liveMatch.finished || adjLeft <= 0}
                              onClick={() => doTactic({ [key]: Math.max(0, tactics[key] - 15) } as Partial<Tactics>)}
                              className="flex-1 rounded bg-white/10 py-0.5 text-[11px] font-bold hover:bg-white/20 disabled:opacity-40">−</button>
                      <button disabled={liveMatch.finished || adjLeft <= 0}
                              onClick={() => doTactic({ [key]: Math.min(100, tactics[key] + 15) } as Partial<Tactics>)}
                              className="flex-1 rounded bg-white/10 py-0.5 text-[11px] font-bold hover:bg-white/20 disabled:opacity-40">+</button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-white/35">
                Cada instrucción cuenta como un ajuste y afecta al resto del partido de forma inmediata.
              </p>
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Megaphone size={15} /> Tu segundo entrenador</span>}>
            <div className="space-y-1.5">
              {advice.map((a, i) => (
                <p key={i} className={`rounded-lg px-3 py-2 text-xs ${
                  a.tone === "bad" ? "bg-rose-500/10 text-rose-600" :
                  a.tone === "warn" ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>
                  {a.text}
                </p>
              ))}
            </div>
          </Card>
        </div>

        {/* Narración y estadísticas */}
        <div className="space-y-4">
          <Card title="Narración" subtitle={`${liveMatch.events.length} eventos`}>
            <div ref={feedRef} className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {shown.map((e, i) => (
                <div key={i} className={`fm-fade flex gap-2.5 rounded-xl border p-2.5 ${
                  e.type === "goal" ? "border-turf-500/40 bg-turf-500/10" :
                  e.type === "card" ? "border-amber-500/25 bg-amber-500/8" :
                  e.type === "injury" ? "border-rose-500/25 bg-rose-500/8" : "border-white/6 bg-ink-900/40"}`}>
                  <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-white/40">{e.minute}'</span>
                  <span>{EVENT_ICON[e.type]}</span>
                  <p className="min-w-0 flex-1 text-sm text-white/65">{e.text}</p>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/35">{e.score[0]}-{e.score[1]}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Estadísticas">
            <div className="space-y-2.5">
              {([
                ["Posesión %", liveMatch.stats.home.possession, liveMatch.stats.away.possession],
                ["Remates", liveMatch.stats.home.shots, liveMatch.stats.away.shots],
                ["A puerta", liveMatch.stats.home.onTarget, liveMatch.stats.away.onTarget],
                ["xG", liveMatch.stats.home.xg, liveMatch.stats.away.xg],
                ["Córners", liveMatch.stats.home.corners, liveMatch.stats.away.corners],
                ["Faltas", liveMatch.stats.home.fouls, liveMatch.stats.away.fouls],
              ] as const).map(([label, h, a]) => {
                const total = (h as number) + (a as number) || 1;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold tabular-nums">{h}</span>
                      <span className="text-white/40">{label}</span>
                      <span className="font-semibold tabular-nums">{a}</span>
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div className="bg-turf-500" style={{ width: `${((h as number) / total) * 100}%` }} />
                      <div className="bg-sky-500/70" style={{ width: `${((a as number) / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {!liveMatch.finished && (
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-xs text-white/45">
                  ¿Prefieres no dirigir? Puedes saltar al final y confirmar el resultado.
                </p>
                <Button variant="ghost" size="sm" onClick={() => { abandonLiveMatch(); navigate("/liga"); }}>
                  Abandonar
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setAuto(false); advanceLiveMatch(90); }}>
                  <Zap size={13} /> Terminar ya
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Modal de cambio */}
      <Modal open={!!outPlayer} onClose={() => setSubOut(null)} title="Realizar cambio">
        {outPlayer && (
          <div className="space-y-4">
            <div className="rounded-xl bg-rose-500/8 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Sale del campo</p>
              <p className="font-bold">{outPlayer.player.name}</p>
              <p className="text-xs text-white/45">
                {POSITION_MAP[outPlayer.player.position].label} · {outPlayer.minutesPlayed}' jugados ·
                condición {Math.round(conditionOf(outPlayer))}%
              </p>
            </div>

            <div>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Elige el relevo</p>
              {bench.length === 0 ? (
                <p className="py-4 text-center text-sm text-white/40">No quedan suplentes disponibles.</p>
              ) : (
                <div className="space-y-1.5">
                  {bench.map((s) => (
                    <button key={s.player.id} onClick={() => doSub(s.player.id)}
                            className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-ink-900/40 p-2.5 text-left hover:border-turf-500/40">
                      <Badge className="border-white/10 bg-white/5 text-white/50">
                        {POSITION_MAP[s.player.position].short}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.player.name}</p>
                        <p className="text-[11px] text-white/40">
                          Nivel {Math.round(s.player.overall)} · {Math.round(s.player.fitness)}% de condición
                        </p>
                      </div>
                      <Check size={15} className="text-turf-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={() => setSubOut(null)}>Cancelar</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
