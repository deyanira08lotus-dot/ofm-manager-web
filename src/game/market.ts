/**
 * src/game/market.ts
 * MERCADO DE FICHAJES (FASE 4).
 * - Escaparate procedural que se renueva cada pocos días de juego.
 * - Negociación con IA: puja, contraoferta, aceptación o rechazo.
 * - Ventas: la IA hace ofertas por tus jugadores listados.
 * - Cesiones con reparto de salario y agentes libres.
 * - Renovación de contratos.
 *
 * Motor puro (sin React ni Firebase) → portable a Cloud Functions.
 */
import type { Club, Player, PositionCode } from "@/types";
import { COUNTRIES } from "./data/countries";
import { PERSONALITIES, POSITION_MAP } from "./data/traits";
import { Rng, uid } from "./rng";
import { generatePlayer, marketValue } from "./players";
import { addDays, addYears, gameNow } from "./time";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type ListingKind = "transfer" | "loan" | "free";

export interface Listing {
  id: string;
  player: Player;
  kind: ListingKind;
  /** Nombre del club vendedor (ficticio, generado) */
  sellerName: string;
  askingPrice: number;
  /** Salario semanal que exige el jugador */
  wageDemand: number;
  /** Duración del contrato que pide (años) */
  contractYears: number;
  /** Interés del jugador en tu proyecto (0-100) */
  interest: number;
  expiresAt: string;
}

export interface Negotiation {
  listingId: string;
  playerId: string;
  rounds: number;
  lastBid: number;
  lastWage: number;
  counterPrice: number | null;
  status: "open" | "agreed" | "rejected" | "completed";
  message: string;
  updatedAt: number;
}

export interface IncomingOffer {
  id: string;
  playerId: string;
  playerName: string;
  buyerName: string;
  amount: number;
  kind: "transfer" | "loan";
  /** Porcentaje del salario que asume el club que recibe la cesión */
  wageShare?: number;
  expiresAt: string;
}

export interface TransferRecord {
  id: string;
  date: string;
  type: "compra" | "venta" | "cesion_in" | "cesion_out" | "libre" | "renovacion";
  playerName: string;
  otherClub: string;
  amount: number;
}

export interface LoanDeal {
  playerId: string;
  playerName: string;
  fromClub: string;
  wageShare: number;
  returnsAt: string;
}

