/**
 * src/pages/AcademyPage.tsx — Academia de cantera (FASE 5).
 * Cada mes de juego, 5 promesas de 15-18 años con informe de ojeador.
 */
import { useState } from "react";
import { CalendarClock, Check, GraduationCap, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money } from "@/game/format";
import { COUNTRIES, countryName } from "@/game/data/countries";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GROUP_COLORS, POSITION_MAP, POSITIONS } from "@/game/data/traits";
import {
  ACADEMY_MAX_PROMOTIONS, academyNextDate, academyUpkeep, daysUntil,
} from "@/game/youth";
import { SQUAD_MAX } from "@/game/market";
import { formatGameDate, realTimeUntil } from "@/game/time";
import type { PositionCode } from "@/types";

export default function AcademyPage() {
  const { club, players, academy, setAcademyPrefs, promoteYouth } = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  if (!club || !academy) {
    return <EmptyState icon={<GraduationCap />} title="Academia no disponible" text="Recarga la aplicación para inicializar tu cantera." />;
  }

  const level = club.facilities.academy?.level ?? 1;
  const analytics = club.facilities.analytics?.level ?? 1;
  const nextDate = academyNextDate();
  const slotsLeft = ACADEMY_MAX_PROMOTIONS - academy.promoted.length;

  async function promote(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const err = await promoteYouth(id);
      setMsg(err ? { text: err, ok: false } : { text: "Canterano incorporado al primer equipo.", ok: true });
    } finally { setBusy(null); }
  }

  async function changePrefs(country: string, position: string) {
    setBusy("prefs");
    try {
      await setAcademyPrefs({ country, position: position as PositionCode | "auto" });
      setMsg({ text: "Promoción regenerada con las nuevas preferencias.", ok: true });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Academia de jugadores</h1>
        <p className="text-sm text-white/45">
          Cada mes de juego la cantera presenta 5 promesas de 15 a 18 años.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Nivel de academia" value={`N${level}`} sub={`Coste ${money(academyUpkeep(level))}/sem`} icon={<GraduationCap size={15} />} />
        <StatTile label="Próxima promoción" value={`${daysUntil(nextDate)} días`} sub={`En ${realTimeUntil(nextDate)} reales`} icon={<CalendarClock size={15} />} />
        <StatTile label="Subidas disponibles" value={`${slotsLeft} / ${ACADEMY_MAX_PROMOTIONS}`} sub="Por promoción mensual" tone={slotsLeft ? "good" : "warn"} />
        <StatTile label="Canteranos formados" value={academy.graduatesTotal} sub={`Plantilla ${players.length}/${SQUAD_MAX}`} icon={<TrendingUp size={15} />} />
      </div>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <Card title="Enfoque de captación" subtitle="Define de dónde y de qué posición vienen los canteranos">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select label="País de captación" value={academy.prefs.country} disabled={busy === "prefs"}
                  onChange={(e) => changePrefs(e.target.value, academy.prefs.position)}>
            <option value="auto">Automático ({countryName(club.country)})</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </Select>
          <Select label="Posición prioritaria" value={academy.prefs.position} disabled={busy === "prefs"}
                  onChange={(e) => changePrefs(academy.prefs.country, e.target.value)}>
            <option value="auto">Sin preferencia</option>
            {POSITIONS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </Select>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" disabled={busy === "prefs"}
                    onClick={() => changePrefs(academy.prefs.country, academy.prefs.position)}>
              {busy === "prefs" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Regenerar
            </Button>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-white/40">
          <Sparkles size={12} className="mt-0.5 shrink-0 text-turf-300" />
          Cambiar las preferencias regenera la promoción de este mes. Aproximadamente 3 de cada 5 canteranos saldrán en
          la posición elegida. Subir el nivel de la academia (en <b>Club → Instalaciones</b>) mejora las estadísticas y,
          sobre todo, el potencial de las promesas.
        </p>
      </Card>

      {academy.candidates.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title="Promoción agotada"
                    text={`Ya has revisado a todos los canteranos de este mes. La próxima llega en ${realTimeUntil(nextDate)}.`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {academy.candidates.map((c) => {
            const p = c.player;
            const cost = Math.round(p.value * 0.05 / 1000) * 1000;
            const canPromote = slotsLeft > 0 && players.length < SQUAD_MAX && club.finances.balance >= cost;
            return (
              <Card key={c.id}>
                <div className="flex items-start gap-3">
                  <PlayerAvatar seed={p.seed} nationality={p.nationality} age={p.age} size={56} className="rounded-2xl border border-white/10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.name}</p>
                    <p className="text-xs text-white/45">{p.age} años · {POSITION_MAP[p.position].label}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                      <Badge className="border-white/10 bg-white/5 text-white/50">{p.foot}</Badge>
                      <Badge className="border-white/10 bg-white/5 text-white/50">{p.personality}</Badge>
                    </div>
                  </div>
                </div>

                {/* Informe del ojeador: rangos, no valores exactos */}
                <div className="mt-3 space-y-2.5 rounded-xl border border-white/8 bg-ink-900/50 p-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/35">
                    <span>Informe del ojeador</span>
                    <span>Fiabilidad {c.scoutReport.confidence}%</span>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-white/45">Nivel actual estimado</span>
                      <span className="font-bold">{c.scoutReport.abilityRange[0]} – {c.scoutReport.abilityRange[1]}</span>
                    </div>
                    <Bar value={(c.scoutReport.abilityRange[0] + c.scoutReport.abilityRange[1]) / 2} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-white/45">Techo estimado</span>
                      <span className="font-bold text-turf-300">{c.scoutReport.potentialRange[0]} – {c.scoutReport.potentialRange[1]}</span>
                    </div>
                    <Bar value={(c.scoutReport.potentialRange[0] + c.scoutReport.potentialRange[1]) / 2} />
                  </div>
                  <p className="text-[11px] italic text-white/45">"{c.scoutReport.comment}"</p>
                </div>

                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><dt className="text-white/40">Ficha semanal</dt><dd className="font-semibold">{money(c.wageDemand)}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/40">Prima de firma</dt><dd className="font-semibold">{money(cost)}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/40">Estilo</dt><dd className="font-semibold">{p.playStyle}</dd></div>
                </dl>

                <Button className="mt-3 w-full" size="sm" disabled={!canPromote || busy === c.id}
                        onClick={() => promote(c.id)}>
                  {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {slotsLeft <= 0 ? "Sin cupo este mes" : players.length >= SQUAD_MAX ? "Plantilla llena" : `Subir al primer equipo`}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Cómo funciona la academia">
        <ul className="grid gap-2 text-sm text-white/55 sm:grid-cols-2">
          {[
            `Nueva promoción cada 30 días de juego (${formatGameDate(nextDate)}).`,
            `Puedes subir hasta ${ACADEMY_MAX_PROMOTIONS} canteranos por promoción.`,
            "El informe del ojeador da rangos, nunca el valor exacto.",
            `Centro de análisis N${analytics}: mejora la fiabilidad del informe.`,
            `Academia N${level}: mejora estadísticas y potencial de las promesas.`,
            "Los canteranos cobran una ficha muy baja: son la vía barata de crecer.",
          ].map((t) => <li key={t} className="rounded-lg bg-white/4 px-3 py-2">• {t}</li>)}
        </ul>
      </Card>
    </div>
  );
}
