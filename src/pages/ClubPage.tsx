/**
 * src/pages/ClubPage.tsx — estadio, instalaciones, cuerpo técnico, finanzas, afición y directiva.
 */
import { useState } from "react";
import { Banknote, Building2, Hammer, Landmark, Loader2, Ticket, Users2 } from "lucide-react";
import { Bar, Button, Card, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, num } from "@/game/format";
import { FACILITIES } from "@/game/data/traits";
import {
  facilityBenefit, facilityUpgradeCost, facilityUpgradeDays, facilityUpkeep, fairTicketPrice,
  matchdayIncome, SEATS_PER_STAND_LEVEL,
} from "@/game/economy";
import { countryFlag, countryName } from "@/game/data/countries";
import { formatGameDate, realTimeUntil } from "@/game/time";
import { navigate } from "@/lib/router";

const TABS = [
  { key: "resumen", label: "Resumen", icon: <Building2 size={15} /> },
  { key: "instalaciones", label: "Instalaciones", icon: <Hammer size={15} /> },
  { key: "cuerpo", label: "Cuerpo técnico", icon: <Users2 size={15} /> },
  { key: "finanzas", label: "Finanzas", icon: <Banknote size={15} /> },
];

export default function ClubPage() {
  const { club, players, staff, upgradeFacility } = useGame();
  const [tab, setTab] = useState("resumen");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!club) return null;

  const wages = players.reduce((s, p) => s + p.contract.wage, 0);
  const staffWages = staff.reduce((s, m) => s + m.wage, 0);
  const gate = matchdayIncome(club, { rivalRating: 55, seed: `${club.id}:preview` });

  async function startWork(key: string) {
    setBusy(key);
    setError(null);
    try {
      const err = await upgradeFacility(key);
      if (err) setError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">{club.name}</h1>
        <p className="text-sm text-white/45">
          {countryFlag(club.country)} {countryName(club.country)} · {club.stadium.name} · Fundado en {club.founded}
        </p>
      </header>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-ink-950" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Aforo" value={num(club.stadium.capacity)} sub={`Entrada ${money(club.stadium.ticketPrice, { compact: false })}`} />
            <StatTile label="Taquilla estimada" value={money(gate.total)} sub={`${num(gate.attendance)} esp. (${gate.occupancy}% de aforo)`} tone="good" />
            <StatTile label="Césped" value={`${club.stadium.pitchQuality}/100`} sub={`Nivel estadio ${club.stadium.level}`} />
            <StatTile label="Seguidores" value={num(club.fanbase.followers)} sub={`Fidelidad ${club.fanbase.loyalty}%`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Estadio" subtitle={club.stadium.name}>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["General", club.stadium.seats.general],
                  ["Premium", club.stadium.seats.premium],
                  ["VIP", club.stadium.seats.vip],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl bg-white/5 p-3">
                    <p className="text-lg font-black">{num(v as number)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-white/35">{k}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-ink-900/50 px-3 py-2.5 text-xs">
                  <span className="text-white/45">Precio de la entrada</span>
                  <span className="font-semibold">
                    {money(club.stadium.ticketPrice, { compact: false })}
                    <span className="ml-1 text-white/35">(justo: {money(fairTicketPrice(club), { compact: false })})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-ink-900/50 px-3 py-2.5 text-xs">
                  <span className="text-white/45">Ampliación de gradas</span>
                  <span className="font-semibold">+{num(SEATS_PER_STAND_LEVEL)} plazas por nivel</span>
                </div>
                <Button variant="outline" className="w-full" onClick={() => navigate("/finanzas")}>
                  <Ticket size={14} /> Gestionar entradas y patrocinios
                </Button>
              </div>
            </Card>

            <Card title="Directiva y objetivos" subtitle={`Presidente ${club.board.chairman}`}>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-white/45">Confianza de la directiva</span><span>{club.board.confidence}%</span></div>
                  <Bar value={club.board.confidence} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-white/45">Satisfacción de la afición</span><span>{club.fanbase.satisfaction}%</span></div>
                  <Bar value={club.fanbase.satisfaction} />
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-xs">
                  <p className="text-white/40">Objetivo de temporada</p>
                  <p className="mt-0.5 font-semibold text-turf-300">{club.board.objective}</p>
                  <p className="mt-2 text-white/40">Expectativa de la grada</p>
                  <p className="font-semibold">{club.fanbase.expectation}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "instalaciones" && (
        <>
          {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {FACILITIES.map((f) => {
              const st = club.facilities[f.key];
              const level = st?.level ?? 1;
              const next = Math.min(level + 1, f.maxLevel);
              const cost = facilityUpgradeCost(f.key, next);
              const benefit = facilityBenefit(f.key, level);
              const working = !!st?.upgrading;
              const maxed = level >= f.maxLevel;
              const affordable = club.finances.balance >= cost;
              return (
                <Card key={f.key} title={<span className="flex items-center gap-2">{f.icon} {f.label}</span>} subtitle={`Nivel ${level} / ${f.maxLevel}`}>
                  <p className="text-xs text-white/45">{f.desc}</p>
                  <div className="mt-3"><Bar value={(level / f.maxLevel) * 100} /></div>
                  <div className="mt-3 rounded-lg bg-white/5 p-2.5 text-xs">
                    <p className="text-white/40">{benefit.label}</p>
                    <p className="font-semibold">{benefit.current} <span className="text-turf-300">→ {benefit.next}</span></p>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between"><dt className="text-white/40">Coste nivel {next}</dt><dd className={`font-semibold ${affordable ? "" : "text-rose-300"}`}>{money(cost)}</dd></div>
                    <div className="flex justify-between"><dt className="text-white/40">Tiempo de obra</dt><dd className="font-semibold">{facilityUpgradeDays(next)} días de juego</dd></div>
                    <div className="flex justify-between"><dt className="text-white/40">Mantenimiento</dt><dd className="font-semibold">{money(facilityUpkeep(f.key, level))}/sem</dd></div>
                  </dl>

                  {working ? (
                    <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-xs text-sky-300">
                      <p className="flex items-center gap-1.5 font-semibold"><Hammer size={12} /> En obras · nivel {st!.upgrading!.toLevel}</p>
                      <p className="mt-0.5 text-white/50">
                        Termina el {formatGameDate(st!.upgrading!.finishesAt)} · faltan {realTimeUntil(st!.upgrading!.finishesAt)}
                      </p>
                    </div>
                  ) : maxed ? (
                    <p className="mt-3 rounded-xl bg-white/5 py-2 text-center text-xs text-white/40">Nivel máximo alcanzado</p>
                  ) : (
                    <Button className="mt-3 w-full" size="sm" disabled={busy === f.key || !affordable}
                            onClick={() => startWork(f.key)}>
                      {busy === f.key ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />}
                      {affordable ? `Mejorar por ${money(cost)}` : "Saldo insuficiente"}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-white/30">
            Las obras continúan aunque cierres la aplicación: al volver, las instalaciones terminadas se activan solas.
          </p>
        </>
      )}

      {tab === "cuerpo" && (
        <Card dense>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                  <th className="px-4 py-3 text-left">Cargo</th>
                  <th className="px-3 py-3 text-left">Nombre</th>
                  <th className="px-3 py-3 text-center">Edad</th>
                  <th className="px-3 py-3 text-center">Nivel</th>
                  <th className="px-3 py-3 text-center">Pot.</th>
                  <th className="px-3 py-3 text-left">Especialidad</th>
                  <th className="px-3 py-3 text-left">Personalidad</th>
                  <th className="px-4 py-3 text-right">Salario</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-white/4">
                    <td className="px-4 py-2.5 font-medium">{s.role}</td>
                    <td className="px-3 py-2.5 text-white/70">{countryFlag(s.nationality)} {s.name}</td>
                    <td className="px-3 py-2.5 text-center text-white/50">{s.age}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-turf-300">{s.level}</td>
                    <td className="px-3 py-2.5 text-center text-white/50">{s.potential}</td>
                    <td className="px-3 py-2.5 text-xs text-white/45">{s.specialities.join(", ")}</td>
                    <td className="px-3 py-2.5 text-xs text-white/45">{s.personality}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(s.wage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {staff.length === 0 && <p className="p-6 text-center text-sm text-white/40">Sin cuerpo técnico registrado.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-4 py-3">
            <p className="text-xs text-white/35">
              Contrata, forma y renueva a tus técnicos desde la sección dedicada.
            </p>
            <Button size="sm" onClick={() => navigate("/cuerpo-tecnico")}>
              <Users2 size={13} /> Gestionar cuerpo técnico
            </Button>
          </div>
        </Card>
      )}

      {tab === "finanzas" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Saldo" value={money(club.finances.balance)} icon={<Landmark size={15} />} tone="good" />
            <StatTile label="Presupuesto fichajes" value={money(club.finances.transferBudget)} />
            <StatTile label="Masa salarial" value={`${money(wages + staffWages)}/sem`} sub={`Tope ${money(club.finances.wageBudget)}`} tone={wages + staffWages > club.finances.wageBudget ? "bad" : "default"} />
            <StatTile label="Patrocinador" value={club.finances.sponsorship?.name ?? "—"} sub={`${money(club.finances.sponsorship?.weekly ?? 0)}/sem`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Ingresos semanales estimados">
              <ul className="space-y-2 text-sm">
                {[
                  ["Patrocinio principal", club.finances.sponsorship?.weekly ?? 0],
                  ["Tiendas y merchandising", Math.round(club.fanbase.followers * 0.11)],
                  ["Abonos y taquilla", Math.round(club.stadium.capacity * 1.1)],
                  ["Premios y TV", Math.round(club.reputation * 1200)],
                ].map(([k, v]) => (
                  <li key={k as string} className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-white/50">{k}</span>
                    <span className="font-semibold text-emerald-300">+{money(v as number)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Gastos semanales estimados">
              <ul className="space-y-2 text-sm">
                {[
                  ["Salarios de jugadores", wages],
                  ["Cuerpo técnico", staffWages],
                  ["Mantenimiento del estadio", Math.round(club.stadium.capacity * 0.09)],
                  ["Academia e instalaciones", 9000 + (club.facilities.academy?.level ?? 1) * 2500],
                ].map(([k, v]) => (
                  <li key={k as string} className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-white/50">{k}</span>
                    <span className="font-semibold text-rose-300">-{money(v as number)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Movimientos recientes" subtitle="Libro de cuentas del club">
            <ul className="space-y-2 text-sm">
              {club.finances.ledger.map((l, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
                  <span className="text-white/60">{l.concept}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-white/30">{formatGameDate(l.date)}</span>
                    <span className={l.type === "in" ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>
                      {l.type === "in" ? "+" : "-"}{money(Math.abs(l.amount))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
