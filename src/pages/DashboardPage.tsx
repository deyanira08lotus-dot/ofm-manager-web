/**
 * src/pages/DashboardPage.tsx — panel de control del club.
 */
import { useMemo } from "react";
import {
  Activity, ArrowUpRight, Building2, Coins, Flame, Heart, Newspaper, Star, Swords, TrendingUp, Trophy, Users,
} from "lucide-react";
import { BellRing } from "lucide-react";
import { clubOf, isPlayable, nextFixture, sortedTable } from "@/game/league";
import { NOTIF_META, URGENCY_STYLE } from "@/game/manager";
import { realTimeUntil } from "@/game/time";
import { Bar, Card, MiniBars, Rating, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, moraleLabel, num } from "@/game/format";
import { squadStrength } from "@/game/players";
import { countryFlag } from "@/game/data/countries";
import { FACILITIES } from "@/game/data/traits";
import { formatGameDate } from "@/game/time";
import { navigate } from "@/lib/router";

export default function DashboardPage() {
  const {
    club, players, news, rankings, staff, league, lastMatch, market, academy, competitions,
    notifications, chemistry, concerns,
  } = useGame();

  const next = useMemo(() => (league ? nextFixture(league) : null), [league]);
  const leaguePos = useMemo(() => {
    if (!league || !club) return 0;
    return sortedTable(league).findIndex((r) => r.clubId === club.id) + 1;
  }, [league, club]);

  const stats = useMemo(() => {
    if (!players.length) return null;
    const avgMorale = players.reduce((s, p) => s + p.morale, 0) / players.length;
    const avgForm = players.reduce((s, p) => s + p.form, 0) / players.length;
    const avgFitness = players.reduce((s, p) => s + p.fitness, 0) / players.length;
    const avgAge = players.reduce((s, p) => s + p.age, 0) / players.length;
    const wages = players.reduce((s, p) => s + p.contract.wage, 0);
    const value = players.reduce((s, p) => s + p.value, 0);
    return {
      avgMorale, avgForm, avgFitness, avgAge, wages, value,
      rating: squadStrength(players),
      top: [...players].sort((a, b) => b.overall - a.overall).slice(0, 5),
      talents: [...players].sort((a, b) => b.potential - b.overall - (a.potential - a.overall)).slice(0, 4),
    };
  }, [players]);

  if (!club || !stats) return null;

  const staffWages = staff.reduce((s, m) => s + m.wage, 0);
  const netWeek = club.finances.weeklyIncome - (stats.wages + staffWages);

  return (
    <div className="space-y-5">
      {/* Cabecera del club */}
      <div className="relative overflow-hidden rounded-3xl border border-white/8 p-5 sm:p-6"
           style={{ background: `linear-gradient(120deg, ${club.colors.primary}22, ${club.colors.secondary}18 60%, transparent)` }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-black text-[#fff] shadow-md sm:h-20 sm:w-20"
               style={{ background: `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})` }}>
            {club.shortName}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black sm:text-3xl">{club.name}</h1>
            <p className="text-sm text-white/50">
              {countryFlag(club.country)} División {club.division} · Fundado en {club.founded} · {club.stadium.name}
            </p>
            <p className="mt-1 text-xs text-white/40">Objetivo de la directiva: <span className="text-turf-300">{club.board.objective}</span></p>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Nivel plantilla</p>
              <p className="text-2xl font-black text-turf-300">{stats.rating}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Reputación</p>
              <p className="text-2xl font-black">{club.reputation}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Centro de notificaciones (FASE 13) */}
      {notifications.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><BellRing size={15} /> Requiere tu atención</span>}
              subtitle={`${notifications.filter((n) => n.urgency === "alta").length} urgente(s) de ${notifications.length}`}
              action={<button onClick={() => navigate("/perfil")} className="text-xs text-turf-300 hover:underline">Configurar</button>}>
          <div className="grid gap-2 md:grid-cols-2">
            {notifications.slice(0, 6).map((n) => (
              <button key={n.id} onClick={() => n.actionPath && navigate(n.actionPath)}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition hover:brightness-105 ${URGENCY_STYLE[n.urgency]}`}>
                <span className="text-lg">{NOTIF_META[n.kind].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{n.title}</p>
                  <p className="line-clamp-2 text-[11px] text-white/50">{n.body}</p>
                  {n.timeHint && <p className="mt-0.5 text-[10px] text-white/35">⏱ {n.timeHint}</p>}
                </div>
                {n.actionLabel && (
                  <span className="shrink-0 self-center rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold">
                    {n.actionLabel}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Próximo partido / último resultado */}
      {league && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => navigate("/liga")}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-4 text-left hover:border-turf-500/40">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-turf-500/15 text-turf-300"><Swords size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Próximo partido</p>
              {next ? (
                <>
                  <p className="truncate text-sm font-bold">
                    {next.homeId === club.id ? "vs " : "en casa de "}
                    {clubOf(league, next.homeId === club.id ? next.awayId : next.homeId)?.name}
                  </p>
                  <p className="text-[11px] text-white/40">
                    Jornada {next.round} · {isPlayable(next) ? "¡Listo para jugar!" : `en ${realTimeUntil(next.date)}`}
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold">Temporada completada</p>
              )}
            </div>
            <span className="rounded-lg bg-turf-500 px-3 py-1.5 text-xs font-bold text-ink-950">Ir</span>
          </button>

          <button onClick={() => navigate(lastMatch ? "/partido" : "/liga")}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-4 text-left hover:border-turf-500/40">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/6 text-white/60"><Trophy size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Último resultado</p>
              {lastMatch ? (
                <>
                  <p className="truncate text-sm font-bold">
                    {lastMatch.home.short} {lastMatch.home.goals} - {lastMatch.away.goals} {lastMatch.away.short}
                  </p>
                  <p className="truncate text-[11px] text-white/40">{lastMatch.competition}</p>
                </>
              ) : (
                <p className="text-sm text-white/50">Todavía no has jugado ningún partido</p>
              )}
            </div>
            <span className="text-xs text-white/35">
              {leaguePos ? `${leaguePos}º en la tabla` : ""}
            </span>
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Saldo" value={money(club.finances.balance)} sub={`${netWeek >= 0 ? "+" : ""}${money(netWeek)} / semana`} icon={<Coins size={16} />} tone={netWeek >= 0 ? "good" : "bad"} />
        <StatTile label="Plantilla" value={`${players.length} jug.`} sub={`Edad media ${stats.avgAge.toFixed(1)} años`} icon={<Users size={16} />} />
        <StatTile label="Moral media" value={moraleLabel(stats.avgMorale)} sub={`${Math.round(stats.avgMorale)}/100 · Forma ${Math.round(stats.avgForm)}`} icon={<Heart size={16} />} tone={stats.avgMorale >= 60 ? "good" : "warn"} />
        <StatTile label="Valor plantilla" value={money(stats.value)} sub={`Salarios ${money(stats.wages)}/sem`} icon={<TrendingUp size={16} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Mejores jugadores */}
        <Card className="lg:col-span-2" title="Jugadores destacados" subtitle="Los cinco mejores por nivel actual"
              action={<button onClick={() => navigate("/plantilla")} className="flex items-center gap-1 text-xs text-turf-300 hover:underline">Ver plantilla <ArrowUpRight size={13} /></button>}>
          <div className="space-y-2">
            {stats.top.map((p, i) => (
              <button key={p.id} onClick={() => navigate(`/jugador/${p.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/6 bg-ink-900/50 p-2.5 text-left transition hover:border-turf-500/40 hover:bg-ink-800">
                <span className="w-5 text-center text-xs font-bold text-white/25">{i + 1}</span>
                <Rating value={p.overall} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{countryFlag(p.nationality)} {p.name}</p>
                  <p className="truncate text-[11px] text-white/40">{p.position} · {p.age} años · {p.playStyle}</p>
                </div>
                <div className="hidden w-28 sm:block">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-white/30">Forma</p>
                  <Bar value={p.form} />
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{money(p.value)}</p>
                  <p className="text-[11px] text-white/35">Pot. {p.potentialClass}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Directiva y afición */}
        <div className="space-y-5">
          <Card title="Directiva" subtitle={`Presidente: ${club.board.chairman}`}
                action={<button onClick={() => navigate("/finanzas")} className="text-xs text-turf-300 hover:underline">Informe</button>}>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-white/45">Confianza</span><span className="font-semibold">{Math.round(club.board.confidence)}%</span></div>
                <Bar value={club.board.confidence} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-white/45">Paciencia</span><span className="font-semibold">{club.board.patience}%</span></div>
                <Bar value={club.board.patience} />
              </div>
              <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/50">"{club.board.objective}" — expectativa de la afición: {club.fanbase.expectation}.</p>
            </div>
          </Card>

          <Card title="Afición" subtitle={`${num(club.fanbase.followers)} seguidores`}>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-white/45">Fidelidad</span><span className="font-semibold">{club.fanbase.loyalty}%</span></div>
                <Bar value={club.fanbase.loyalty} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-white/45">Satisfacción</span><span className="font-semibold">{club.fanbase.satisfaction}%</span></div>
                <Bar value={club.fanbase.satisfaction} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {club.fanbase.favouritePlayerIds.map((id) => {
                  const p = players.find((x) => x.id === id);
                  return p ? (
                    <span key={id} className="rounded-md bg-rose-500/12 px-2 py-1 text-[11px] text-rose-200">
                      <Star size={10} className="mr-1 inline" />{p.name}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Promesas */}
        <Card title="Promesas del club" subtitle="Mayor margen de crecimiento">
          <div className="space-y-2.5">
            {stats.talents.map((p) => (
              <button key={p.id} onClick={() => navigate(`/jugador/${p.id}`)} className="flex w-full items-center gap-3 text-left">
                <Rating value={p.overall} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Bar value={p.overall} className="flex-1" />
                    <span className="text-[10px] text-white/35">→ {p.potential}</span>
                  </div>
                </div>
                <span className="text-xs text-white/40">{p.age}a</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Estado físico */}
        <Card title="Estado del vestuario" subtitle={chemistry.label}
              action={<button onClick={() => navigate("/vestuario")} className="text-xs text-turf-300 hover:underline">Gestionar</button>}>
          <MiniBars
            data={[
              { label: "Forma", value: Math.round(stats.avgForm) },
              { label: "Moral", value: Math.round(stats.avgMorale), color: "bg-sky-500/80" },
              { label: "Físico", value: Math.round(stats.avgFitness), color: "bg-amber-500/80" },
              { label: "Química", value: chemistry.overall, color: "bg-fuchsia-500/70" },
              { label: "Rep.", value: club.reputation, color: "bg-violet-500/70" },
            ]}
          />
          {concerns.length > 0 ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-700">
              <Activity size={13} /> {concerns.length} asunto(s) pendiente(s) en el vestuario.
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-xs text-white/40">
              <Activity size={13} /> El grupo está tranquilo: sin conflictos abiertos.
            </p>
          )}
        </Card>

        {/* Instalaciones */}
        <Card title="Instalaciones" subtitle="Niveles y obras en curso"
              action={<button onClick={() => navigate("/club")} className="text-xs text-turf-300 hover:underline">Gestionar</button>}>
          <div className="space-y-2">
            {FACILITIES.map((f) => {
              const st = club.facilities[f.key];
              const lvl = st?.level ?? 1;
              return (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="text-base">{f.icon}</span>
                  <span className="w-28 shrink-0 truncate text-xs text-white/60">{f.label}</span>
                  <Bar value={(lvl / f.maxLevel) * 100} className="flex-1" />
                  {st?.upgrading ? (
                    <span className="w-16 text-right text-[10px] font-semibold text-sky-300">obra {realTimeUntil(st.upgrading.finishesAt)}</span>
                  ) : (
                    <span className="w-8 text-right text-xs font-semibold tabular-nums">N{lvl}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Últimas noticias" subtitle="Sala de prensa"
              action={<button onClick={() => navigate("/noticias")} className="text-xs text-turf-300 hover:underline">Ver todas</button>}>
          <div className="space-y-3">
            {news.slice(0, 4).map((n) => (
              <article key={n.id} className="rounded-xl border border-white/6 bg-ink-900/40 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/35">
                  <Newspaper size={11} /> {n.category} · {formatGameDate(n.date)}
                  {!n.read && <span className="rounded bg-turf-500/20 px-1.5 text-turf-300">nuevo</span>}
                </div>
                <h3 className="mt-1 text-sm font-semibold">{n.title}</h3>
                <p className="mt-0.5 line-clamp-2 text-xs text-white/45">{n.body}</p>
              </article>
            ))}
          </div>
        </Card>

        <Card title="Ranking mundial de clubes" subtitle="Por reputación"
              action={<button onClick={() => navigate("/rankings")} className="text-xs text-turf-300 hover:underline">Completo</button>}>
          <div className="space-y-1.5">
            {rankings.slice(0, 6).map((r, i) => (
              <div key={r.clubId} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${r.clubId === club.id ? "bg-turf-500/10" : ""}`}>
                <span className="w-5 text-center text-xs font-bold text-white/30">{i + 1}</span>
                <span>{countryFlag(r.country)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                <span className="text-xs text-white/40">{r.managerName}</span>
                <span className="flex items-center gap-1 text-sm font-semibold"><Trophy size={12} className="text-amber-300" />{r.reputation}</span>
              </div>
            ))}
            {rankings.length === 0 && <p className="py-4 text-center text-xs text-white/35">Aún no hay clubes clasificados.</p>}
          </div>
        </Card>
      </div>

      <Card title="Accesos rápidos" subtitle="Gestión del club">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["/alineacion", "Alineación", "Ajusta el once y la táctica"],
            ["/mercado", "Mercado", `${market?.incomingOffers.length ?? 0} oferta(s) por tus jugadores`],
            ["/academia", "Academia", `${academy?.candidates.length ?? 0} canteranos disponibles`],
            ["/copas", "Copas", competitions ? `${club.trophies.length} título(s) en las vitrinas` : "Cuadros de eliminatorias"],
            ["/fama", "Fama y legado", "Logros, récords y leyendas"],
          ].map(([to, k, v]) => (
            <button key={k} onClick={() => navigate(to)} className="rounded-xl border border-white/8 bg-ink-900/50 p-3 text-left hover:border-turf-500/40">
              <p className="flex items-center gap-1.5 text-xs font-bold text-turf-300"><Flame size={12} />{k}</p>
              <p className="mt-1 text-xs text-white/45">{v}</p>
            </button>
          ))}
        </div>
      </Card>

      <p className="flex items-center justify-center gap-2 pb-2 text-center text-[11px] text-white/25">
        <Building2 size={12} /> Datos persistentes · El mundo del juego avanza en tiempo real aunque cierres la app
      </p>
    </div>
  );
}
