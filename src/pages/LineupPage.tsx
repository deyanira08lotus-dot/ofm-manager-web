/**
 * src/pages/LineupPage.tsx — editor de alineación (campo interactivo) y tácticas.
 */
import { useMemo, useState } from "react";
import { ArrowLeftRight, BarChart3, Check, Save, Shield, Sparkles, Wand2 } from "lucide-react";
import { Badge, Button, Card, Modal, Rating, Select } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { FORMATIONS, GROUP_COLORS, POSITION_MAP } from "@/game/data/traits";
import { resolveLineup, teamChemistry, teamPower } from "@/game/match";
import { countryFlag } from "@/game/data/countries";
import { moraleLabel } from "@/game/format";
import type { Player, Tactics } from "@/types";

/** Coordenadas (x%, y%) de cada hueco sobre el campo */
const SLOT_POS: Record<string, Record<string, [number, number]>> = {
  "4-3-3": { GK: [50, 91], LB: [14, 71], CB1: [37, 76], CB2: [63, 76], RB: [86, 71], DM: [50, 57], CM1: [28, 45], CM2: [72, 45], LW: [17, 22], ST: [50, 13], RW: [83, 22] },
  "4-4-2": { GK: [50, 91], LB: [13, 72], CB1: [37, 77], CB2: [63, 77], RB: [87, 72], LM: [14, 46], CM1: [38, 50], CM2: [62, 50], RM: [86, 46], ST1: [37, 16], ST2: [63, 16] },
  "4-2-3-1": { GK: [50, 91], LB: [13, 72], CB1: [37, 77], CB2: [63, 77], RB: [87, 72], DM1: [36, 58], DM2: [64, 58], LW: [15, 33], AM: [50, 36], RW: [85, 33], ST: [50, 13] },
  "3-5-2": { GK: [50, 91], CB1: [28, 78], CB2: [50, 80], CB3: [72, 78], LM: [10, 50], DM: [50, 60], CM1: [33, 46], CM2: [67, 46], RM: [90, 50], ST1: [37, 16], ST2: [63, 16] },
  "5-3-2": { GK: [50, 91], LB: [10, 66], CB1: [30, 79], CB2: [50, 82], CB3: [70, 79], RB: [90, 66], CM1: [30, 48], CM2: [50, 54], CM3: [70, 48], ST1: [37, 17], ST2: [63, 17] },
};

