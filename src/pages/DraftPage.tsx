/**
 * src/pages/DraftPage.tsx — Draft juvenil bimensual (FASE 6).
 * Promesas de 15-16 años del país de la liga. Clases SS-D ocultas hasta el cierre.
 */
import { useMemo, useState } from "react";
import {
  CalendarClock, Check, Eye, EyeOff, Gavel, Loader2, ShieldQuestion, Sparkles, Trophy, Users,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Modal, Rating, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { CLASS_STYLE, money } from "@/game/format";
import { countryFlag, countryName } from "@/game/data/countries";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GROUP_COLORS, POSITION_MAP } from "@/game/data/traits";
import {
  CLASS_DESCRIPTION, CLASS_ODDS, DRAFT_PICKS_PER_USER, daysUntil, draftCanClose, draftNextDate,
} from "@/game/youth";
import { realTimeUntil } from "@/game/time";
import type { PlayerClass } from "@/types";

const GRADE_STYLE: Record<string, string> = {
  "Máxima prioridad": "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  Prioritario: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  Interesante: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  Seguimiento: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "Sin catalogar": "border-white/15 bg-white/5 text-white/45",
};

export default function DraftPage() {
  const { club, draft, pickProspect, unpickProspect, finishDraft } = useGame();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [result, setResult] = useState<{ signed: number; lost: string[] } | null>(null);

  const nextDraft = draftNextDate();
  const revealed = draft?.phase === "cerrado";

  const sorted = useMemo(() => {
    if (!draft) return [];
    if (!revealed) return draft.prospects;
    return [...draft.prospects].sort((a, b) => b.player.potential - a.player.potential);
  }, [draft, revealed]);

  if (!club || !draft) {
    return <EmptyState icon={<Gavel />} title="Draft no disponible" text="Recarga la aplicación para generar la clase de draft." />;
  }

  async function pick(id: string) {
    setMsg(null);
    const err = await pickProspect(id);
    if (err) setMsg({ text: err, ok: false });
  }

  async function close() {
    setBusy(true);
    try {
      const res = await finishDraft();
      if (res) setResult(res);
    } finally { setBusy(false); }
  }

  const picksLeft = DRAFT_PICKS_PER_USER - draft.userPicks.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Draft juvenil</h1>
          <p className="text-sm text-white/45">
            Promesas de 15-16 años de {countryFlag(draft.country)} {countryName(draft.country)} · Clase {draft.periodIndex}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowRules(true)}><ShieldQuestion size={15} /> Cómo funciona</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Estado" value={revealed ? "Cerrado" : "Abierto"} sub={revealed ? "Datos revelados" : "Datos ocultos"}
                  icon={revealed ? <Eye size={15} /> : <EyeOff size={15} />} tone={revealed ? "default" : "good"} />
        <StatTile label="Tu turno" value={`${draft.userPickPosition}º`} sub={`de ${draft.order.length} clubes`} icon={<Users size={15} />}
                  tone={draft.userPickPosition <= 3 ? "good" : draft.userPickPosition >= 9 ? "bad" : "warn"} />
        <StatTile label="Selecciones" value={`${draft.userPicks.length} / ${DRAFT_PICKS_PER_USER}`} sub={picksLeft ? `${picksLeft} disponible(s)` : "Completo"} />
        <StatTile label="Próximo draft" value={`${daysUntil(nextDraft)} días`} sub={`En ${realTimeUntil(nextDraft)} reales`} icon={<CalendarClock size={15} />} />
      </div>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      {/* Orden de elección */}
      <Card title="Sorteo del orden de elección" subtitle="Los clubes con turno anterior pueden llevarse a tus objetivos">
        <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
          {draft.order.map((o, i) => (
            <div key={o.clubId}
                 className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                   o.isUser ? "border-turf-500/50 bg-turf-500/12 font-bold text-turf-300" : "border-white/8 bg-ink-900/50 text-white/50"}`}>
              <span className="font-black opacity-50">{i + 1}</span>
              <span className="whitespace-nowrap">{o.clubName}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Acción principal */}
      {!revealed && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {picksLeft > 0
                  ? `Selecciona ${picksLeft} candidato(s) más y cierra el draft`
                  : "Ya tienes tus 2 candidatos: cierra el draft para revelar los datos"}
              </p>
              <p className="text-xs text-white/45">
                Al cerrar, la IA elige por orden de sorteo y se revelan nivel, potencial y clase reales de todos.
              </p>
            </div>
            <Button size="lg" onClick={close} disabled={busy || !draftCanClose(draft)}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Gavel size={16} />} Cerrar draft y revelar
            </Button>
          </div>
        </Card>
      )}

      {/* Candidatos */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((pr) => {
          const mine = draft.userPicks.includes(pr.id);
          const taken = pr.takenBy && pr.takenBy !== "user" && pr.takenBy !== club.name;
          const gotIt = revealed && pr.takenBy === club.name;
          return (
            <Card key={pr.id}
                  className={
                    gotIt ? "border-turf-500/50" :
                    mine && !revealed ? "border-turf-500/40" :
                    taken ? "opacity-55" : ""}>
              <div className="flex items-start gap-3">
                {revealed ? (
                  <PlayerAvatar seed={pr.player.seed} nationality={pr.nationality} age={pr.age} size={56} className="rounded-2xl border border-white/10" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <ShieldQuestion size={22} className="text-white/35" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-bold">{pr.name}</p>
                    {revealed && (
                      <span className={`rounded px-1.5 text-[10px] font-black ${CLASS_STYLE[pr.playerClass]}`}>{pr.playerClass}</span>
                    )}
                  </div>
                  <p className="text-xs text-white/45">{pr.age} años · {POSITION_MAP[pr.position].label}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge className={GROUP_COLORS[POSITION_MAP[pr.position].group]}>{POSITION_MAP[pr.position].short}</Badge>
                    {!revealed && <Badge className={GRADE_STYLE[pr.scoutGrade]}>{pr.scoutGrade}</Badge>}
                    {revealed && <Badge className="border-white/10 bg-white/5 text-white/50">{pr.player.personality}</Badge>}
                  </div>
                </div>
                {revealed && <Rating value={pr.player.overall} />}
              </div>

              {!revealed ? (
                <>
                  <div className="mt-3 rounded-xl border border-dashed border-white/12 bg-ink-900/50 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/35">
                      <EyeOff size={11} /> Datos ocultos hasta el cierre
                    </p>
                    <p className="mt-1.5 text-[11px] italic text-white/50">"{pr.hint}"</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg bg-white/5 p-1.5">
                        <p className="text-[9px] uppercase text-white/30">Nivel</p>
                        <p className="text-sm font-black text-white/25">??</p>
                      </div>
                      <div className="rounded-lg bg-white/5 p-1.5">
                        <p className="text-[9px] uppercase text-white/30">Clase</p>
                        <p className="text-sm font-black text-white/25">??</p>
                      </div>
                    </div>
                  </div>
                  {mine ? (
                    <Button variant="subtle" className="mt-3 w-full" size="sm" onClick={() => unpickProspect(pr.id)}>
                      <Check size={13} /> Seleccionado — quitar
                    </Button>
                  ) : (
                    <Button variant="outline" className="mt-3 w-full" size="sm" disabled={picksLeft <= 0}
                            onClick={() => pick(pr.id)}>
                      {picksLeft <= 0 ? "Sin selecciones disponibles" : "Seleccionar candidato"}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-white/45">Nivel actual</span>
                        <span className="font-bold">{pr.player.overall}</span>
                      </div>
                      <Bar value={pr.player.overall} />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-white/45">Potencial real</span>
                        <span className="font-bold text-turf-300">{pr.player.potential}</span>
                      </div>
                      <Bar value={pr.player.potential} />
                    </div>
                    <p className="text-[11px] text-white/40">{CLASS_DESCRIPTION[pr.playerClass as PlayerClass]}</p>
                  </div>
                  <p className={`mt-3 rounded-lg px-3 py-2 text-center text-xs font-semibold ${
                    gotIt ? "bg-turf-500/15 text-turf-300" : "bg-white/5 text-white/45"}`}>
                    {gotIt ? "✓ Fichado por tu club" : `Elegido por ${pr.takenBy ?? "nadie"}`}
                  </p>
                </>
              )}
            </Card>
          );
        })}
      </div>

      {/* Modal de reglas */}
      <Modal open={showRules} onClose={() => setShowRules(false)} title="Reglas del draft" wide>
        <div className="space-y-4">
          <ul className="space-y-2 text-sm text-white/60">
            {[
              "Se celebra cada 2 meses de juego (60 días).",
              `Solo participan jugadores de 15-16 años de ${countryName(draft.country)}, el país de tu liga.`,
              `Cada club selecciona ${DRAFT_PICKS_PER_USER} candidatos.`,
              "Durante el draft, nivel, potencial y clase están OCULTOS: solo dispones del informe del ojeador.",
              "Un sorteo determina el orden de elección; los clubes por delante pueden quitarte un objetivo.",
              "Al cerrar el draft se revelan todos los datos reales.",
              "Mejorar el Centro de análisis hace más fiables los informes previos.",
            ].map((t) => <li key={t} className="flex gap-2 rounded-lg bg-white/4 px-3 py-2"><span className="text-white/25">›</span>{t}</li>)}
          </ul>

          <div>
            <h4 className="mb-2 text-sm font-bold">Clases y probabilidad</h4>
            <div className="space-y-1.5">
              {(["SS", "S", "A", "B", "C", "D"] as PlayerClass[]).map((c) => (
                <div key={c} className="flex items-center gap-3 rounded-lg bg-white/4 px-3 py-2">
                  <span className={`w-9 rounded px-1.5 py-0.5 text-center text-[11px] font-black ${CLASS_STYLE[c]}`}>{c}</span>
                  <span className="min-w-0 flex-1 text-xs text-white/55">{CLASS_DESCRIPTION[c]}</span>
                  <span className="text-xs font-bold tabular-nums">{CLASS_ODDS[c]}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-white/40">
            <Sparkles size={12} className="mt-0.5 shrink-0 text-fuchsia-300" />
            Un SS aparece en menos del 0,5% de los casos: en una clase de 24 promesas, encontrar uno es un acontecimiento
            histórico para el club.
          </p>
        </div>
      </Modal>

      {/* Resultado del cierre */}
      <Modal open={!!result} onClose={() => setResult(null)} title="Resultado del draft">
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-turf-500/10 p-4">
              <Trophy size={24} className="text-turf-300" />
              <div>
                <p className="text-lg font-black">{result.signed} promesa(s) incorporada(s)</p>
                <p className="text-xs text-white/50">Ya forman parte de tu plantilla.</p>
              </div>
            </div>
            {result.lost.length > 0 && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                Perdiste a <b>{result.lost.join(", ")}</b> ante clubes con turno anterior en el sorteo.
              </p>
            )}
            <p className="text-xs text-white/45">
              Los datos reales de todos los candidatos ya son visibles: comprueba si acertaste con tus apuestas.
            </p>
            <Button className="w-full" onClick={() => setResult(null)}>Ver resultados</Button>
          </div>
        )}
      </Modal>

      <p className="pb-2 text-center text-[11px] text-white/25">
        Promesas ficticias generadas proceduralmente · Coste de ficha muy bajo ({money(300)}–{money(900)}/sem)
      </p>
    </div>
  );
}
