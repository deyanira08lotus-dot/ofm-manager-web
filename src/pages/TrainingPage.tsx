/**
 * src/pages/TrainingPage.tsx — plan de entrenamiento semanal y estado físico.
 */
import { useState } from "react";
import { Activity, Check, Dumbbell, HeartPulse, Save, Zap } from "lucide-react";
import { Bar, Button, Card, Rating, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { ATTRIBUTE_LABELS, GROUP_COLORS, POSITION_MAP } from "@/game/data/traits";
import { formLabel, moraleLabel } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import type { AttributeKey } from "@/types";

const FOCUS = [
  { key: "General", desc: "Reparto equilibrado entre todas las áreas.", icon: "⚖️" },
  { key: "Defensa", desc: "Marcaje, entradas y colocación defensiva.", icon: "🛡️" },
  { key: "Ataque", desc: "Definición, desmarques y último pase.", icon: "🎯" },
  { key: "Posesión", desc: "Pase, control y visión de juego.", icon: "🔄" },
  { key: "Físico", desc: "Resistencia, fuerza y velocidad.", icon: "💪" },
  { key: "Balón parado", desc: "Córners, faltas y penaltis.", icon: "🥅" },
  { key: "Porteros", desc: "Reflejos, blocaje y juego con los pies.", icon: "🧤" },
];

export default function TrainingPage() {
  const { club, players, staff, staffEffects, saveTraining, setPlayerTraining } = useGame();
  const [draft, setDraft] = useState(club ? { ...club.training } : { intensity: 55, focus: "General" });
  const [saved, setSaved] = useState(false);
  if (!club) return null;

  const fitnessCoach = staff.find((s) => s.role === "Preparador físico");
  const trainingLevel = club.facilities.trainingGround?.level ?? 1;
  const medicalLevel = club.facilities.medical?.level ?? 1;

  const avg = (fn: (p: (typeof players)[number]) => number) =>
    players.length ? players.reduce((s, p) => s + fn(p), 0) / players.length : 0;

  const injured = players.filter((p) => p.injury && p.injury.daysOut > 0);
  const tired = [...players].sort((a, b) => a.fitness - b.fitness).slice(0, 5);

  const save = async () => {
    await saveTraining(draft);
    setSaved(true);
  };

  // El cuerpo técnico (FASE 7) influye directamente en riesgo y progresión
  const injuryRisk = Math.max(3, Math.round(draft.intensity * 0.28 - medicalLevel * 1.6 - staffEffects.injuryReduction));
  const growthBonus = Math.round(draft.intensity * 0.22 + trainingLevel * 3.4 + staffEffects.trainingBonus);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Entrenamiento</h1>
          <p className="text-sm text-white/45">El plan se aplica en el procesado diario del servidor y antes de cada partido</p>
        </div>
        <Button onClick={save}>{saved ? <Check size={15} /> : <Save size={15} />} {saved ? "Plan guardado" : "Guardar plan"}</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Condición media" value={`${Math.round(avg((p) => p.fitness))}%`} icon={<HeartPulse size={15} />} tone={avg((p) => p.fitness) > 80 ? "good" : "warn"} />
        <StatTile label="Forma media" value={formLabel(avg((p) => p.form))} sub={`${Math.round(avg((p) => p.form))}/100`} icon={<Zap size={15} />} />
        <StatTile label="Moral media" value={moraleLabel(avg((p) => p.morale))} sub={`${Math.round(avg((p) => p.morale))}/100`} icon={<Activity size={15} />} />
        <StatTile label="Lesionados" value={injured.length} sub={injured.length ? injured[0].name : "Plantilla sana"} tone={injured.length ? "bad" : "good"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card title="Plan semanal" subtitle={`Campo de entrenamiento nivel ${trainingLevel} · Preparador ${fitnessCoach?.name ?? "—"} (${fitnessCoach?.level ?? "-"})`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FOCUS.map((f) => (
              <button key={f.key} onClick={() => { setDraft({ ...draft, focus: f.key }); setSaved(false); }}
                      className={`rounded-xl border p-3 text-left transition ${
                        draft.focus === f.key ? "border-turf-500/60 bg-turf-500/10" : "border-white/8 bg-ink-900/50 hover:border-white/20"}`}>
                <span className="text-lg">{f.icon}</span>
                <p className="mt-1 text-sm font-semibold">{f.key}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/40">{f.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-white/50">Intensidad</span>
              <span className="font-semibold">{draft.intensity}%</span>
            </div>
            <input type="range" min={10} max={100} value={draft.intensity}
                   onChange={(e) => { setDraft({ ...draft, intensity: Number(e.target.value) }); setSaved(false); }}
                   className="w-full accent-emerald-500" />
            <div className="flex justify-between text-[10px] text-white/25"><span>Recuperación</span><span>Máxima exigencia</span></div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/8 bg-ink-900/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Progresión estimada</p>
              <p className="text-lg font-black text-emerald-300">+{growthBonus}%</p>
              <Bar value={Math.min(100, growthBonus)} className="mt-2" />
              <p className="mt-1 text-[10px] text-white/35">Cuerpo técnico: +{staffEffects.trainingBonus.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-ink-900/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Riesgo de lesión</p>
              <p className={`text-lg font-black ${injuryRisk > 18 ? "text-rose-300" : injuryRisk > 10 ? "text-amber-300" : "text-emerald-300"}`}>{injuryRisk}%</p>
              <Bar value={injuryRisk} className="mt-2" />
              <p className="mt-1 text-[10px] text-white/35">Servicios médicos: -{staffEffects.injuryReduction.toFixed(1)}%</p>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Jugadores más cansados" subtitle="Considera rotarlos en el próximo partido">
            <div className="space-y-2">
              {tired.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Rating value={p.overall} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{countryFlag(p.nationality)} {p.name}</p>
                    <Bar value={p.fitness} className="mt-1" />
                  </div>
                  <span className={`w-10 text-right text-xs font-bold ${p.fitness < 60 ? "text-rose-300" : "text-white/60"}`}>{Math.round(p.fitness)}%</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Enfermería" subtitle={`Centro médico nivel ${medicalLevel}`}>
            {injured.length ? (
              <div className="space-y-2">
                {injured.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-rose-500/10 px-3 py-2">
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs text-rose-200">{p.injury?.name} · {p.injury?.daysOut} días</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-3 text-center text-sm text-white/40">Ningún jugador lesionado. 💪</p>
            )}
          </Card>
        </div>
      </div>

      <Card dense title="Entrenamiento individual" subtitle="Atributo prioritario de cada jugador">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                <th className="px-4 py-3 text-left">Jugador</th>
                <th className="px-2 py-3 text-left">Pos.</th>
                <th className="px-2 py-3 text-center">Nivel</th>
                <th className="px-2 py-3 text-center">Pot.</th>
                <th className="px-2 py-3 text-left">Físico</th>
                <th className="px-4 py-3 text-left">Foco de entrenamiento</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-b border-white/4">
                  <td className="px-4 py-2 font-medium">{countryFlag(p.nationality)} {p.name}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${GROUP_COLORS[POSITION_MAP[p.position].group]}`}>
                      {POSITION_MAP[p.position].short}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center font-bold text-turf-300">{Math.round(p.overall)}</td>
                  <td className="px-2 py-2 text-center text-white/50">{p.potential}</td>
                  <td className="px-2 py-2"><Bar value={p.fitness} className="w-20" /></td>
                  <td className="px-4 py-2">
                    <Select value={p.trainingFocus ?? ""} className="h-9 py-1 text-xs"
                            onChange={(e) => setPlayerTraining(p.id, e.target.value || null, p.squadRole)}>
                      <option value="">General</option>
                      {(Object.keys(ATTRIBUTE_LABELS) as AttributeKey[]).map((k) => (
                        <option key={k} value={k}>{ATTRIBUTE_LABELS[k]}</option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 border-t border-white/6 px-4 py-3 text-xs text-white/35">
          <Dumbbell size={12} /> Los jóvenes con mucho potencial progresan más rápido; a partir de los 30 años el rendimiento empieza a decaer.
        </p>
      </Card>
    </div>
  );
}