export interface MarketState {
  id: string;
  ownerUid: string;
  clubId: string;
  periodIndex: number;
  listings: Listing[];
  listedForSale: Record<string, number>;   // playerId -> precio pedido
  listedForLoan: string[];
  incomingOffers: IncomingOffer[];
  negotiations: Record<string, Negotiation>;
  loansIn: LoanDeal[];
  history: TransferRecord[];
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Constantes de mercado                                               */
/* ------------------------------------------------------------------ */

export const SQUAD_MIN = 16;
export const SQUAD_MAX = 30;
/** Días de juego que dura cada escaparate */
const MARKET_PERIOD_DAYS = 3;
const LISTINGS_PER_PERIOD = 26;

const CLUB_A = ["Atlético", "Real", "Sporting", "Unión", "Racing", "Deportivo", "Club", "FC", "Olímpico", "Nacional", "Estrella", "Provincial"];
const CLUB_B = ["Valmar", "Ríos", "Aurora", "Montenegro", "Bahía", "Ferrolán", "Nordeste", "Castilar", "Verdal", "Oriente", "Peñalba", "Alborada", "Ribalta", "Monteverde", "Costa Azul", "Sanvedra", "Trelles", "Ambrona"];

export function marketPeriod(now: Date = gameNow()): number {
  return Math.floor(now.getTime() / (MARKET_PERIOD_DAYS * 86400000));
}

/* ------------------------------------------------------------------ */
/* Generación del escaparate                                           */
/* ------------------------------------------------------------------ */

function askingPriceFor(p: Player, kind: ListingKind, rng: Rng): number {
  if (kind === "free") return 0;
  if (kind === "loan") return Math.round((p.value * rng.float(0.02, 0.06)) / 1000) * 1000;
  // Los clubes piden por encima del valor de mercado
  const greed = 1.05 + rng.float(0, 0.55) + (p.potential - p.overall) * 0.012;
  return Math.round((p.value * greed) / 5000) * 5000;
}

function wageDemandFor(p: Player, rng: Rng): number {
  const base = p.contract.wage * rng.float(1.05, 1.4);
  const ambition = p.personality === "Ambicioso" ? 1.15 : p.personality === "Leal" ? 0.95 : 1;
  return Math.max(400, Math.round((base * ambition) / 50) * 50);
}

/** Genera el escaparate del periodo actual (determinista por semilla) */
export function generateListings(params: {
  clubId: string;
  leagueCountry: string;
  clubReputation: number;
  period: number;
}): Listing[] {
  const rng = new Rng(`market:${params.period}:${params.leagueCountry}`);
  const now = gameNow();
  const out: Listing[] = [];
  const positions: PositionCode[] = ["GK", "CB", "CB", "LB", "RB", "DM", "CM", "CM", "AM", "LW", "RW", "ST", "ST"];

  for (let i = 0; i < LISTINGS_PER_PERIOD; i++) {
    const kind: ListingKind = rng.weighted([
      ["transfer", 62],
      ["loan", 20],
      ["free", 18],
    ]);
    // La calidad disponible orbita la reputación del club (con sorpresas)
    const quality = Math.max(
      32,
      Math.min(88, params.clubReputation * 0.72 + rng.gauss(14, 11, -14, 30))
    );
    const nationality = rng.chance(0.45) ? params.leagueCountry : rng.pick(COUNTRIES).code;
    const player = generatePlayer({
      seed: `mk_${params.period}_${i}_${rng.int(1000, 9999)}`,
      leagueCountry: nationality,
      forceLocal: true,
      position: rng.pick(positions),
      quality,
      minAge: kind === "free" ? 24 : 17,
      maxAge: kind === "free" ? 36 : 33,
      clubId: null,
      origin: kind === "free" ? "free" : "transfer",
    });

    // Los agentes libres suelen ser mayores y algo más baratos de ficha
    if (kind === "free") {
      player.status = "free";
      player.contract.wage = Math.round(player.contract.wage * 0.88);
    }

    const interest = Math.round(
      Math.max(5, Math.min(99,
        50 + (params.clubReputation - player.reputation) * 0.7 +
        (player.personality === "Ambicioso" ? -8 : 0) +
        (player.personality === "Leal" ? -5 : 0) +
        rng.int(-12, 14)
      ))
    );

    out.push({
      id: `l_${params.period}_${i}`,
      player,
      kind,
      sellerName: kind === "free" ? "Agente libre" : `${rng.pick(CLUB_A)} ${rng.pick(CLUB_B)}`,
      askingPrice: askingPriceFor(player, kind, rng),
      wageDemand: wageDemandFor(player, rng),
      contractYears: rng.int(2, 5),
      interest,
      expiresAt: addDays(now, MARKET_PERIOD_DAYS).toISOString(),
    });
  }
  return out.sort((a, b) => b.player.overall - a.player.overall);
}

export function createMarket(club: Club): MarketState {
  const period = marketPeriod();
  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    periodIndex: period,
    listings: generateListings({
      clubId: club.id,
      leagueCountry: club.country,
      clubReputation: club.reputation,
      period,
    }),
    listedForSale: {},
    listedForLoan: [],
    incomingOffers: [],
    negotiations: {},
    loansIn: [],
    history: [],
    updatedAt: Date.now(),
  };
}

