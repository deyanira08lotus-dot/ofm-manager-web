/**
 * src/pages/FinancePage.tsx — economía, patrocinadores, entradas y directiva (FASE 3).
 */
import { useMemo, useState } from "react";
import {
  Banknote, Check, Handshake, Landmark, Loader2, PiggyBank, Receipt, Ticket, TrendingDown, TrendingUp, Users2,
} from "lucide-react";
import { Bar, Button, Card, MiniBars, Modal, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, num } from "@/game/format";
import {
  boardReport, fairTicketPrice, matchdayIncome, sponsorOffers, weeklyBreakdown, type SponsorOffer,
} from "@/game/economy";
import { sortedTable } from "@/game/league";
import { formatGameDate } from "@/game/time";

export default function FinancePage() {
  const { club, players, staff, league, setTicketPrice, signSponsor, requestBudget } = useGame();
  const [price, setPrice] = useState(club?.stadium.ticketPrice ?? 25);
  const [busy, setBusy] = useState(false);
  const [savedPrice, setSavedPrice] = useState(false);
  const [grant, setGrant] = useState<number | null>(null);
  const [sponsorModal, setSponsorModal] = useState(false);

  const position = useMemo(() => {
    if (!league || !club) return 0;
    return sortedTable(league).findIndex((r) => r.clubId === club.id) + 1;
  }, [league, club]);

  const bd = useMemo(() => (club ? weeklyBreakdown(club, players, staff) : null), [club, players, staff]);
  const offers = useMemo(() => (club ? sponsorOffers(club, position) : []), [club, position]);
  const report = useMemo(
    () => (club && bd ? boardReport(club, { position, teams: league?.clubs.length ?? 12, net: bd.net }) : null),
    [club, bd, position, league]
  );
  const gate = useMemo(
    () => (club ? matchdayIncome({ ...club, stadium: { ...club.stadium, ticketPrice: price } }, { rivalRating: 55, seed: `${club.id}:preview:${price}` }) : null),
    [club, price]
  );

  if (!club || !bd || !report) return null;
  const fair = fairTicketPrice(club);

  async function applyPrice() {
    setBusy(true);
    try { await setTicketPrice(price); setSavedPrice(true); } finally { setBusy(false); }
  }
  async function pickSponsor(offer: SponsorOffer) {
    setBusy(true);
    try { await signSponsor(offer); setSponsorModal(false); } finally { setBusy(false); }
  }
  async function askBudget() {
    setBusy(true);
    try { setGrant(await requestBudget()); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Economía y directiva</h1>
        <p className="text-sm text-white/45">
          Las cuentas se liquidan cada semana de juego, incluso mientras estás desconectado.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Saldo" value={money(club.finances.balance)} icon={<Landmark size={15} />} tone={club.finances.balance >= 0 ? "good" : "bad"} />
        <StatTile label="Balance semanal" value={`${bd.net >= 0 ? "+" : ""}${money(bd.net)}`} sub={`${money(bd.totalIncome)} / ${money(bd.totalExpense)}`} icon={bd.net >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} tone={bd.net >= 0 ? "good" : "bad"} />
        <StatTile label="Presupuesto fichajes" value={money(club.finances.transferBudget)} icon={<PiggyBank size={15} />} />
        <StatTile label="Tope salarial" value={`${money(club.finances.wageBudget)}/sem`} sub={`Usado ${money(players.reduce((s, p) => s + p.contract.wage, 0))}`} icon={<Users2 size={15} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Ingresos semanales" subtitle={money(bd.totalIncome)}>
          <ul className="space-y-2 text-sm">
            {bd.income.map((i) => (
              <li key={i.label} className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-white/50">{i.label}</span>
                <span className="font-semibold text-emerald-300">+{money(i.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Gastos semanales" subtitle={money(bd.totalExpense)}>
          <ul className="space-y-2 text-sm">
            {bd.expense.map((e) => (
              <li key={e.label} className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-white/50">{e.label}</span>
                <span className="font-semibold text-rose-300">-{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Distribución" subtitle="Proporción de ingresos y gastos">
          <MiniBars
            data={[
              ...bd.income.map((i) => ({ label: i.label.split(" ")[0], value: Math.round(i.amount / 1000) })),
              ...bd.expense.slice(0, 2).map((e) => ({ label: e.label.split(" ")[0], value: Math.round(e.amount / 1000), color: "bg-rose-400/70" })),
            ]}
          />
          <p className="mt-3 text-[11px] text-white/35">Valores en miles de euros por semana.</p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Entradas */}
        <Card title={<span className="flex items-center gap-2"><Ticket size={15} /> Precio de las entradas</span>}
              subtitle={`Precio justo estimado por la afición: ${money(fair, { compact: false })}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-3xl font-black">{money(price, { compact: false })}</span>
            <span className={`text-xs font-semibold ${price > fair * 1.15 ? "text-rose-300" : price < fair * 0.85 ? "text-emerald-300" : "text-white/50"}`}>
              {price > fair * 1.15 ? "Caro para la afición" : price < fair * 0.85 ? "Muy asequible" : "Precio razonable"}
            </span>
          </div>
          <input type="range" min={5} max={120} value={price}
                 onChange={(e) => { setPrice(Number(e.target.value)); setSavedPrice(false); }}
                 className="w-full accent-emerald-500" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="text-lg font-black">{gate ? `${gate.occupancy}%` : "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/35">Ocupación</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="text-lg font-black">{gate ? num(gate.attendance) : "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/35">Asistencia</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="text-lg font-black text-emerald-300">{gate ? money(gate.total) : "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/35">Por partido</p>
            </div>
          </div>
          <Button className="mt-3 w-full" onClick={applyPrice} disabled={busy}>
            {savedPrice ? <Check size={15} /> : <Ticket size={15} />} {savedPrice ? "Precio aplicado" : "Aplicar precio"}
          </Button>
          <p className="mt-2 text-[11px] text-white/35">
            Subir mucho el precio aumenta el ingreso por entrada pero reduce la asistencia y la satisfacción de la afición.
          </p>
        </Card>

        {/* Patrocinio */}
        <Card title={<span className="flex items-center gap-2"><Handshake size={15} /> Patrocinio principal</span>}
              subtitle={club.finances.sponsorship ? `Contrato activo hasta ${formatGameDate(club.finances.sponsorship.expires)}` : "Sin patrocinador"}>
          {club.finances.sponsorship ? (
            <div className="rounded-xl border border-white/8 bg-ink-900/60 p-4">
              <p className="text-lg font-bold">{club.finances.sponsorship.name}</p>
              <p className="mt-1 text-sm text-emerald-300">{money(club.finances.sponsorship.weekly)} / semana</p>
              <p className="mt-1 text-xs text-white/40">Vence el {formatGameDate(club.finances.sponsorship.expires, { long: true })}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Tu club no tiene patrocinador. Estás perdiendo ingresos semanales.
            </p>
          )}
          <Button variant={club.finances.sponsorship ? "outline" : "primary"} className="mt-3 w-full" onClick={() => setSponsorModal(true)}>
            <Handshake size={15} /> Ver ofertas de patrocinio
          </Button>
          <p className="mt-2 text-[11px] text-white/35">
            Las ofertas mejoran con la reputación del club, la masa social y la posición en la liga.
          </p>
        </Card>
      </div>

      {/* Directiva */}
      <Card title="Consejo de administración" subtitle={`Presidente ${club.board.chairman}`}>
        <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-white/45">Confianza de la directiva</span>
              <span className={`font-bold ${report.tone === "good" ? "text-emerald-300" : report.tone === "warn" ? "text-amber-300" : "text-rose-300"}`}>
                {Math.round(report.confidence)}%
              </span>
            </div>
            <Bar value={report.confidence} />
            <p className={`mt-2 text-sm font-semibold ${report.tone === "good" ? "text-emerald-300" : report.tone === "warn" ? "text-amber-300" : "text-rose-300"}`}>
              {report.verdict}
            </p>
            <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs">
              <p className="text-white/40">Objetivo de temporada</p>
              <p className="font-semibold text-turf-300">{club.board.objective}</p>
              <p className="mt-2 text-white/40">Posición actual</p>
              <p className="font-semibold">{position > 0 ? `${position}º de ${league?.clubs.length ?? 12}` : "Sin partidos"}</p>
            </div>
          </div>
          <div>
            <ul className="space-y-2 text-sm">
              {report.notes.map((n, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-white/4 px-3 py-2 text-white/60">
                  <span className="text-white/25">›</span>{n}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={askBudget} disabled={busy || !report.canRequestBudget}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Banknote size={15} />} Pedir ampliación de presupuesto
              </Button>
              {!report.canRequestBudget && (
                <span className="self-center text-xs text-white/35">Necesitas al menos 55% de confianza y saldo positivo.</span>
              )}
            </div>
            {grant !== null && (
              <p className="mt-2 rounded-lg border border-turf-500/30 bg-turf-500/10 px-3 py-2 text-sm text-turf-300">
                La directiva concede {money(grant)} adicionales para fichajes (la confianza baja 6 puntos).
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Libro de cuentas */}
      <Card title={<span className="flex items-center gap-2"><Receipt size={15} /> Libro de cuentas</span>} subtitle="Últimos movimientos">
        <ul className="space-y-1.5 text-sm">
          {club.finances.ledger.map((l, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-white/60">{l.concept}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-white/30">{formatGameDate(l.date)}</span>
                <span className={l.type === "in" ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>
                  {l.type === "in" ? "+" : "-"}{money(Math.abs(l.amount))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={sponsorModal} onClose={() => setSponsorModal(false)} title="Ofertas de patrocinio" wide>
        <div className="grid gap-3 sm:grid-cols-3">
          {offers.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/10 bg-ink-900/60 p-4">
              <p className="text-sm font-bold">{o.name}</p>
              <p className="mt-2 text-xl font-black text-emerald-300">{money(o.weekly)}</p>
              <p className="text-[11px] text-white/40">por semana</p>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-white/40">Duración</dt><dd className="font-semibold">{o.years} temporada(s)</dd></div>
                <div className="flex justify-between"><dt className="text-white/40">Prima de firma</dt><dd className="font-semibold">{money(o.signingBonus)}</dd></div>
                <div className="flex justify-between"><dt className="text-white/40">Condición</dt><dd className="text-right font-semibold">{o.requirement}</dd></div>
              </dl>
              <Button className="mt-3 w-full" size="sm" onClick={() => pickSponsor(o)} disabled={busy}>Firmar</Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/35">
          Al firmar un nuevo acuerdo se sustituye el patrocinio actual y se cobra la prima de firma inmediatamente.
        </p>
      </Modal>
    </div>
  );
}
