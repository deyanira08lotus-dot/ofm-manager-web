/**
 * src/pages/PlayerPage.tsx — ficha completa del jugador.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Award, CalendarClock, Dumbbell, Footprints, Globe2, HeartPulse, History, Star, Target } from "lucide-react";
import { Badge, Bar, Button, Card, RadarChart, Rating, Select } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useGame } from "@/state/GameContext";
import { CLASS_STYLE, formLabel, money, moraleLabel, num, ratingColor } from "@/game/format";
import { countryFlag, countryName } from "@/game/data/countries";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, GROUP_COLORS, PERSONALITIES, POSITION_MAP } from "@/game/data/traits";
import { fameIndex, fameLabel } from "@/game/fame";
import { formatGameDate } from "@/game/time";
import { navigate } from "@/lib/router";
import type { AttributeKey } from "@/types";

export default function PlayerPage({ playerId }: { playerId: string }) {
  const { players, club, setPlayerTraining } = useGame();
  const player = players.find((p) => p.id === playerId);
  const [saving, setSaving] = useState(false);

  const radar = useMemo(() => {
    if (!player) return [];
    const a = player.attributes;
    const avg = (keys: AttributeKey[]) => Math.round(keys.reduce((s, k) => s + a[k], 0) / keys.length);
    if (player.position === "GK") {
      return [
        { label: "Reflejos", value: a.reflexes },
        { label: "Blocaje", value: a.handling },
        { label: "Aéreo", value: a.aerialReach },
        { label: "Saque", value: a.kicking },
        { label: "1v1", value: a.oneOnOne },
        { label: "Mental", value: avg(["concentration", "composure", "decisions", "communication"]) },
      ];
    }
    return [
      { label: "Ataque", value: avg(["finishing", "longShots", "positioning"]) },
      { label: "Técnica", value: avg(["dribbling", "firstTouch", "passing", "crossing"]) },
      { label: "Ritmo", value: avg(["pace", "acceleration", "agility"]) },
      { label: "Físico", value: avg(["strength", "stamina", "jumping"]) },
      { label: "Defensa", value: avg(["tackling", "marking", "heading"]) },
      { label: "Mental", value: avg(["vision", "decisions", "composure", "workRate"]) },
    ];
  }, [player]);

  if (!player) {
    return (
      <div className="py-20 text-center">
        <p className="text-white/50">Jugador no encontrado.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/plantilla")}>Volver a la plantilla</Button>
      </div>
    );
  }

  const personality = PERSONALITIES.find((p) => p.name === player.personality);
  const growth = player.potential - player.overall;

  async function saveTraining(focus: string | null, role: string) {
    setSaving(true);
    try { await setPlayerTraining(player!.id, focus, role); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate("/plantilla")} className="flex items-center gap-1.5 text-sm text-white/45 hover:text-white">
        <ArrowLeft size={15} /> Plantilla
      </button>

      {/* Cabecera */}
      <div className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-ink-850 to-ink-900/70 p-5 shadow-[0_6px_18px_-12px_rgba(22,32,46,0.3)]">
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative shrink-0">
            <PlayerAvatar
              seed={player.seed}
              nationality={player.nationality}
              age={player.age}
              variant="card"
              size={92}
              clubColors={club?.colors}
              className="rounded-2xl border border-white/10 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.5)]"
            />
            <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-ink-900 text-sm">
              {countryFlag(player.nationality)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black sm:text-3xl">{player.name}</h1>
              <span className={`rounded px-2 py-0.5 text-xs font-black ${CLASS_STYLE[player.potentialClass]}`}>Clase {player.potentialClass}</span>
              {player.injury && <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-300">Lesionado</Badge>}
            </div>
            <p className="mt-1 text-sm text-white/50">
              {POSITION_MAP[player.position].label} · {player.age} años · {countryName(player.nationality)} · {club?.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge className={GROUP_COLORS[POSITION_MAP[player.position].group]}>{POSITION_MAP[player.position].short}</Badge>
              {player.secondaryPositions.map((s) => (
                <Badge key={s} className="border-white/10 bg-white/5 text-white/50">{POSITION_MAP[s].short}</Badge>
              ))}
              <Badge className="border-white/10 bg-white/5 text-white/50"><Footprints size={10} /> {player.foot}</Badge>
              <Badge className="border-white/10 bg-white/5 text-white/50">{player.playStyle}</Badge>
              <Badge className="border-white/10 bg-white/5 text-white/50">{player.squadRole}</Badge>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Nivel</p>
              <Rating value={player.overall} size="lg" />
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Potencial</p>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-lg font-bold ${ratingColor(player.potential)}`}>
                {player.potential}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Valor de mercado", money(player.value)],
            ["Salario", `${money(player.contract.wage)}/sem`],
            ["Cláusula", money(player.contract.releaseClause)],
            ["Contrato hasta", formatGameDate(player.contract.expires)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/8 bg-ink-950/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-white/35">{k}</p>
              <p className="mt-0.5 text-sm font-bold">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones rápidas: primero lo interactivo, para no tener que bajar
          toda la ficha (rendimiento, popularidad, atributos...) solo para
          cambiar el rol o el foco de entrenamiento de un jugador. */}
      <Card title="Entrenamiento individual" subtitle="Se aplica en el procesado diario del servidor">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Atributo prioritario"
            value={player.trainingFocus ?? ""}
            disabled={saving}
            onChange={(e) => saveTraining(e.target.value || null, player.squadRole)}
          >
            <option value="">General (equilibrado)</option>
            {ATTRIBUTE_GROUPS.filter((g) => (player.position === "GK" ? true : g.key !== "goalkeeping")).flatMap((g) =>
              g.attrs.map((k) => <option key={k} value={k}>{g.label} · {ATTRIBUTE_LABELS[k]}</option>)
            )}
          </Select>
          <Select
            label="Rol en la plantilla"
            value={player.squadRole}
            disabled={saving}
            onChange={(e) => saveTraining(player.trainingFocus ?? null, e.target.value)}
          >
            {["Estrella", "Titular", "Rotación", "Suplente", "Promesa"].map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-white/35">
          <Dumbbell size={12} className="mt-0.5" /> El rol influye en la moral: un suplente con rol de estrella se
          desmotivará.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card title="Perfil de rendimiento">
            <RadarChart data={radar} />
            <div className="mt-3 space-y-2.5">
              {[
                ["Forma", player.form, formLabel(player.form)],
                ["Moral", player.morale, moraleLabel(player.morale)],
                ["Condición física", player.fitness, `${Math.round(player.fitness)}%`],
                ["Experiencia", player.experience, `${player.experience}/99`],
                ["Reputación", player.reputation, `${player.reputation}/99`],
              ].map(([label, value, hint]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/45">{label}</span>
                    <span className="font-medium text-white/70">{hint}</span>
                  </div>
                  <Bar value={value as number} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Popularidad" subtitle="Crece con goles, títulos y grandes partidos">
            <div className="mb-3 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/35">Índice de fama</p>
                <p className={`text-sm font-bold ${fameLabel(fameIndex(player)).tone}`}>
                  {fameLabel(fameIndex(player)).label}
                </p>
              </div>
              <span className="text-2xl font-black text-turf-300">{fameIndex(player)}</span>
            </div>
            <div className="space-y-2.5">
              {[
                ["Local", player.popularity.local],
                ["Nacional", player.popularity.national],
                ["Internacional", player.popularity.international],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/45">{label}</span><span className="font-medium">{Math.round(value as number)}</span>
                  </div>
                  <Bar value={value as number} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Personalidad" subtitle={player.personality}>
            <p className="text-xs text-white/50">{personality?.desc}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/5 p-2">
                <p className="text-white/35">Margen de mejora</p>
                <p className={`font-bold ${growth > 12 ? "text-emerald-300" : growth > 5 ? "text-lime-300" : "text-white/60"}`}>+{growth}</p>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <p className="text-white/35">Origen</p>
                <p className="font-bold capitalize">{player.origin === "generated" ? "Plantilla inicial" : player.origin}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Atributos" subtitle="Escala 1-99 · se desarrollan con el entrenamiento y la experiencia">
            <div className="grid gap-5 sm:grid-cols-2">
              {ATTRIBUTE_GROUPS.filter((g) => (player.position === "GK" ? true : g.key !== "goalkeeping")).map((g) => (
                <div key={g.key}>
                  <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-turf-300/80">{g.label}</h4>
                  <div className="space-y-1.5">
                    {g.attrs.map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-xs text-white/50">{ATTRIBUTE_LABELS[k]}</span>
                        <Bar value={player.attributes[k]} className="flex-1" />
                        <span className={`w-6 text-right text-xs font-bold tabular-nums ${ratingColor(player.attributes[k])}`}>
                          {player.attributes[k]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Contrato y ficha">
            <dl className="space-y-2 text-sm">
              {[
                ["Firmado el", formatGameDate(player.contract.signedOn), <CalendarClock key="a" size={13} />],
                ["Vence", formatGameDate(player.contract.expires), <CalendarClock key="b" size={13} />],
                ["Prima por gol", money(player.contract.bonusPerGoal), <Target key="c" size={13} />],
                ["Nacionalidad", `${countryFlag(player.nationality)} ${countryName(player.nationality)}`, <Globe2 key="d" size={13} />],
                ["Estado físico", player.injury ? `${player.injury.name} (${player.injury.daysOut} d)` : "Disponible", <HeartPulse key="e" size={13} />],
              ].map(([k, v, icon]) => (
                <div key={k as string} className="flex items-center justify-between border-b border-white/5 pb-1.5">
                  <dt className="flex items-center gap-1.5 text-white/45">{icon}{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card title="Estadísticas de carrera">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Partidos", num(player.careerTotals.apps)],
                  ["Goles", num(player.careerTotals.goals)],
                  ["Asistencias", num(player.careerTotals.assists)],
                  ["Títulos", num(player.careerTotals.trophies)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/5 p-3 text-center">
                    <p className="text-xl font-black">{v}</p>
                    <p className="text-[10px] uppercase tracking-wider text-white/35">{k}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
                <Award size={12} /> Las estadísticas por temporada se llenarán con el simulador de partidos (FASE 2).
              </p>
            </Card>

            <Card title="Historial">
              <ol className="space-y-3">
                {player.history.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-turf-400" />
                    <div>
                      <p className="text-xs text-white/60">{h.text}</p>
                      <p className="text-[10px] text-white/30">{formatGameDate(h.date)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
                <History size={12} /> Traspasos, lesiones, premios y récords quedarán registrados aquí.
              </p>
            </Card>
          </div>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-white/25">
        <Star size={11} /> Jugador ficticio generado proceduralmente · ID {player.id}
      </p>
    </div>
  );
}