export default function LineupPage() {
  const { club, players, staff, saveTactics } = useGame();
  const [draft, setDraft] = useState<Tactics | null>(club ? { ...club.tactics } : null);
  const [picking, setPicking] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);

  const tactics = draft ?? club?.tactics;
  const slots = tactics ? FORMATIONS[tactics.formation] ?? FORMATIONS["4-3-3"] : [];
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const { starters, bench } = useMemo(
    () => (tactics ? resolveLineup(tactics, players) : { starters: [], bench: [] }),
    [tactics, players]
  );

  const displayBench = useMemo(
    () => (tactics ? (tactics.bench ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p) : []),
    [tactics, byId]
  );

  const power = useMemo(() => {
    if (!tactics || !club) return null;
    const coach = staff.find((s) => s.role === "Entrenador principal");
    return teamPower(
      {
        clubId: club.id, name: club.name, short: club.shortName, colors: club.colors,
        starters, bench, tactics, coachLevel: coach?.level ?? 50, isUser: true,
      },
      0
    );
  }, [tactics, club, staff, starters, bench]);

  if (!club || !tactics) return null;

  const set = (patch: Partial<Tactics>) => {
    setDraft({ ...tactics, ...patch });
    setSaved(false);
  };

  const assign = (slot: string, playerId: string | null) => {
    const lineup = { ...tactics.lineup };
    // Si el jugador ya estaba en otro hueco, intercambiar
    const prevSlot = Object.keys(lineup).find((s) => lineup[s] === playerId && s !== slot);
    if (prevSlot) lineup[prevSlot] = tactics.lineup[slot] ?? null;
    lineup[slot] = playerId;
    set({ lineup });
    setPicking(null);
  };

  const removeFromBench = (playerId: string) => {
    set({ bench: displayBench.filter((b) => b.id !== playerId).map((b) => b.id) });
  };

  const addToBench = (playerId: string) => {
    if (displayBench.length === 0) {
      set({ bench: [playerId] });
      return;
    }
    setSwapTarget(playerId);
  };

  const confirmSwap = (outId: string) => {
    if (!swapTarget) return;
    const newBenchIds = displayBench.filter((b) => b.id !== outId).map((b) => b.id);
    newBenchIds.push(swapTarget);
    set({ bench: newBenchIds });
    setSwapTarget(null);
  };

  const autoFill = () => {
    const used = new Set<string>();
    const lineup: Record<string, string | null> = {};
    const want: Record<string, string[]> = {
      GK: ["GK"], LB: ["LB", "CB"], RB: ["RB", "CB"], CB1: ["CB"], CB2: ["CB"], CB3: ["CB"],
      DM: ["DM", "CM"], DM1: ["DM", "CM"], DM2: ["DM", "CM"], CM1: ["CM", "AM"], CM2: ["CM", "DM"], CM3: ["CM"],
      LM: ["LW", "CM"], RM: ["RW", "CM"], AM: ["AM", "CM"],
      LW: ["LW", "AM", "ST"], RW: ["RW", "AM", "ST"], ST: ["ST", "AM"], ST1: ["ST"], ST2: ["ST", "AM"],
    };
    const fit = players.filter((p) => !p.injury || p.injury.daysOut <= 0);
    for (const slot of slots) {
      const prefs = want[slot] ?? [];
      let best: Player | undefined;
      for (const pref of prefs) {
        best = fit
          .filter((p) => !used.has(p.id) && (p.position === pref || p.secondaryPositions.includes(pref as never)))
          .sort((a, b) => b.overall * (0.8 + b.form / 400) - a.overall * (0.8 + a.form / 400))[0];
        if (best) break;
      }
      if (!best) best = fit.filter((p) => !used.has(p.id)).sort((a, b) => b.overall - a.overall)[0];
      if (best) { used.add(best.id); lineup[slot] = best.id; }
    }
    const benchIds = fit.filter((p) => !used.has(p.id)).sort((a, b) => b.overall - a.overall).slice(0, 7).map((p) => p.id);
    set({ lineup, bench: benchIds });
  };

  const save = async () => {
    await saveTactics({ ...tactics, bench: displayBench.map((p) => p.id) });
    setSaved(true);
  };

  const chem = teamChemistry(starters);
  const missing = slots.filter((s) => !tactics.lineup[s] || !byId.has(tactics.lineup[s]!)).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Alineación y táctica</h1>
          <p className="text-sm text-white/45">
            {starters.length}/11 titulares · {displayBench.length} en el banquillo · Química {chem}%
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={autoFill}><Wand2 size={15} /> Auto</Button>
          <Button onClick={save}>{saved ? <Check size={15} /> : <Save size={15} />} {saved ? "Guardado" : "Guardar"}</Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        {/* Campo */}
        <Card dense className="overflow-hidden">
          <div
            className="relative aspect-[3/4] w-full sm:aspect-[4/3]"
            style={{
              background:
                "repeating-linear-gradient(180deg, #179163 0 8%, #14875a 8% 16%)",
            }}
          >
            {/* Líneas del campo */}
            <div className="pointer-events-none absolute inset-3 rounded-lg border-2 border-[rgba(255,255,255,0.45)]" />
            <div className="pointer-events-none absolute left-1/2 top-3 h-[calc(100%-1.5rem)] w-px -translate-x-1/2 bg-[rgba(255,255,255,0.4)]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgba(255,255,255,0.4)]" />
            <div className="pointer-events-none absolute bottom-3 left-1/2 h-[14%] w-[45%] -translate-x-1/2 border-2 border-b-0 border-[rgba(255,255,255,0.4)]" />
            <div className="pointer-events-none absolute top-3 left-1/2 h-[14%] w-[45%] -translate-x-1/2 border-2 border-t-0 border-[rgba(255,255,255,0.4)]" />

            {slots.map((slot) => {
              const pos = SLOT_POS[tactics.formation]?.[slot] ?? [50, 50];
              const pid = tactics.lineup[slot];
              const p = pid ? byId.get(pid) : undefined;
              return (
                <button
                  key={slot}
                    onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPicking(slot)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition active:scale-95"
                  style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-xs font-black shadow-lg sm:h-12 sm:w-12 ${
                    p ? "border-[rgba(255,255,255,0.85)] text-[#fff]" : "border-dashed border-[rgba(255,255,255,0.6)] bg-[rgba(6,42,28,0.35)] text-[rgba(255,255,255,0.75)]"}`}
                    style={p ? { background: `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})` } : undefined}>
                    {p ? Math.round(p.overall) : slot.replace(/\d/, "")}
                  </div>
                  {p && (
                    <span className="mt-0.5 rounded bg-[rgba(6,42,28,0.72)] px-1 text-[9px] font-bold leading-tight text-[#fff]">
                      {POSITION_MAP[p.position].short}
                    </span>
                  )}
                  <div className="mt-1 w-20 -translate-x-1/2 text-center" style={{ marginLeft: "50%" }}>
                    <p className="truncate rounded bg-[rgba(6,42,28,0.72)] px-1 text-[10px] font-medium text-[#fff]">
                      {p ? p.name.split(" ").slice(-1)[0] : slot}
                    </p>
                    {p?.injury && <p className="rounded text-[9px] font-semibold text-[#fecdd3]">lesionado</p>}
                      {p && !p.injury && (
                        <p className="rounded text-[9px] font-semibold" style={{ color: p.fitness >= 70 ? "#86efac" : p.fitness >= 40 ? "#fde68a" : "#fca5a5" }}>
                          Físico {Math.round(p.fitness)}%
                        </p>
                      )}
                  </div>
                </button>
              );
            })}
          </div>
          {missing > 0 && (
            <p className="border-t border-white/6 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
              Hay {missing} puesto(s) sin asignar: se completarán automáticamente con los mejores disponibles.
            </p>
          )}
        </Card>

        <div className="space-y-5">
          {/* Fuerza del equipo */}
          <Card title="Fuerza del once" subtitle="Calculada con forma, moral, físico, química y entrenador">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Ataque", power?.att ?? 0],
                ["Medio", power?.mid ?? 0],
                ["Defensa", power?.def ?? 0],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white/5 p-3">
                  <p className="text-2xl font-black text-turf-300">{Math.round(v as number)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">{k}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/4 p-2">
                <p className="text-white/40">Química del once</p>
                <p className="font-bold">{chem}%</p>
              </div>
              <div className="rounded-lg bg-white/4 p-2">
                <p className="text-white/40">Moral media</p>
                <p className="font-bold">{moraleLabel(starters.reduce((s, p) => s + p.morale, 0) / Math.max(1, starters.length))}</p>
              </div>
            </div>
          </Card>

          {/* Tácticas */}
          <Card title="Instrucciones tácticas">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Formación" value={tactics.formation} onChange={(e) => set({ formation: e.target.value, lineup: {} })}>
                  {Object.keys(FORMATIONS).map((f) => <option key={f}>{f}</option>)}
                </Select>
                <Select label="Mentalidad" value={tactics.mentality} onChange={(e) => set({ mentality: e.target.value as Tactics["mentality"] })}>
                  {["Muy defensiva", "Defensiva", "Equilibrada", "Ofensiva", "Muy ofensiva"].map((m) => <option key={m}>{m}</option>)}
                </Select>
              </div>
              {([
                ["tempo", "Ritmo de juego", "Pausado", "Frenético"],
                ["pressing", "Presión", "Bloque bajo", "Presión alta"],
                ["width", "Amplitud", "Estrecho", "Muy abierto"],
              ] as const).map(([key, label, lo, hi]) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/50">{label}</span>
                    <span className="font-semibold">{tactics[key]}</span>
                  </div>
                  <input type="range" min={0} max={100} value={tactics[key]}
                         onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Tactics>)}
                         className="w-full accent-emerald-500" />
                  <div className="flex justify-between text-[10px] text-white/25"><span>{lo}</span><span>{hi}</span></div>
                </div>
              ))}
              <Select label="Estilo de pase" value={tactics.passingStyle} onChange={(e) => set({ passingStyle: e.target.value as Tactics["passingStyle"] })}>
                {["Corto", "Mixto", "Directo"].map((s) => <option key={s}>{s}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Capitán" value={tactics.captainId ?? ""} onChange={(e) => set({ captainId: e.target.value || null })}>
                  <option value="">Automático</option>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Select label="Lanzador de penaltis" value={tactics.penaltyTakerId ?? ""} onChange={(e) => set({ penaltyTakerId: e.target.value || null })}>
                  <option value="">Automático</option>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            </div>
          </Card>

          {/* Banquillo */}
          <Card title="Banquillo" subtitle="Los cambios se hacen automáticamente durante el partido">
            <div className="space-y-1.5">
              {displayBench.map((p) => (
                <button key={p.id} onClick={() => removeFromBench(p.id)} className="flex w-full items-center gap-2.5 rounded-lg bg-white/4 px-2.5 py-1.5 text-left transition hover:bg-rose-500/10" title="Sacar del banco">
                  <Rating value={p.overall} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{countryFlag(p.nationality)} {p.name}</span>
                  <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                  <span className="w-9 text-right text-[11px] text-white/40">{Math.round(p.fitness)}%</span>
                </button>
              ))}
              {!displayBench.length && <p className="py-3 text-center text-xs text-white/35">Sin suplentes disponibles.</p>}
            </div>
          </Card>
        </div>
      </div>

      {/* Resto del plantel */}
              <Card title="Resto del plantel" subtitle="Jugadores fuera del banco actual — tocá un puesto en el campo para convocarlos">
                <div className="space-y-1.5">
                  {players
                    .filter((p) => !starters.some((s) => s.id === p.id) && !displayBench.some((b) => b.id === p.id))
                    .sort((a, b) => b.overall - a.overall)
                    .map((p) => (
                      <button key={p.id} onClick={() => addToBench(p.id)} className="flex w-full items-center gap-2.5 rounded-lg bg-white/4 px-2.5 py-1.5 text-left transition hover:bg-turf-500/10" title="Meter al banco">
                        <Rating value={p.overall} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{countryFlag(p.nationality)} {p.name}</span>
                        <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                        <span className="w-9 text-right text-[11px]" style={{ color: p.fitness >= 70 ? "#86efac" : p.fitness >= 40 ? "#fde68a" : "#fca5a5" }}>{Math.round(p.fitness)}%</span>
                      </button>
                    ))}
                  {players.filter((p) => !starters.some((s) => s.id === p.id) && !displayBench.some((b) => b.id === p.id)).length === 0 && (
                    <p className="py-3 text-center text-xs text-white/35">No hay jugadores fuera del 11 y el banquillo.</p>
                  )}
                </div>
              </Card>

              {/* Selector de jugador */}
      <Modal open={!!picking} onClose={() => { setPicking(null); setCompareId(null); }} title={`Elegir jugador para ${picking ?? ""}`} wide>
        <div className="mb-3 flex items-center gap-2 text-xs text-white/45">
          <ArrowLeftRight size={13} /> Si eliges a un titular de otro puesto, se intercambian automáticamente.
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[...players]
            .sort((a, b) => b.overall - a.overall)
            .map((p) => {
              const inLineup = Object.values(tactics.lineup).includes(p.id);
              return (
                      <div key={p.id}>
                        <div className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                          inLineup ? "border-turf-500/40 bg-turf-500/10" : "border-white/8 bg-ink-850 hover:border-white/20"}`}>
                          <button onClick={() => assign(picking!, p.id)} className="flex flex-1 items-center gap-3 text-left">
                            <Rating value={p.overall} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{countryFlag(p.nationality)} {p.name}</p>
                              <p className="text-[11px] text-white/40">
                                {POSITION_MAP[p.position].short}
                                {p.secondaryPositions.length ? ` · ${p.secondaryPositions.map((s) => POSITION_MAP[s].short).join("/")}` : ""}
                                {" · "}Físico {Math.round(p.fitness)}%
                              </p>
                            </div>
                          </button>
                          {p.injury ? <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-300">Lesión</Badge> : inLineup ? <Check size={15} className="text-turf-400" /> : null}
                          <button
                            onClick={(e) => { e.stopPropagation(); setCompareId(compareId === p.id ? null : p.id); }}
                            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
                            title="Ver stats"
                          >
                            <BarChart3 size={15} />
                          </button>
                        </div>
                        {compareId === p.id && (() => {
                          const current = picking ? byId.get(tactics.lineup[picking] ?? "") : undefined;
                          const isGK = p.position === "GK";
                          const rows: [string, string][] = isGK
                            ? [["reflexes", "Reflejos"], ["handling", "Atajada"], ["aerialReach", "Salida aérea"], ["kicking", "Saque"], ["oneOnOne", "Uno contra uno"], ["communication", "Comunicación"]]
                            : [["pace", "Velocidad"], ["acceleration", "Aceleración"], ["dribbling", "Regate"], ["finishing", "Disparo"], ["passing", "Pases"], ["heading", "Cabeceo"], ["jumping", "Salto"], ["stamina", "Resistencia"]];
                          return (
                            <div className="mt-2 rounded-xl border border-white/10 bg-ink-850 p-3 text-xs">
                              <div className="mb-2 grid grid-cols-2 gap-2 text-white/50">
                                <span>{current ? current.name : "Vacío"}</span>
                                <span className="text-right">{p.name}</span>
                              </div>
                              <div className="mb-2 grid grid-cols-2 gap-2 font-semibold">
                                <span>{current ? current.overall : "-"}</span>
                                <span className="text-right">{p.overall}</span>
                              </div>
                              <div className="mb-2 grid grid-cols-2 gap-2 text-white/50">
                                <span>Edad {current ? current.age : "-"} · Físico {current ? Math.round(current.fitness) : "-"}%</span>
                                <span className="text-right">Edad {p.age} · Físico {Math.round(p.fitness)}%</span>
                              </div>
                              {rows.map(([key, label]) => (
                                <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-0.5">
                                  <span>{current ? (current.attributes as any)[key] : "-"}</span>
                                  <span className="text-center text-white/30">{label}</span>
                                  <span className="text-right">{(p.attributes as any)[key]}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
        </div>
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" onClick={() => assign(picking!, null)}>Vaciar puesto</Button>
          <Button variant="outline" onClick={() => { setPicking(null); setCompareId(null); }}>Cerrar</Button>
        </div>
      </Modal>

      {/* Elegir a quién reemplazar en el banco */}
      <Modal open={!!swapTarget} onClose={() => setSwapTarget(null)} title={`Elegir a quién sacar por ${swapTarget ? byId.get(swapTarget)?.name ?? "" : ""}`}>
        <div className="space-y-1.5">
          {displayBench.map((p) => (
            <button
              key={p.id}
              onClick={() => confirmSwap(p.id)}
              className="flex w-full items-center gap-2.5 rounded-lg bg-white/4 px-2.5 py-1.5 text-left transition hover:bg-turf-500/10"
            >
              <Rating value={p.overall} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{countryFlag(p.nationality)} {p.name}</span>
              <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setSwapTarget(null)}>Cancelar</Button>
        </div>
      </Modal>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-white/25">
        <Shield size={12} /> La táctica se guarda en tu club y la usa el simulador · <Sparkles size={12} /> FASE 2
      </p>
    </div>
  );
}
