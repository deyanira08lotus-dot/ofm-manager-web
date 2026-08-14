/**
 * src/pages/CupsPage.tsx — Copas nacionales, Supercopa e internacional (FASE 11).
 */
import { useState } from "react";
import { History, Loader2, Lock, Play, Timer, Trophy } from "lucide-react";
import { Badge, Button, Card, EmptyState, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import {
  CUP_ICON, CUP_STYLE, cupPlayable, cupPrize, cupTeam, roundName, tiesOfRound, userTie,
  type CupKind,
} from "@/game/cups";
import { formatGameDate, realTimeUntil } from "@/game/time";
import { navigate } from "@/lib/router";

export default function CupsPage() {
  const { club, competitions, playCup, simulating } = useGame();
  const [kind, setKind] = useState<CupKind>("nacional");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  if (!club || !competitions) {
    return <EmptyState icon={<Trophy />} title="Competiciones no disponibles" text="Recarga la aplicación para generar los cuadros de copa." />;
  }

  const cup = competitions[kind];
  const tie = cup ? userTie(cup, club.id) : null;
  const playable = cup ? cupPlayable(cup, club.id) : false;
  const champion = cup?.championId === club.id;

  async function play() {
    if (!cup) return;
    setMsg(null);
    const err = await playCup(kind);
    if (err) setMsg({ text: err, ok: false });
    else navigate("/partido");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Copas y competiciones</h1>
        <p className="text-sm text-white/45">
          Eliminatorias a partido único con prórroga y penaltis. Los títulos suben tu reputación y la de tus jugadores.
        </p>
      </header>

      {/* Selector de competición */}
      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {(["nacional", "supercopa", "internacional"] as CupKind[]).map((k) => {
          const c = competitions[k];
          const disabled = !c;
          return (
            <button key={k} onClick={() => c && setKind(k)} disabled={disabled}
                    className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition ${
                      disabled ? "border-white/8 opacity-45" :
                      kind === k ? "border-turf-500/60 bg-turf-500/12" : "border-white/10 hover:bg-white/5"}`}>
              <p className={`flex items-center gap-1.5 text-sm font-bold ${kind === k && !disabled ? "text-turf-300" : "text-white/70"}`}>
                {CUP_ICON[k]} {k === "nacional" ? "Copa Nacional" : k === "supercopa" ? "Supercopa" : "Internacional"}
              </p>
              <p className="text-[10px] text-white/40">
                {!c ? (k === "internacional" ? "Requiere 45 de reputación" : "Requiere un título previo") :
                 c.championId === club.id ? "¡Campeón!" :
                 c.status === "eliminado" || c.status === "finalizada" ? "Finalizada" :
                 roundName(c.round, c.totalRounds)}
              </p>
            </button>
          );
        })}
      </div>

      {msg && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{msg.text}</p>
      )}

      {!cup ? (
        <EmptyState icon={<Lock />} title="Competición no clasificada"
                    text={kind === "internacional"
                      ? "Necesitas al menos 45 puntos de reputación de club para clasificarte a la Copa Intercontinental."
                      : "La Supercopa solo se disputa si el club ganó un título la temporada anterior."} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Competición" value={CUP_ICON[cup.kind]} sub={cup.name} />
            <StatTile label="Ronda actual" value={roundName(cup.round, cup.totalRounds)}
                      sub={`${cup.teams.length} equipos · ${cup.seasonId}`} />
            <StatTile label="Premios acumulados" value={money(cup.prizeEarned)}
                      sub={`Próxima ronda: ${money(cupPrize(cup.kind, cup.round, cup.totalRounds))}`} tone="good" />
            <StatTile label="Estado" value={champion ? "Campeón" : cup.status === "eliminado" ? "Eliminado" : cup.status === "finalizada" ? "Finalizada" : "En juego"}
                      sub={`Mejor ronda: ${roundName(cup.userRoundReached, cup.totalRounds)}`}
                      tone={champion ? "good" : cup.status === "eliminado" ? "bad" : "default"} />
          </div>

          {/* Próxima eliminatoria */}
          {tie && cup.status === "activa" && (() => {
            const rivalId = tie.homeId === club.id ? tie.awayId : tie.homeId;
            const rival = cupTeam(cup, rivalId);
            return (
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                         style={{ background: `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})` }}>
                      {club.shortName}
                    </div>
                    <span className="text-xs uppercase tracking-widest text-white/35">vs</span>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-[#fff] shadow-md"
                         style={{ background: `linear-gradient(135deg, ${rival?.colors.primary}, ${rival?.colors.secondary})` }}>
                      {rival?.shortName}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        {countryFlag(rival?.country ?? club.country)} {rival?.name}
                      </p>
                      <p className="text-xs text-white/45">
                        {roundName(cup.round, cup.totalRounds)} · Nivel rival {rival?.rating} ·{" "}
                        {cup.round === cup.totalRounds || cup.kind === "supercopa" ? "Campo neutral" : tie.homeId === club.id ? "Local" : "Visitante"}
                      </p>
                    </div>
                  </div>
                  <Button size="lg" onClick={play} disabled={!playable || simulating}>
                    {simulating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    {playable ? "Disputar eliminatoria" : `Disponible en ${realTimeUntil(tie.date)}`}
                  </Button>
                </div>
                {!playable && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/4 px-3 py-2 text-xs text-white/45">
                    <Timer size={13} /> {formatGameDate(tie.date)} · A partido único: si hay empate se resuelve en los penaltis.
                  </p>
                )}
              </Card>
            );
          })()}

          {champion && (
            <Card className="border-amber-500/40">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 text-3xl">🏆</div>
                <div>
                  <p className="text-xl font-black text-amber-600">¡Campeones de la {cup.name}!</p>
                  <p className="text-sm text-white/50">
                    Título conquistado en la temporada {cup.seasonId} · {money(cup.prizeEarned)} en premios.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Cuadro de eliminatorias */}
          <Card title="Cuadro de la competición" subtitle={`${cup.teams.length} equipos · ${cup.totalRounds} rondas`}>
            <div className="fm-scroll-x flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: cup.totalRounds }, (_, i) => i + 1).map((r) => {
                const ties = tiesOfRound(cup, r);
                return (
                  <div key={r} className="min-w-[230px] flex-1 space-y-2">
                    <p className={`text-center text-[11px] font-bold uppercase tracking-wider ${
                      r === cup.round && cup.status === "activa" ? "text-turf-300" : "text-white/35"}`}>
                      {roundName(r, cup.totalRounds)}
                    </p>
                    {ties.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-[11px] text-white/25">
                        Por sortear
                      </div>
                    ) : (
                      ties.map((t) => {
                        const h = cupTeam(cup, t.homeId);
                        const a = cupTeam(cup, t.awayId);
                        const mine = t.homeId === club.id || t.awayId === club.id;
                        return (
                          <div key={t.id}
                               className={`rounded-xl border p-2 text-xs ${
                                 mine ? "border-turf-500/40 bg-turf-500/8" : "border-white/8 bg-ink-900/40"}`}>
                            {[
                              [h, t.homeGoals, t.winnerId === t.homeId],
                              [a, t.awayGoals, t.winnerId === t.awayId],
                            ].map(([team, goals, won], idx) => (
                              <div key={idx} className={`flex items-center gap-2 ${idx === 0 ? "mb-1" : ""}`}>
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                      style={{ background: (team as typeof h)?.colors.primary ?? "#94a3b8" }} />
                                <span className={`min-w-0 flex-1 truncate ${won ? "font-bold" : "text-white/55"}`}>
                                  {(team as typeof h)?.name ?? "—"}
                                </span>
                                <span className={`tabular-nums ${won ? "font-bold text-turf-300" : "text-white/40"}`}>
                                  {goals === null ? "-" : (goals as number)}
                                </span>
                              </div>
                            ))}
                            {t.penalties && (
                              <p className="mt-1 text-center text-[10px] text-amber-600">
                                Penaltis {t.penalties[0]}-{t.penalties[1]}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* Palmarés e historial */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Palmarés del club" subtitle={`${club.trophies.length} título(s)`}>
          {club.trophies.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">Aún no hay títulos en las vitrinas.</p>
          ) : (
            <ul className="space-y-1.5">
              {club.trophies.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
                  <Trophy size={14} className="text-amber-600" />
                  <span className="min-w-0 flex-1 truncate">{t.competition}</span>
                  <span className="text-xs text-white/40">{t.season}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><History size={15} /> Historial de copas</span>}
              subtitle="Resultados de temporadas anteriores">
          {competitions.history.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">
              Este es tu primer año de competiciones. Al cambiar de temporada se archivarán aquí los resultados.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {competitions.history.map((h, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-white/4 px-3 py-2 text-sm">
                  <Badge className={h.champion ? CUP_STYLE.supercopa : "border-white/15 bg-white/5 text-white/50"}>
                    {h.seasonId}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{h.competition}</span>
                  <span className={h.champion ? "text-xs font-bold text-amber-600" : "text-xs text-white/45"}>
                    {h.result}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
