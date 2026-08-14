/**
 * src/pages/MarketPage.tsx — Mercado de fichajes (FASE 4).
 * Escaparate con búsqueda avanzada, negociación, ventas, cesiones y renovaciones.
 */
import { useMemo, useState } from "react";
import {
  ArrowRightLeft, Check, Filter, Handshake, Inbox, Loader2, Search, SlidersHorizontal, Tag, TrendingUp, X,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Input, Modal, Rating, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { CLASS_STYLE, money, num } from "@/game/format";
import { COUNTRIES, countryFlag } from "@/game/data/countries";
import { GROUP_COLORS, PLAY_STYLES, POSITION_MAP, POSITIONS } from "@/game/data/traits";
import {
  ALL_PERSONALITIES, DEFAULT_FILTERS, filterListings, renewalDemand, SQUAD_MAX, SQUAD_MIN,
  suggestedPrice, type Listing, type MarketFilters,
} from "@/game/market";
import { formatGameDate, realTimeUntil } from "@/game/time";
import { navigate } from "@/lib/router";

const ALL_STYLES = Array.from(new Set(Object.values(PLAY_STYLES).flat()));

const KIND_LABEL: Record<string, string> = {
  transfer: "Traspaso", loan: "Cesión", free: "Libre",
};
const KIND_STYLE: Record<string, string> = {
  transfer: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  loan: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  free: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export default function MarketPage() {
  const {
    club, players, market, bid, signPlayer, listForSale, unlist, toggleLoan,
    acceptOffer, rejectOffer, renewContract,
  } = useGame();

  const [tab, setTab] = useState<"buscar" | "ofertas" | "vender" | "historial">("buscar");
  const [f, setF] = useState<MarketFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [target, setTarget] = useState<Listing | null>(null);
  const [fee, setFee] = useState(0);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sellTarget, setSellTarget] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState(0);
  const [renewTarget, setRenewTarget] = useState<string | null>(null);

  const listings = useMemo(() => (market ? filterListings(market.listings, f) : []), [market, f]);
  const wageUsed = useMemo(() => players.reduce((s, p) => s + p.contract.wage, 0), [players]);

  if (!club || !market) {
    return <EmptyState icon={<ArrowRightLeft />} title="Mercado no disponible" text="Recarga la aplicación para generar el escaparate de fichajes." />;
  }

  const negotiation = target ? market.negotiations[target.id] : null;

  function openNegotiation(l: Listing) {
    const n = market!.negotiations[l.id];
    setTarget(l);
    setFee(n?.counterPrice ?? n?.lastBid ?? l.askingPrice);
    setWage(n?.lastWage ?? l.wageDemand);
    setYears(l.contractYears);
    setMsg(null);
  }

  async function sendBid() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await bid(target.id, { fee, wage, years });
      if (res) {
        setMsg({ text: res.message, ok: res.status === "agreed" });
        if (res.counterPrice) setFee(res.counterPrice);
      }
    } finally { setBusy(false); }
  }

  async function confirmSign() {
    if (!target) return;
    setBusy(true);
    try {
      const err = await signPlayer(target.id);
      if (err) setMsg({ text: err, ok: false });
      else { setTarget(null); setMsg(null); }
    } finally { setBusy(false); }
  }

  async function doAccept(id: string) {
    setBusy(true);
    try {
      const err = await acceptOffer(id);
      if (err) setMsg({ text: err, ok: false });
    } finally { setBusy(false); }
  }

  const renewPlayer = renewTarget ? players.find((p) => p.id === renewTarget) : null;
  const renewDemand = renewPlayer ? renewalDemand(renewPlayer, club) : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Mercado de fichajes</h1>
          <p className="text-sm text-white/45">
            Escaparate renovado · próxima actualización en {realTimeUntil(market.listings[0]?.expiresAt ?? new Date().toISOString())}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Presupuesto fichajes" value={money(club.finances.transferBudget)} sub={`Caja ${money(club.finances.balance)}`} tone="good" />
        <StatTile label="Masa salarial" value={`${money(wageUsed)}/sem`} sub={`Tope ${money(club.finances.wageBudget)}`} tone={wageUsed > club.finances.wageBudget ? "bad" : "default"} />
        <StatTile label="Plantilla" value={`${players.length} / ${SQUAD_MAX}`} sub={`Mínimo ${SQUAD_MIN} jugadores`} tone={players.length >= SQUAD_MAX ? "warn" : "default"} />
        <StatTile label="Ofertas recibidas" value={market.incomingOffers.length} sub={`${Object.keys(market.listedForSale).length} en venta`} icon={<Inbox size={15} />} tone={market.incomingOffers.length ? "warn" : "default"} />
      </div>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {([
          ["buscar", `Buscar (${listings.length})`],
          ["ofertas", `Ofertas (${market.incomingOffers.length})`],
          ["vender", "Mi plantilla"],
          ["historial", "Historial"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === k ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      {/* ------------------------- BUSCAR ------------------------- */}
      {tab === "buscar" && (
        <>
          <Card>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="relative block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })}
                       placeholder="Buscar por nombre..."
                       className="w-full rounded-xl border border-white/10 bg-ink-900/80 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-white/25 focus:border-turf-500/60" />
              </label>
              <Select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as MarketFilters["sort"] })} className="sm:w-48">
                <option value="overall">Ordenar: Nivel</option>
                <option value="potential">Ordenar: Potencial</option>
                <option value="price">Ordenar: Precio</option>
                <option value="age">Ordenar: Edad</option>
                <option value="wage">Ordenar: Salario</option>
              </Select>
              <Button variant="outline" onClick={() => setShowFilters((v) => !v)}>
                <SlidersHorizontal size={15} /> Filtros
              </Button>
            </div>

            {showFilters && (
              <div className="fm-fade mt-4 grid gap-3 border-t border-white/8 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <Select label="Tipo de operación" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MarketFilters["kind"] })}>
                  <option value="all">Todas</option>
                  <option value="transfer">Traspaso</option>
                  <option value="loan">Cesión</option>
                  <option value="free">Agente libre</option>
                </Select>
                <Select label="Posición" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value as MarketFilters["position"] })}>
                  <option value="all">Todas</option>
                  {POSITIONS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                </Select>
                <Select label="Nacionalidad" value={f.nationality} onChange={(e) => setF({ ...f, nationality: e.target.value })}>
                  <option value="all">Cualquiera</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </Select>
                <Select label="Estilo de juego" value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })}>
                  <option value="all">Cualquiera</option>
                  {ALL_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select label="Personalidad" value={f.personality} onChange={(e) => setF({ ...f, personality: e.target.value })}>
                  <option value="all">Cualquiera</option>
                  {ALL_PERSONALITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Edad mín." type="number" value={f.minAge} onChange={(e) => setF({ ...f, minAge: Number(e.target.value) })} />
                  <Input label="Edad máx." type="number" value={f.maxAge} onChange={(e) => setF({ ...f, maxAge: Number(e.target.value) })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Nivel mín." type="number" value={f.minOverall} onChange={(e) => setF({ ...f, minOverall: Number(e.target.value) })} />
                  <Input label="Pot. mín." type="number" value={f.minPotential} onChange={(e) => setF({ ...f, minPotential: Number(e.target.value) })} />
                </div>
                <Input label="Precio máximo (€)" type="number" value={f.maxPrice || ""} placeholder="Sin límite"
                       onChange={(e) => setF({ ...f, maxPrice: Number(e.target.value) })} />
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full" onClick={() => setF(DEFAULT_FILTERS)}>
                    <X size={14} /> Limpiar filtros
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {listings.length === 0 ? (
            <EmptyState icon={<Filter />} title="Ningún jugador coincide" text="Prueba a relajar los filtros o espera a la próxima actualización del mercado." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {listings.map((l) => {
                const n = market.negotiations[l.id];
                const p = l.player;
                return (
                  <button key={l.id} onClick={() => openNegotiation(l)}
                          className="rounded-2xl border border-white/8 bg-ink-850/80 p-3.5 text-left transition hover:border-turf-500/40">
                    <div className="flex items-start gap-3">
                      <PlayerAvatar seed={p.seed} nationality={p.nationality} age={p.age} size={44} className="rounded-xl shrink-0" />
                      <Rating value={p.overall} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-semibold">{countryFlag(p.nationality)} {p.name}</span>
                          <span className={`rounded px-1 text-[9px] font-black ${CLASS_STYLE[p.potentialClass]}`}>{p.potentialClass}</span>
                        </div>
                        <p className="truncate text-[11px] text-white/40">
                          {p.age} años · {POSITION_MAP[p.position].label} · {p.playStyle}
                        </p>
                        <p className="truncate text-[11px] text-white/35">{p.personality} · {l.sellerName}</p>
                      </div>
                      <Badge className={KIND_STYLE[l.kind]}>{KIND_LABEL[l.kind]}</Badge>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/5 p-1.5">
                        <p className="text-[9px] uppercase text-white/35">Precio</p>
                        <p className="text-xs font-bold">{l.kind === "free" ? "Libre" : money(l.askingPrice)}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 p-1.5">
                        <p className="text-[9px] uppercase text-white/35">Ficha</p>
                        <p className="text-xs font-bold">{money(l.wageDemand)}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 p-1.5">
                        <p className="text-[9px] uppercase text-white/35">Interés</p>
                        <p className="text-xs font-bold">{l.interest}%</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Bar value={p.overall} className="flex-1" />
                      <span className="text-[10px] text-white/35">→ {p.potential}</span>
                    </div>
                    {n && (
                      <p className={`mt-2 truncate rounded px-2 py-1 text-[10px] ${
                        n.status === "agreed" ? "bg-turf-500/15 text-turf-300" :
                        n.status === "rejected" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>
                        {n.status === "agreed" ? "✓ Acuerdo alcanzado" : n.status === "rejected" ? "✗ Negociación rota" : `Contraoferta: ${money(n.counterPrice ?? 0)}`}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ------------------------- OFERTAS ------------------------- */}
      {tab === "ofertas" && (
        market.incomingOffers.length === 0 ? (
          <EmptyState icon={<Inbox />} title="No hay ofertas por tus jugadores"
                      text="Pon jugadores en el mercado desde la pestaña «Mi plantilla» para empezar a recibir propuestas." />
        ) : (
          <div className="space-y-3">
            {market.incomingOffers.map((o) => {
              const p = players.find((x) => x.id === o.playerId);
              return (
                <Card key={o.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    {p && <Rating value={p.overall} size="lg" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{o.playerName}</p>
                      <p className="text-xs text-white/45">
                        {o.kind === "transfer" ? "Oferta de traspaso" : `Cesión (asumen el ${o.wageShare}% de la ficha)`} · {o.buyerName}
                      </p>
                      <p className="text-[11px] text-white/35">Expira el {formatGameDate(o.expiresAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-emerald-300">{money(o.amount)}</p>
                      {p && <p className="text-[11px] text-white/35">Valor: {money(p.value)}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => doAccept(o.id)} disabled={busy}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aceptar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rejectOffer(o.id)}>Rechazar</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ------------------------- VENDER ------------------------- */}
      {tab === "vender" && (
        <Card dense>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                  <th className="px-4 py-3 text-left">Jugador</th>
                  <th className="px-2 py-3 text-center">Pos.</th>
                  <th className="px-2 py-3 text-center">Edad</th>
                  <th className="px-2 py-3 text-center">Nivel</th>
                  <th className="px-2 py-3 text-right">Valor</th>
                  <th className="px-2 py-3 text-right">Contrato</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const asking = market.listedForSale[p.id];
                  const onLoan = market.listedForLoan.includes(p.id);
                  return (
                    <tr key={p.id} className="border-b border-white/4">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{countryFlag(p.nationality)} {p.name}</span>
                          {asking !== undefined && <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-300">Venta {money(asking)}</Badge>}
                          {onLoan && <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">Cesión</Badge>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${GROUP_COLORS[POSITION_MAP[p.position].group]}`}>
                          {POSITION_MAP[p.position].short}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center text-white/55">{p.age}</td>
                      <td className="px-2 py-2 text-center font-bold text-turf-300">{Math.round(p.overall)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(p.value)}</td>
                      <td className="px-2 py-2 text-right text-[11px] text-white/45">
                        {formatGameDate(p.contract.expires)}<br />
                        <span className="text-white/35">{money(p.contract.wage)}/sem</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1.5">
                          {asking === undefined ? (
                            <Button size="sm" variant="outline" onClick={() => { setSellTarget(p.id); setSellPrice(suggestedPrice(p)); }}>
                              <Tag size={12} /> Vender
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => unlist(p.id)}>Retirar</Button>
                          )}
                          <Button size="sm" variant={onLoan ? "subtle" : "ghost"} onClick={() => toggleLoan(p.id)}>Ceder</Button>
                          <Button size="sm" variant="ghost" onClick={() => setRenewTarget(p.id)}>Renovar</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/6 px-4 py-3 text-xs text-white/35">
            No puedes bajar de {SQUAD_MIN} jugadores ni superar los {SQUAD_MAX}. Vender a un ídolo de la afición reduce la satisfacción.
          </p>
        </Card>
      )}

      {/* ------------------------ HISTORIAL ------------------------ */}
      {tab === "historial" && (
        market.history.length === 0 ? (
          <EmptyState icon={<TrendingUp />} title="Sin movimientos todavía" text="Aquí aparecerán todas tus compras, ventas, cesiones y renovaciones." />
        ) : (
          <Card dense>
            <ul className="divide-y divide-white/5">
              {market.history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge className={
                    h.type === "compra" || h.type === "libre" ? "border-sky-500/40 bg-sky-500/10 text-sky-300" :
                    h.type === "venta" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" :
                    "border-amber-500/40 bg-amber-500/10 text-amber-300"}>
                    {h.type.replace("_", " ")}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{h.playerName}</span>
                  <span className="hidden truncate text-xs text-white/45 sm:block">{h.otherClub}</span>
                  <span className="text-xs text-white/30">{formatGameDate(h.date)}</span>
                  <span className="font-semibold tabular-nums">{h.amount ? money(h.amount) : "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )
      )}

      {/* --------------------- MODAL NEGOCIACIÓN --------------------- */}
      <Modal open={!!target} onClose={() => setTarget(null)} title="Negociación" wide>
        {target && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Rating value={target.player.overall} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{countryFlag(target.player.nationality)} {target.player.name}</p>
                <p className="text-sm text-white/45">
                  {target.player.age} años · {POSITION_MAP[target.player.position].label} · Potencial {target.player.potential} ({target.player.potentialClass})
                </p>
                <p className="text-xs text-white/35">{target.player.playStyle} · {target.player.personality} · {target.sellerName}</p>
              </div>
              <button onClick={() => navigate(`/jugador/${target.player.id}`)} className="text-xs text-turf-300 hover:underline">Ficha</button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] uppercase text-white/35">Piden</p>
                <p className="font-bold">{target.kind === "free" ? "Libre" : money(target.askingPrice)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] uppercase text-white/35">Ficha exigida</p>
                <p className="font-bold">{money(target.wageDemand)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] uppercase text-white/35">Interés</p>
                <p className="font-bold">{target.interest}%</p>
              </div>
            </div>

            {target.kind !== "free" && (
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-white/50">Tu oferta económica</span>
                  <span className="font-bold">{money(fee)}</span>
                </div>
                <input type="range" min={0} max={Math.max(target.askingPrice * 1.6, 100000)} step={5000}
                       value={fee} onChange={(e) => setFee(Number(e.target.value))} className="w-full accent-emerald-500" />
              </div>
            )}

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-white/50">Salario ofrecido</span>
                <span className="font-bold">{money(wage)} / semana</span>
              </div>
              <input type="range" min={400} max={Math.max(target.wageDemand * 2, 5000)} step={50}
                     value={wage} onChange={(e) => setWage(Number(e.target.value))} className="w-full accent-emerald-500" />
            </div>

            <Select label="Duración del contrato" value={years} onChange={(e) => setYears(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} temporada{y > 1 ? "s" : ""}</option>)}
            </Select>

            {negotiation && (
              <p className={`rounded-xl border px-3 py-2.5 text-sm ${
                negotiation.status === "agreed" ? "border-turf-500/40 bg-turf-500/10 text-turf-300" :
                negotiation.status === "rejected" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" :
                "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                {negotiation.message}
              </p>
            )}

            <div className="rounded-xl bg-white/4 p-3 text-xs text-white/45">
              Coste total del primer año ≈ <b className="text-white/70">{money(fee + wage * 52)}</b> ·
              Caja disponible: {money(club.finances.balance)} · Masa salarial tras el fichaje: {money(wageUsed + wage)}/sem
            </div>

            <div className="flex flex-wrap gap-2">
              {negotiation?.status === "agreed" ? (
                <Button className="flex-1" onClick={confirmSign} disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Handshake size={15} />} Cerrar fichaje
                </Button>
              ) : (
                <Button className="flex-1" onClick={sendBid} disabled={busy || negotiation?.status === "rejected"}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                  {negotiation ? "Mejorar oferta" : "Enviar oferta"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setTarget(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* --------------------- MODAL PONER EN VENTA --------------------- */}
      <Modal open={!!sellTarget} onClose={() => setSellTarget(null)} title="Poner en el mercado">
        {sellTarget && (() => {
          const p = players.find((x) => x.id === sellTarget)!;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Rating value={p.overall} size="lg" />
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs text-white/45">Valor de mercado: {money(p.value)} · Sugerido: {money(suggestedPrice(p))}</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-white/50">Precio de venta</span>
                  <span className="font-bold">{money(sellPrice)}</span>
                </div>
                <input type="range" min={0} max={Math.max(p.value * 3, 200000)} step={5000}
                       value={sellPrice} onChange={(e) => setSellPrice(Number(e.target.value))} className="w-full accent-emerald-500" />
                <p className="mt-1 text-[11px] text-white/35">
                  Cuanto más te acerques al valor real, antes recibirás ofertas de otros clubes.
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={async () => { await listForSale(sellTarget, sellPrice); setSellTarget(null); }}>
                  <Tag size={15} /> Publicar
                </Button>
                <Button variant="outline" onClick={() => setSellTarget(null)}>Cancelar</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* --------------------- MODAL RENOVACIÓN --------------------- */}
      <Modal open={!!renewTarget} onClose={() => setRenewTarget(null)} title="Renovación de contrato">
        {renewPlayer && renewDemand && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Rating value={renewPlayer.overall} size="lg" />
              <div>
                <p className="font-bold">{renewPlayer.name}</p>
                <p className="text-xs text-white/45">
                  Contrato actual: {money(renewPlayer.contract.wage)}/sem hasta {formatGameDate(renewPlayer.contract.expires)}
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-sm">
              <p className="text-white/45">Su representante pide:</p>
              <p className="mt-1 font-bold">
                {money(renewDemand.wage)} / semana durante {renewDemand.years} temporada{renewDemand.years > 1 ? "s" : ""}
              </p>
              {!renewDemand.accepts && (
                <p className="mt-2 text-xs text-amber-300">
                  Advertencia: el jugador considera que tu club está por debajo de sus aspiraciones. Puede rechazarlo.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const err = await renewContract(renewPlayer.id, renewDemand.wage, renewDemand.years);
                          setMsg(err ? { text: err, ok: false } : { text: `${renewPlayer.name} renueva su contrato.`, ok: true });
                          setRenewTarget(null);
                        } finally { setBusy(false); }
                      }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aceptar condiciones
              </Button>
              <Button variant="outline" onClick={() => setRenewTarget(null)}>Cancelar</Button>
            </div>
          </div>
        )}
      </Modal>

      <p className="pb-2 text-center text-[11px] text-white/25">
        Jugadores ficticios generados proceduralmente · Plantilla {num(players.length)}/{SQUAD_MAX}
      </p>
    </div>
  );
}