/** Refresca el escaparate si ha cambiado el periodo y caduca ofertas viejas */
export function refreshMarket(market: MarketState, club: Club): MarketState {
  const period = marketPeriod();
  const nowMs = gameNow().getTime();
  let next = market;

  if (market.periodIndex !== period) {
    next = {
      ...market,
      periodIndex: period,
      listings: generateListings({
        clubId: club.id,
        leagueCountry: club.country,
        clubReputation: club.reputation,
        period,
      }),
      negotiations: {},
      updatedAt: Date.now(),
    };
  }

  const validOffers = next.incomingOffers.filter((o) => Date.parse(o.expiresAt) > nowMs);
  if (validOffers.length !== next.incomingOffers.length) {
    next = { ...next, incomingOffers: validOffers };
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Negociación de compra                                               */
/* ------------------------------------------------------------------ */

export interface BidInput {
  fee: number;
  wage: number;
  years: number;
}

export interface BidResult {
  market: MarketState;
  status: "agreed" | "counter" | "rejected";
  message: string;
  counterPrice?: number;
}

/**
 * Evalúa una puja. La IA valora: precio frente a lo pedido, salario ofrecido
 * frente a lo exigido, reputación del club y personalidad del jugador.
 */
export function submitBid(
  market: MarketState,
  club: Club,
  listingId: string,
  bid: BidInput
): BidResult {
  const listing = market.listings.find((l) => l.id === listingId);
  if (!listing) return { market, status: "rejected", message: "El jugador ya no está disponible." };

  const prev = market.negotiations[listingId];
  const rounds = (prev?.rounds ?? 0) + 1;
  const rng = new Rng(`${listingId}:${rounds}:${bid.fee}`);

  const target = prev?.counterPrice ?? listing.askingPrice;
  const feeRatio = listing.kind === "free" ? 1 : bid.fee / Math.max(1, target);
  const wageRatio = bid.wage / Math.max(1, listing.wageDemand);

  // El jugador tiene que querer venir
  const projectAppeal =
    listing.interest * 0.55 +
    Math.min(45, (wageRatio - 1) * 90) +
    (club.reputation - listing.player.reputation) * 0.35 +
    (bid.years >= listing.contractYears ? 6 : -4);

  const playerHappy = wageRatio >= 0.94 && projectAppeal > 22;
  const clubHappy = feeRatio >= 0.97;

  let status: BidResult["status"];
  let message: string;
  let counterPrice: number | null = prev?.counterPrice ?? null;

  if (!playerHappy && wageRatio < 0.85) {
    status = "rejected";
    message = `${listing.player.name} rechaza la oferta: pide al menos ${Math.round(listing.wageDemand).toLocaleString("es-ES")} € semanales.`;
  } else if (!playerHappy) {
    status = "rejected";
    message = `${listing.player.name} no ve atractivo el proyecto ahora mismo. Mejora la ficha o gana reputación.`;
  } else if (clubHappy) {
    status = "agreed";
    message = listing.kind === "free"
      ? `¡${listing.player.name} acepta! Puedes cerrar su fichaje como agente libre.`
      : `¡Acuerdo alcanzado con el ${listing.sellerName}! ${listing.player.name} firmará por ti.`;
  } else if (rounds >= 4 || feeRatio < 0.55) {
    status = "rejected";
    message = `El ${listing.sellerName} rompe las negociaciones: tu oferta está muy lejos de lo pedido.`;
  } else {
    status = "counter";
    const stubbornness = 0.55 + rng.float(0, 0.25) - rounds * 0.06;
    counterPrice = Math.round(((target * stubbornness + bid.fee * (1 - stubbornness))) / 5000) * 5000;
    counterPrice = Math.max(bid.fee + 5000, counterPrice);
    message = `El ${listing.sellerName} rechaza tu oferta pero aceptaría ${counterPrice.toLocaleString("es-ES")} €.`;
  }

  const negotiation: Negotiation = {
    listingId,
    playerId: listing.player.id,
    rounds,
    lastBid: bid.fee,
    lastWage: bid.wage,
    counterPrice: status === "counter" ? counterPrice : null,
    status: status === "agreed" ? "agreed" : status === "rejected" ? "rejected" : "open",
    message,
    updatedAt: Date.now(),
  };

  return {
    market: { ...market, negotiations: { ...market.negotiations, [listingId]: negotiation }, updatedAt: Date.now() },
    status,
    message,
    counterPrice: counterPrice ?? undefined,
  };
}

export interface SignResult {
  market: MarketState;
  club: Club;
  player: Player | null;
  error?: string;
  record?: TransferRecord;
}

/** Cierra la operación tras un acuerdo (compra, cesión o agente libre) */
export function completeSigning(
  market: MarketState,
  club: Club,
  squadSize: number,
  listingId: string
): SignResult {
  const listing = market.listings.find((l) => l.id === listingId);
  const negotiation = market.negotiations[listingId];
  if (!listing) return { market, club, player: null, error: "El jugador ya no está disponible." };
  if (!negotiation || negotiation.status !== "agreed") {
    return { market, club, player: null, error: "Todavía no hay acuerdo cerrado." };
  }
  if (squadSize >= SQUAD_MAX) {
    return { market, club, player: null, error: `Plantilla llena (máximo ${SQUAD_MAX} jugadores).` };
  }

  const fee = listing.kind === "free" ? 0 : negotiation.lastBid;
  if (club.finances.balance < fee) {
    return { market, club, player: null, error: "Saldo insuficiente para pagar el traspaso." };
  }

  const now = gameNow();
  const player: Player = {
    ...listing.player,
    clubId: club.id,
    ownerUid: club.ownerUid,
    status: "active",
    origin: listing.kind === "free" ? "free" : "transfer",
    contract: {
      ...listing.player.contract,
      wage: negotiation.lastWage,
      expires: addYears(now, listing.contractYears).toISOString(),
      signedOn: now.toISOString(),
      releaseClause: Math.round(Math.max(fee, listing.player.value) * 2.4),
    },
    morale: Math.min(99, listing.player.morale + 8),
    history: [
      ...listing.player.history,
      {
        date: now.toISOString(),
        type: "transfer",
        text:
          listing.kind === "free"
            ? `Firma como agente libre por el ${club.name}.`
            : listing.kind === "loan"
            ? `Llega cedido al ${club.name} procedente del ${listing.sellerName}.`
            : `Fichado por el ${club.name} desde el ${listing.sellerName} por ${fee.toLocaleString("es-ES")} €.`,
      },
    ],
  };

  const record: TransferRecord = {
    id: uid("tr"),
    date: now.toISOString(),
    type: listing.kind === "free" ? "libre" : listing.kind === "loan" ? "cesion_in" : "compra",
    playerName: player.name,
    otherClub: listing.sellerName,
    amount: fee,
  };

  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance -= fee;
  nextClub.finances.transferBudget = Math.max(0, nextClub.finances.transferBudget - fee);
  nextClub.squadSize = squadSize + 1;
  if (fee > 0) {
    nextClub.finances.ledger = [
      { date: now.toISOString(), concept: `Traspaso: ${player.name}`, amount: fee, type: "out" as const },
      ...nextClub.finances.ledger,
    ].slice(0, 40);
  }
  nextClub.updatedAt = Date.now();

  const nextMarket: MarketState = {
    ...market,
    listings: market.listings.filter((l) => l.id !== listingId),
    negotiations: { ...market.negotiations, [listingId]: { ...negotiation, status: "completed" } },
    loansIn:
      listing.kind === "loan"
        ? [...market.loansIn, { playerId: player.id, playerName: player.name, fromClub: listing.sellerName, wageShare: 60, returnsAt: addYears(now, 1).toISOString() }]
        : market.loansIn,
    history: [record, ...market.history].slice(0, 60),
    updatedAt: Date.now(),
  };

  return { market: nextMarket, club: nextClub, player, record };
}

/* ------------------------------------------------------------------ */
/* Ventas y cesiones de tus jugadores                                  */
/* ------------------------------------------------------------------ */

export function listPlayer(market: MarketState, playerId: string, price: number): MarketState {
  return {
    ...market,
    listedForSale: { ...market.listedForSale, [playerId]: Math.max(0, Math.round(price)) },
    updatedAt: Date.now(),
  };
}

export function unlistPlayer(market: MarketState, playerId: string): MarketState {
  const listedForSale = { ...market.listedForSale };
  delete listedForSale[playerId];
  return {
    ...market,
    listedForSale,
    listedForLoan: market.listedForLoan.filter((id) => id !== playerId),
    incomingOffers: market.incomingOffers.filter((o) => o.playerId !== playerId),
    updatedAt: Date.now(),
  };
}

export function toggleLoanList(market: MarketState, playerId: string): MarketState {
  const on = market.listedForLoan.includes(playerId);
  return {
    ...market,
    listedForLoan: on ? market.listedForLoan.filter((id) => id !== playerId) : [...market.listedForLoan, playerId],
    updatedAt: Date.now(),
  };
}

/** La IA genera ofertas por los jugadores que tengas en el mercado */
export function generateIncomingOffers(market: MarketState, players: Player[]): MarketState {
  const now = gameNow();
  const rng = new Rng(`offers:${market.clubId}:${Math.floor(now.getTime() / 86400000)}`);
  const offers: IncomingOffer[] = [...market.incomingOffers];

  for (const [playerId, asking] of Object.entries(market.listedForSale)) {
    if (offers.some((o) => o.playerId === playerId && o.kind === "transfer")) continue;
    const p = players.find((x) => x.id === playerId);
    if (!p) continue;
    // Cuanto más razonable sea el precio, más probable es recibir oferta
    const fairness = p.value / Math.max(1, asking);
    if (!rng.chance(Math.min(0.85, 0.18 + fairness * 0.45))) continue;
    const amount = Math.round((asking * rng.float(0.72, 1.02)) / 5000) * 5000;
    offers.push({
      id: uid("off"),
      playerId,
      playerName: p.name,
      buyerName: `${rng.pick(CLUB_A)} ${rng.pick(CLUB_B)}`,
      amount,
      kind: "transfer",
      expiresAt: addDays(now, 3).toISOString(),
    });
  }

  for (const playerId of market.listedForLoan) {
    if (offers.some((o) => o.playerId === playerId && o.kind === "loan")) continue;
    const p = players.find((x) => x.id === playerId);
    if (!p) continue;
    if (!rng.chance(0.55)) continue;
    offers.push({
      id: uid("off"),
      playerId,
      playerName: p.name,
      buyerName: `${rng.pick(CLUB_A)} ${rng.pick(CLUB_B)}`,
      amount: Math.round((p.value * rng.float(0.02, 0.05)) / 1000) * 1000,
      kind: "loan",
      wageShare: rng.int(40, 90),
      expiresAt: addDays(now, 3).toISOString(),
    });
  }

  return offers.length === market.incomingOffers.length ? market : { ...market, incomingOffers: offers, updatedAt: Date.now() };
}

export interface SaleResult {
  market: MarketState;
  club: Club;
  soldPlayerId: string | null;
  error?: string;
  record?: TransferRecord;
}

export function acceptOffer(
  market: MarketState,
  club: Club,
  players: Player[],
  offerId: string
): SaleResult {
  const offer = market.incomingOffers.find((o) => o.id === offerId);
  if (!offer) return { market, club, soldPlayerId: null, error: "La oferta ha expirado." };
  const player = players.find((p) => p.id === offer.playerId);
  if (!player) return { market, club, soldPlayerId: null, error: "Jugador no encontrado." };
  if (offer.kind === "transfer" && players.length <= SQUAD_MIN) {
    return { market, club, soldPlayerId: null, error: `No puedes bajar de ${SQUAD_MIN} jugadores.` };
  }

  const now = gameNow();
  const record: TransferRecord = {
    id: uid("tr"),
    date: now.toISOString(),
    type: offer.kind === "transfer" ? "venta" : "cesion_out",
    playerName: player.name,
    otherClub: offer.buyerName,
    amount: offer.amount,
  };

  const nextClub: Club = JSON.parse(JSON.stringify(club));
  nextClub.finances.balance += offer.amount;
  nextClub.finances.transferBudget += Math.round(offer.amount * 0.7);
  if (offer.kind === "transfer") nextClub.squadSize = Math.max(0, nextClub.squadSize - 1);
  nextClub.finances.ledger = [
    {
      date: now.toISOString(),
      concept: `${offer.kind === "transfer" ? "Venta" : "Cesión"}: ${player.name} → ${offer.buyerName}`,
      amount: offer.amount,
      type: "in" as const,
    },
    ...nextClub.finances.ledger,
  ].slice(0, 40);
  // La afición se resiente si vendes a un favorito
  if (nextClub.fanbase.favouritePlayerIds.includes(player.id) && offer.kind === "transfer") {
    nextClub.fanbase.satisfaction = Math.max(5, nextClub.fanbase.satisfaction - 8);
    nextClub.fanbase.favouritePlayerIds = nextClub.fanbase.favouritePlayerIds.filter((id) => id !== player.id);
  }
  nextClub.updatedAt = Date.now();

  const nextMarket = {
    ...unlistPlayer(market, player.id),
    history: [record, ...market.history].slice(0, 60),
    updatedAt: Date.now(),
  };

  return {
    market: nextMarket,
    club: nextClub,
    soldPlayerId: offer.kind === "transfer" ? player.id : null,
    record,
  };
}

export function rejectOffer(market: MarketState, offerId: string): MarketState {
  return { ...market, incomingOffers: market.incomingOffers.filter((o) => o.id !== offerId), updatedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Renovación de contratos                                             */
/* ------------------------------------------------------------------ */

export function renewalDemand(player: Player, club: Club): { wage: number; years: number; accepts: boolean } {
  const rng = new Rng(`renew:${player.id}:${player.contract.expires}`);
  const growth = 1 + Math.max(0, player.potential - player.overall) * 0.012;
  const ambition = player.personality === "Ambicioso" ? 1.18 : player.personality === "Leal" ? 0.96 : 1.06;
  const wage = Math.max(400, Math.round((player.contract.wage * growth * ambition * rng.float(1.0, 1.15)) / 50) * 50);
  const years = player.age >= 31 ? rng.int(1, 2) : rng.int(2, 5);
  const accepts = club.reputation + 12 >= player.reputation;
  return { wage, years, accepts };
}

export function applyRenewal(
  market: MarketState,
  club: Club,
  player: Player,
  wage: number,
  years: number
): { market: MarketState; club: Club; player: Player; error?: string } {
  if (club.finances.balance < wage * 8) {
    return { market, club, player, error: "No tienes colchón económico para asumir esa ficha." };
  }
  const now = gameNow();
  const updated: Player = {
    ...player,
    contract: {
      ...player.contract,
      wage,
      expires: addYears(now, years).toISOString(),
      signedOn: now.toISOString(),
    },
    morale: Math.min(99, player.morale + 6),
    history: [
      ...player.history,
      { date: now.toISOString(), type: "contract", text: `Renueva con el ${club.name} hasta ${addYears(now, years).getUTCFullYear()}.` },
    ],
  };
  const record: TransferRecord = {
    id: uid("tr"), date: now.toISOString(), type: "renovacion",
    playerName: player.name, otherClub: club.name, amount: wage,
  };
  return {
    market: { ...market, history: [record, ...market.history].slice(0, 60), updatedAt: Date.now() },
    club,
    player: updated,
  };
}

/* ------------------------------------------------------------------ */
/* Búsqueda avanzada                                                   */
/* ------------------------------------------------------------------ */

export interface MarketFilters {
  text: string;
  kind: "all" | ListingKind;
  position: "all" | PositionCode;
  group: "all" | "POR" | "DEF" | "MED" | "DEL";
  nationality: string;
  minAge: number;
  maxAge: number;
  maxPrice: number;
  minOverall: number;
  minPotential: number;
  style: string;
  personality: string;
  sort: "overall" | "potential" | "price" | "age" | "wage";
}

export const DEFAULT_FILTERS: MarketFilters = {
  text: "", kind: "all", position: "all", group: "all", nationality: "all",
  minAge: 15, maxAge: 40, maxPrice: 0, minOverall: 0, minPotential: 0,
  style: "all", personality: "all", sort: "overall",
};

export function filterListings(listings: Listing[], f: MarketFilters): Listing[] {
  const out = listings.filter((l) => {
    const p = l.player;
    if (f.text && !p.name.toLowerCase().includes(f.text.toLowerCase())) return false;
    if (f.kind !== "all" && l.kind !== f.kind) return false;
    if (f.position !== "all" && p.position !== f.position && !p.secondaryPositions.includes(f.position)) return false;
    if (f.group !== "all" && POSITION_MAP[p.position].group !== f.group) return false;
    if (f.nationality !== "all" && p.nationality !== f.nationality) return false;
    if (p.age < f.minAge || p.age > f.maxAge) return false;
    if (f.maxPrice > 0 && l.askingPrice > f.maxPrice) return false;
    if (p.overall < f.minOverall) return false;
    if (p.potential < f.minPotential) return false;
    if (f.style !== "all" && p.playStyle !== f.style) return false;
    if (f.personality !== "all" && p.personality !== f.personality) return false;
    return true;
  });

  return out.sort((a, b) => {
    switch (f.sort) {
      case "potential": return b.player.potential - a.player.potential;
      case "price": return a.askingPrice - b.askingPrice;
      case "age": return a.player.age - b.player.age;
      case "wage": return a.wageDemand - b.wageDemand;
      default: return b.player.overall - a.player.overall;
    }
  });
}

export const ALL_PERSONALITIES = PERSONALITIES.map((p) => p.name);

/** Precio recomendado al poner a la venta */
export function suggestedPrice(p: Player): number {
  return Math.round(marketValue(p.overall, p.potential, p.age, p.reputation) * 1.12 / 5000) * 5000;
}
