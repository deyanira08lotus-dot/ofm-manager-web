/**
 * src/pages/NationalPage.tsx — Selecciones nacionales y votaciones (FASE 8).
 */
import { useMemo, useState } from "react";
import {
  Check, Flag, Globe2, Loader2, Megaphone, Play, ShieldCheck, Trophy, Vote, X,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Input, Modal, Rating, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { countryFlag, countryName } from "@/game/data/countries";
import { GROUP_COLORS, POSITION_MAP } from "@/game/data/traits";
import {
  canApply, categoryInfo, eligiblePlayers, NT_CATEGORIES, ntResultLabel, worldRanking,
  type NtCategory,
} from "@/game/national";
import { formatGameDate, realTimeUntil } from "@/game/time";

export default function NationalPage() {
  const {
    club, profile, players, national,
    applyForNt, voteNt, closeElection, toggleNtCallUp, autoCallUp, playNtMatch,
  } = useGame();

  const [cat, setCat] = useState<NtCategory>("ABS");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [manifesto, setManifesto] = useState("");
  const [showRanking, setShowRanking] = useState(false);

  const ranking = useMemo(() => worldRanking(national, club?.country ?? "ESP"), [national, club]);
  const eligible = useMemo(
    () => (national ? eligiblePlayers(players, national.country, cat) : []),
    [national, players, cat]
  );

  if (!club || !national) {
    return <EmptyState icon={<Flag />} title="Selecciones no disponibles" text="Recarga la aplicación para inicializar el sistema de selecciones." />;
  }

  const team = national.teams[cat];
  const info = categoryInfo(cat);
  const isCoach = team.coach?.isUser ?? false;
  const eligibility = canApply(profile, club, cat);
  const myRank = ranking.findIndex((r) => r.code === national.country) + 1;
  const alreadyApplied = team.election?.candidacies.some((c) => c.uid === profile?.uid) ?? false;
  const myVote = profile ? team.election?.votedBy[profile.uid] : undefined;

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
          <h1 className="text-2xl font-black">
            {countryFlag(national.country)} Selección de {countryName(national.country)}
          </h1>
          <p className="text-sm text-white/45">
            {myRank}º del ranking mundial · Elegibles por nacionalidad principal o segunda
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowRanking(true)}>
          <Globe2 size={15} /> Ranking mundial
        </Button>
      </header>

      {/* Selector de categoría */}
      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {NT_CATEGORIES.map((c) => {
          const t = national.teams[c.key];
          return (
            <button key={c.key} onClick={() => setCat(c.key)}
                    className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition ${
                      cat === c.key ? "border-turf-500/60 bg-turf-500/12" : "border-white/10 hover:bg-white/5"}`}>
              <p className={`text-sm font-bold ${cat === c.key ? "text-turf-300" : "text-white/70"}`}>{c.label}</p>
              <p className="text-[10px] text-white/40">
                {t.coach?.isUser ? "Diriges tú" : t.election ? "Elecciones abiertas" : t.coach?.managerName ?? "Vacante"}
              </p>
            </button>
          );
        })}
      </div>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Categoría" value={info.label} sub={`Máx. ${info.maxAge === 99 ? "sin límite" : `${info.maxAge} años`}`} icon={<Flag size={15} />} />
        <StatTile label="Seleccionador" value={team.coach ? (team.coach.isUser ? "Tú" : team.coach.managerName) : "Vacante"}
                  sub={team.coach ? `Mandato hasta ${formatGameDate(team.coach.termEnds)}` : "Elecciones en curso"}
                  tone={isCoach ? "good" : "default"} />
        <StatTile label="Balance" value={`${team.record.won}V ${team.record.drawn}E ${team.record.lost}D`}
                  sub={`${team.record.gf}:${team.record.ga} goles`} />
        <StatTile label="Convocados" value={`${team.callUps.length} / ${info.squadSize}`}
                  sub={`${eligible.length} elegibles en tu club`} tone={team.callUps.length >= 11 ? "good" : "warn"} />
      </div>

      {/* ---------------------- ELECCIONES ---------------------- */}
      {team.election && (
        <Card title={<span className="flex items-center gap-2"><Vote size={15} /> Elecciones a seleccionador {info.label}</span>}
              subtitle={`Cierran en ${realTimeUntil(team.election.closesAt)} · ${team.election.candidacies.length} candidaturas`}>
          <div className="space-y-2.5">
            {[...team.election.candidacies].sort((a, b) => b.votes - a.votes).map((c) => {
              const voted = myVote === c.id;
              const totalVotes = team.election!.candidacies.reduce((s, x) => s + x.votes, 0) || 1;
              return (
                <div key={c.id} className={`rounded-xl border p-3 ${c.isUser ? "border-turf-500/40 bg-turf-500/8" : "border-white/8 bg-ink-900/50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        {c.managerName}
                        {c.isUser && <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Tú</Badge>}
                      </p>
                      <p className="text-[11px] text-white/40">{c.clubName} · Reputación {c.reputation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black">{c.votes}</p>
                      <p className="text-[10px] text-white/35">votos</p>
                    </div>
                    <Button size="sm" variant={voted ? "subtle" : "outline"} disabled={!!myVote || busy === c.id}
                            onClick={() => run(c.id, () => voteNt(cat, c.id), `Has votado a ${c.managerName}.`)}>
                      {voted ? <><Check size={12} /> Votado</> : "Votar"}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs italic text-white/50">"{c.manifesto}"</p>
                  <Bar value={(c.votes / totalVotes) * 100} className="mt-2" />
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!alreadyApplied && (
              <Button onClick={() => setApplyOpen(true)} disabled={!eligibility.ok}>
                <Megaphone size={15} /> Presentar mi candidatura
              </Button>
            )}
            <Button variant="outline" disabled={busy === "close"}
                    onClick={() => run("close", async () => {
                      const res = await closeElection(cat);
                      return res ? null : "No se pudo cerrar la elección.";
                    }, "Recuento finalizado.")}>
              {busy === "close" ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Cerrar votación y proclamar
            </Button>
          </div>
          {!eligibility.ok && !alreadyApplied && (
            <p className="mt-2 text-xs text-amber-300">{eligibility.reason}</p>
          )}
        </Card>
      )}

      {/* ---------------------- CONVOCATORIA ---------------------- */}
      {isCoach ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card title="Convocatoria" subtitle={`${team.callUps.length} de ${info.squadSize} · jugadores de tu club elegibles`}
                action={<Button size="sm" variant="outline" onClick={() => autoCallUp(cat)}>Auto</Button>}>
            {eligible.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">
                Ningún jugador de tu plantilla cumple los requisitos de edad y nacionalidad para {info.label}.
              </p>
            ) : (
              <div className="space-y-1.5">
                {eligible.map((p) => {
                  const called = team.callUps.includes(p.id);
                  const caps = national.playerCaps[p.id];
                  return (
                    <button key={p.id} onClick={() => run(p.id, () => toggleNtCallUp(cat, p.id), called ? "Jugador desconvocado." : "Jugador convocado.")}
                            className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                              called ? "border-turf-500/40 bg-turf-500/10" : "border-white/8 bg-ink-900/40 hover:border-white/20"}`}>
                      <Rating value={p.overall} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-[11px] text-white/40">
                          {p.age} años · Forma {Math.round(p.form)}
                          {caps ? ` · ${caps.caps} inter. (${caps.goals} goles)` : ""}
                        </p>
                      </div>
                      <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                      {called ? <Check size={16} className="text-turf-400" /> : <X size={14} className="text-white/20" />}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card title="Disputar partido" subtitle="Amistosos, clasificación y torneos oficiales">
              <div className="space-y-2">
                {(["Amistoso", "Clasificación", "Torneo"] as const).map((comp) => (
                  <Button key={comp} className="w-full" variant={comp === "Torneo" ? "primary" : "outline"}
                          disabled={busy === comp || team.callUps.length < 11}
                          onClick={() => run(comp, () => playNtMatch(cat, comp), `Partido de ${comp.toLowerCase()} disputado.`)}>
                    {busy === comp ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {comp}
                  </Button>
                ))}
              </div>
              {team.callUps.length < 11 && (
                <p className="mt-2 text-xs text-amber-300">Convoca al menos 11 jugadores para poder competir.</p>
              )}
              <p className="mt-2 text-[11px] text-white/35">
                Ganar 3 partidos seguidos de Torneo conquista un título internacional.
              </p>
            </Card>

            <Card title="Mi mandato" subtitle={`Hasta ${formatGameDate(team.coach!.termEnds)}`}>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ["PJ", team.coach!.matches],
                  ["G", team.coach!.won],
                  ["E", team.coach!.drawn],
                  ["P", team.coach!.lost],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl bg-white/5 p-2.5">
                    <p className="text-lg font-black">{v as number}</p>
                    <p className="text-[10px] uppercase text-white/35">{k}</p>
                  </div>
                ))}
              </div>
              {team.trophies.length > 0 && (
                <div className="mt-3 space-y-1">
                  {team.trophies.map((t) => (
                    <p key={t} className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                      <Trophy size={12} /> {t}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        !team.election && (
          <Card>
            <p className="text-sm text-white/55">
              La selección {info.label} está dirigida por <b className="text-white/85">{team.coach?.managerName}</b> hasta
              el {formatGameDate(team.coach?.termEnds ?? "")}. Cuando termine su mandato se abrirán elecciones y podrás
              presentar tu candidatura si cumples el requisito de reputación ({info.minReputation}).
            </p>
          </Card>
        )
      )}

      {/* ---------------------- HISTORIAL ---------------------- */}
      <Card title="Últimos partidos internacionales" subtitle={`${info.label} · ${team.matches.length} disputados`}>
        {team.matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">Todavía no se ha disputado ningún partido en esta categoría.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {team.matches.map((m) => {
              const r = ntResultLabel(m);
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${
                    r === "V" ? "bg-emerald-500/20 text-emerald-300" : r === "E" ? "bg-white/10 text-white/60" : "bg-rose-500/20 text-rose-300"}`}>
                    {r}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {m.home ? `${countryName(national.country)} vs ${m.rivalName}` : `${m.rivalName} vs ${countryName(national.country)}`}
                  </span>
                  <span className="font-bold tabular-nums">{m.homeGoals}-{m.awayGoals}</span>
                  <span className="hidden text-xs text-white/35 sm:block">{m.competition}</span>
                  <span className="text-xs text-white/30">{formatGameDate(m.date)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------------------- MODAL CANDIDATURA ---------------------- */}
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title={`Candidatura a seleccionador ${info.label}`}>
        <div className="space-y-4">
          <div className="rounded-xl bg-white/5 p-3 text-sm">
            <p className="text-white/45">Requisito de reputación</p>
            <p className="font-bold">
              {info.minReputation} · tu club tiene {Math.round(club.reputation)}
              {eligibility.ok ? <span className="ml-2 text-emerald-300">✓ Cumples</span> : <span className="ml-2 text-rose-300">✗ No cumples</span>}
            </p>
          </div>
          <Input label="Tu programa electoral" placeholder="Ej. Apostaré por la cantera y un bloque joven"
                 value={manifesto} onChange={(e) => setManifesto(e.target.value)} maxLength={120} />
          <p className="text-xs text-white/40">
            Los managers de la comunidad votarán entre todas las candidaturas. El más votado dirigirá la selección
            durante un mandato de 120 días de juego.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!eligibility.ok || busy === "apply"}
                    onClick={() => run("apply", async () => {
                      const err = await applyForNt(cat, manifesto);
                      if (!err) setApplyOpen(false);
                      return err;
                    }, "Candidatura presentada.")}>
              {busy === "apply" ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />} Presentar candidatura
            </Button>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* ---------------------- MODAL RANKING ---------------------- */}
      <Modal open={showRanking} onClose={() => setShowRanking(false)} title="Ranking mundial de selecciones" wide>
        <ul className="space-y-1">
          {ranking.map((r, i) => (
            <li key={r.code}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${r.code === national.country ? "bg-turf-500/10" : "bg-white/4"}`}>
              <span className="w-6 text-center text-xs font-bold text-white/30">{i + 1}</span>
              <span>{r.flag}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <span className={`text-xs ${r.trend > 0 ? "text-emerald-300" : r.trend < 0 ? "text-rose-300" : "text-white/30"}`}>
                {r.trend > 0 ? `▲${r.trend}` : r.trend < 0 ? `▼${Math.abs(r.trend)}` : "—"}
              </span>
              <span className="font-bold tabular-nums">{r.points}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
