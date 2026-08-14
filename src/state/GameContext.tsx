/**
 * src/state/GameContext.tsx
 * Estado global: sesión, perfil, club, plantilla, cuerpo técnico, noticias,
 * liga (FASE 2), partidos y acciones del juego.
 * Cachea en memoria para reducir lecturas de Firestore.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import type { Club, NewsItem, Player, StaffMember, Tactics, UserProfile } from "@/types";
import { backend, type AuthUser, type RankingRow } from "@/services/backend";
import type { CreateClubInput } from "@/game/club";
import {
  buildAiTeam, buildUserTeam, clubOf, commitLiveResult, createLeague, mergePlayers,
  nextFixture, playFriendly as simFriendly, playNextRound, recoverConditions, sortedTable,
  type LeagueState,
} from "@/game/league";
import {
  advanceLive, adjustTactics, buildResult, createLiveMatch, makeSubstitution,
  type LiveMatchState,
} from "@/game/livematch";
import type { MatchResult } from "@/game/match";
import {
  applyMatchdayIncome, applyResultEffects, matchdayIncome, processEconomy, requestBudget as grantBudget,
  setTicketPrice as applyTicketPrice, signSponsor as applySponsor, startFacilityUpgrade,
  type SponsorOffer,
} from "@/game/economy";
import {
  acceptOffer as mkAcceptOffer, applyRenewal, completeSigning, createMarket, generateIncomingOffers,
  listPlayer as mkListPlayer, refreshMarket, rejectOffer as mkRejectOffer, submitBid,
  toggleLoanList as mkToggleLoan, unlistPlayer as mkUnlist,
  type BidInput, type BidResult, type MarketState,
} from "@/game/market";
import {
  closeDraft as ytCloseDraft, createAcademy, createDraft, makeDraftPick, promoteCandidate,
  refreshAcademy, refreshDraft, setAcademyPrefs as ytSetPrefs, undoDraftPick,
  type AcademyPrefs, type AcademyState, type DraftState,
} from "@/game/youth";
import {
  computeStaffEffects, createStaffState, enrollCourse, fireStaff, hireStaff, refreshStaffState,
  renewStaff, type StaffEffects, type StaffState,
} from "@/game/staff";
import {
  applyAsCoach, autoCallUp as ntAutoCallUp, castVote, createNationalState, playInternational,
  refreshNational, resolveElection, toggleCallUp as ntToggleCallUp,
  type NationalState, type NtCategory,
} from "@/game/national";
import {
  applyFameDeltas, computeLegends, createFameState, evaluateAchievements, fameFromMatch,
  refreshFavourites, syncAchievements, updateRecords,
  type Achievement, type FameState,
} from "@/game/fame";
import {
  createSeasonHistory, rolloverSeason, seasonChanged,
  type SeasonHistoryState, type SeasonSummary,
} from "@/game/season";
import { verifyState, type IntegrityReport } from "@/game/integrity";
import {
  applyCupOutcome, createCompetitions, playCupRound, refreshCompetitions,
  type CompetitionsState, type CupKind,
} from "@/game/cups";
import { squadStrength } from "@/game/players";
import {
  buildNotifications, computeManagerStats, DEFAULT_PREFS,
  type ExtendedProfile, type ManagerStats, type Notification, type NotifPrefs,
} from "@/game/manager";
import {
  createScouting, resolveMissions, signDiscovery, startMission,
  type ScoutFocus, type ScoutingState,
} from "@/game/scouting";
import {
  analyseChemistry, answerPress, applyTeamTalk, createDressingRoom, detectConcerns, talkToPlayer,
  type ChatKind, type ChemistryReport, type Concern, type DressingRoomState,
  type PressQuestion, type TalkPreview,
} from "@/game/dressingroom";
import {
  acceptUserOffer, buildOffer, createWorldLeague, isMember, joinWorldLeague, leaveWorldLeague,
  playWorldRound, settleOffer, startWorldLeague, validateOffer, worldLeagueId,
  type UserTransferOffer, type WorldLeague,
} from "@/game/multiplayer";
import { SQUAD_MAX } from "@/game/market";
import { uid } from "@/game/rng";
import { gameNow } from "@/game/time";

interface GameState {
  ready: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
  club: Club | null;
  /** Jugadores con estado dinámico (forma/moral/físico/lesión) y estadísticas aplicadas */
  players: Player[];
  staff: StaffMember[];
  news: NewsItem[];
  rankings: RankingRow[];
  league: LeagueState | null;
  matches: MatchResult[];
  lastMatch: MatchResult | null;
  loadingClub: boolean;
  simulating: boolean;
  error: string | null;
  mode: "firebase" | "local";
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, managerName: string): Promise<void>;
  logout(): Promise<void>;
  createClub(input: Omit<CreateClubInput, "ownerUid" | "managerName">): Promise<void>;
  refresh(): Promise<void>;
  saveTactics(t: Tactics): Promise<void>;
  saveTraining(t: Club["training"]): Promise<void>;
  setPlayerTraining(playerId: string, focus: string | null, role: string): Promise<void>;
  markNewsRead(id: string): Promise<void>;
  playMatch(): Promise<MatchResult | null>;
  playFriendlyMatch(): Promise<MatchResult | null>;
  /* FASE 3 */
  upgradeFacility(key: string): Promise<string | null>;
  setTicketPrice(price: number): Promise<void>;
  signSponsor(offer: SponsorOffer): Promise<void>;
  requestBudget(): Promise<number>;
  /* FASE 4 */
  market: MarketState | null;
  bid(listingId: string, offer: BidInput): Promise<BidResult | null>;
  signPlayer(listingId: string): Promise<string | null>;
  listForSale(playerId: string, price: number): Promise<void>;
  unlist(playerId: string): Promise<void>;
  toggleLoan(playerId: string): Promise<void>;
  acceptOffer(offerId: string): Promise<string | null>;
  rejectOffer(offerId: string): Promise<void>;
  renewContract(playerId: string, wage: number, years: number): Promise<string | null>;
  /* FASES 5-6 */
  academy: AcademyState | null;
  draft: DraftState | null;
  setAcademyPrefs(prefs: AcademyPrefs): Promise<void>;
  promoteYouth(candidateId: string): Promise<string | null>;
  pickProspect(prospectId: string): Promise<string | null>;
  unpickProspect(prospectId: string): Promise<void>;
  finishDraft(): Promise<{ signed: number; lost: string[] } | null>;
  /* FASE 7 */
  staffMarket: StaffState | null;
  staffEffects: StaffEffects;
  hireStaffMember(candidateId: string): Promise<string | null>;
  fireStaffMember(staffId: string): Promise<string | null>;
  renewStaffMember(staffId: string, years: number): Promise<void>;
  enrollStaffCourse(staffId: string, courseKey: string): Promise<string | null>;
  /* FASE 8 */
  national: NationalState | null;
  applyForNt(category: NtCategory, manifesto: string): Promise<string | null>;
  voteNt(category: NtCategory, candidacyId: string): Promise<string | null>;
  closeElection(category: NtCategory): Promise<{ winner: string; userWon: boolean } | null>;
  toggleNtCallUp(category: NtCategory, playerId: string): Promise<string | null>;
  autoCallUp(category: NtCategory): Promise<void>;
  playNtMatch(category: NtCategory, competition: "Amistoso" | "Clasificación" | "Torneo"): Promise<string | null>;
  /* FASE 9 */
  fame: FameState | null;
  achievements: Achievement[];
  /* FASE 10 */
  seasonHistory: SeasonHistoryState | null;
  integrity: IntegrityReport | null;
  lastSeasonSummary: SeasonSummary | null;
  dismissSeasonSummary(): void;
  runIntegrityCheck(): void;
  /* FASE 11 */
  competitions: CompetitionsState | null;
  playCup(kind: CupKind): Promise<string | null>;
  /* FASE 12 */
  world: WorldLeague | null;
  offersIn: UserTransferOffer[];
  offersOut: UserTransferOffer[];
  inWorld: boolean;
  joinWorld(): Promise<string | null>;
  leaveWorld(): Promise<void>;
  kickoffWorld(): Promise<string | null>;
  playWorldMatch(): Promise<string | null>;
  makeUserOffer(target: { clubId: string; clubName: string; uid: string }, player: Player, amount: number, message: string): Promise<string | null>;
  respondUserOffer(offerId: string, accept: boolean): Promise<string | null>;
  refreshOffers(): Promise<void>;
  /* FASE 13 */
  managerStats: ManagerStats;
  notifications: Notification[];
  notifPrefs: NotifPrefs;
  saveProfile(patch: Partial<ExtendedProfile>): Promise<void>;
  setNotifPrefs(prefs: NotifPrefs): Promise<void>;
  /* FASE 14 */
  scouting: ScoutingState | null;
  sendScout(scoutId: string, country: string, position: string, focus: ScoutFocus, days: number): Promise<string | null>;
  signScoutedPlayer(discoveryId: string): Promise<string | null>;
  /* FASE 15 */
  dressingRoom: DressingRoomState | null;
  chemistry: ChemistryReport;
  concerns: Concern[];
  talkTo(playerId: string, kind: ChatKind): Promise<string | null>;
  giveTeamTalk(preview: TalkPreview, starterIds: string[]): Promise<string | null>;
  doPressConference(answers: { question: PressQuestion; optionId: string }[]): Promise<string[]>;
  /* FASE 16 */
  liveMatch: LiveMatchState | null;
  startLiveMatch(): Promise<string | null>;
  advanceLiveMatch(toMinute: number): void;
  liveSubstitution(outId: string, inId: string): string | null;
  liveTacticChange(patch: Partial<Tactics>): string | null;
  finishLiveMatch(): Promise<MatchResult | null>;
  abandonLiveMatch(): void;
}

const Ctx = createContext<GameState | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [rawPlayers, setRawPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [league, setLeague] = useState<LeagueState | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [academy, setAcademy] = useState<AcademyState | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [staffMarket, setStaffMarket] = useState<StaffState | null>(null);
  const [national, setNational] = useState<NationalState | null>(null);
  const [fame, setFame] = useState<FameState | null>(null);
  const [seasonHistory, setSeasonHistory] = useState<SeasonHistoryState | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [lastSeasonSummary, setLastSeasonSummary] = useState<SeasonSummary | null>(null);
  const [competitions, setCompetitions] = useState<CompetitionsState | null>(null);
  const [world, setWorld] = useState<WorldLeague | null>(null);
  const [offersIn, setOffersIn] = useState<UserTransferOffer[]>([]);
  const [offersOut, setOffersOut] = useState<UserTransferOffer[]>([]);
  const [scouting, setScouting] = useState<ScoutingState | null>(null);
  const [dressingRoom, setDressingRoom] = useState<DressingRoomState | null>(null);
  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [lastMatch, setLastMatch] = useState<MatchResult | null>(null);
  const [loadingClub, setLoadingClub] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const loadEverything = useCallback(async (u: AuthUser) => {
    setLoadingClub(true);
    setError(null);
    try {
      const prof = await backend.ensureProfile(u);
      setProfile(prof);
      let c = await backend.getClubByOwner(u.uid);
      if (c) {
        const [pl, st, nw, mt] = await Promise.all([
          backend.getPlayers(c.id),
          backend.getStaff(c.id),
          backend.getNews(c.id),
          backend.getMatches(c.id),
        ]);
        const sorted = pl.sort((a, b) => b.overall - a.overall);
        setRawPlayers(sorted);
        setStaff(st);
        setMatches(mt);
        setLastMatch(mt[0] ?? null);

        /* FASE 3 — El mundo económico avanza aunque estés desconectado:
           se cobran las semanas pendientes y se terminan las obras vencidas. */
        const tick = processEconomy(c, sorted, st);
        let newsList = nw;
        if (tick.weeksProcessed > 0 || tick.completedWorks.length) {
          c = tick.club;
          backend.saveClub(c).catch(() => {});
          const extra: NewsItem[] = [];
          if (tick.weeksProcessed > 0) {
            extra.push({
              id: uid("news"), clubId: c.id, date: gameNow().toISOString(), category: "finanzas",
              title: `Cierre económico de ${tick.weeksProcessed} semana(s)`,
              body: `Balance semanal ${tick.net >= 0 ? "positivo" : "negativo"} de ${Math.abs(Math.round(tick.net)).toLocaleString("es-ES")} €. Saldo actual: ${Math.round(c.finances.balance).toLocaleString("es-ES")} €.`,
              read: false,
            });
          }
          for (const w of tick.completedWorks) {
            extra.push({
              id: uid("news"), clubId: c.id, date: gameNow().toISOString(), category: "club",
              title: `Obra finalizada: ${w.label} nivel ${w.level}`,
              body: `Las obras han concluido y la instalación ya está operativa al nivel ${w.level}.`,
              read: false, important: true,
            });
          }
          extra.forEach((n) => backend.addNews(c!.id, n).catch(() => {}));
          newsList = [...extra, ...nw];
        }
        setNews(newsList.sort((a, b) => (a.date < b.date ? 1 : -1)));
        setClub(c);

        // Liga: se crea la primera vez y se recupera la condición por tiempo transcurrido
        let lg = await backend.getLeague(c.id);
        if (!lg) {
          lg = createLeague(c, sorted);
          await backend.saveLeague(lg);
        } else {
          // El mundo avanza aunque el usuario esté desconectado:
          // 1 día real = 3 días de juego de recuperación/curación.
          const gameDaysElapsed = Math.floor(((Date.now() - (lg.updatedAt ?? Date.now())) / 86400000) * 3);
          if (gameDaysElapsed > 0) {
            lg = { ...recoverConditions(lg, gameDaysElapsed), updatedAt: Date.now() };
            backend.saveLeague(lg).catch(() => {});
          }
        }
        setLeague(lg);

        /* FASE 4 — mercado: escaparate por periodo + ofertas entrantes de la IA */
        let mk = await backend.getMarket(c.id);
        if (!mk) mk = createMarket(c);
        else mk = refreshMarket(mk, c);
        mk = generateIncomingOffers(mk, sorted);
        setMarket(mk);
        backend.saveMarket(mk).catch(() => {});

        /* FASE 5 — academia: promoción nueva cada mes de juego */
        let ac = await backend.getAcademy(c.id);
        ac = ac ? refreshAcademy(ac, c) : createAcademy(c);
        setAcademy(ac);
        backend.saveAcademy(ac).catch(() => {});

        /* FASE 6 — draft: clase nueva cada 2 meses de juego */
        let dr = await backend.getDraft(c.id);
        dr = dr ? refreshDraft(dr, c) : createDraft(c);
        setDraft(dr);
        backend.saveDraft(dr).catch(() => {});

        /* FASE 7 — cuerpo técnico: mercado y cursos de formación */
        let sm = await backend.getStaffState(c.id);
        if (!sm) {
          sm = createStaffState(c);
        } else {
          const res = refreshStaffState(sm, c, st);
          sm = res.state;
          if (res.upgraded.length) {
            setStaff(res.staff);
            res.staff.forEach((m) => backend.saveStaffMember(c!.id, m).catch(() => {}));
            for (const u of res.upgraded) {
              const item: NewsItem = {
                id: uid("news"), clubId: c.id, date: gameNow().toISOString(), category: "club",
                title: `${u.name} completa su formación`,
                body: `Tras el curso en el Centro de Formación de Directores, sube ${u.gain} punto(s) hasta nivel ${u.level}.`,
                read: false,
              };
              newsList = [item, ...newsList];
              backend.addNews(c.id, item).catch(() => {});
            }
            setNews(newsList.sort((a, b) => (a.date < b.date ? 1 : -1)));
          }
        }
        setStaffMarket(sm);
        backend.saveStaffState(sm).catch(() => {});

        /* FASE 8 — selecciones: abre elecciones si expiró algún mandato */
        let nt = await backend.getNational(c.id);
        nt = nt ? refreshNational(nt) : createNationalState(c);
        setNational(nt);
        backend.saveNational(nt).catch(() => {});

        /* FASE 9 — fama, logros y récords */
        let fm = await backend.getFame(c.id);
        if (!fm) {
          fm = createFameState(c);
          backend.saveFame(fm).catch(() => {});
        }
        fm = { ...fm, legends: computeLegends(sorted, lg, nt) };
        setFame(fm);

        /* FASE 10 — cierre de temporada automático (también offline) */
        let sh = await backend.getSeasonHistory(c.id);
        if (!sh) {
          sh = createSeasonHistory(c);
          backend.saveSeasonHistory(sh).catch(() => {});
        }
        let squad = sorted;
        if (seasonChanged(sh)) {
          const roll = rolloverSeason({ club: c, players: squad, staff: st, league: lg, history: sh });
          const removed = squad.filter((p) => !roll.players.some((x) => x.id === p.id)).map((p) => p.id);
          c = roll.club;
          squad = roll.players;
          sh = roll.history;
          setClub(c);
          setRawPlayers(squad);
          setStaff(roll.staff);
          setLastSeasonSummary(roll.summary);
          // Liga nueva para la temporada entrante
          lg = createLeague(c, squad);
          setLeague(lg);
          await Promise.all([
            backend.saveClub(c),
            backend.replaceSquad(c.id, squad, removed),
            backend.saveSeasonHistory(sh),
            backend.saveLeague(lg),
          ]).catch(() => {});
          const seasonNews: NewsItem = {
            id: uid("news"), clubId: c.id, date: gameNow().toISOString(), category: "club",
            title: `Temporada ${roll.summary.seasonId} finalizada · ${roll.summary.position || "-"}º puesto`,
            body: `Premios: ${Math.round(roll.summary.prize).toLocaleString("es-ES")} €. ` +
              (roll.summary.promoted ? "¡El club asciende de categoría! " : roll.summary.relegated ? "El club desciende de categoría. " : "") +
              `${roll.summary.retired.length} retirada(s) y ${roll.summary.breakthroughs.length} jugador(es) dieron un salto de nivel.`,
            read: false, important: true,
          };
          newsList = [seasonNews, ...newsList];
          backend.addNews(c.id, seasonNews).catch(() => {});
          setNews(newsList.sort((a, b) => (a.date < b.date ? 1 : -1)));
        }
        setSeasonHistory(sh);

        /* FASE 11 — copas nacionales, supercopa e internacional */
        const rating = squadStrength(squad);
        let comp = await backend.getCompetitions(c.id);
        comp = comp ? refreshCompetitions(comp, c, rating) : createCompetitions(c, rating);
        setCompetitions(comp);
        backend.saveCompetitions(comp).catch(() => {});

        /* FASE 12 — liga mundial compartida y ofertas entre managers */
        const wid = worldLeagueId(c.country, c.division);
        let wl = await backend.getWorldLeague(wid);
        if (!wl) {
          wl = createWorldLeague(c.country, c.division, rating);
          backend.saveWorldLeague(wl).catch(() => {});
        }
        if (!isMember(wl, c.id)) {
          const joined = joinWorldLeague(wl, c, rating, u.uid);
          if (!joined.error) {
            wl = joined.league;
            backend.saveWorldLeague(wl).catch(() => {});
          }
        }
        setWorld(wl);

        const [inc, out] = await Promise.all([
          backend.getOffersFor(u.uid).catch(() => []),
          backend.getOffersFrom(u.uid).catch(() => []),
        ]);
        setOffersIn(inc);

        // Liquidación diferida: el comprador paga al entrar
        const toSettle = out.filter((o) => o.status === "aceptada");
        if (toSettle.length) {
          for (const o of toSettle) {
            const res = settleOffer(c, o);
            c = res.club;
            backend.updateOffer(res.offer).catch(() => {});
            const item: NewsItem = {
              id: uid("news"), clubId: c.id, date: gameNow().toISOString(), category: "mercado",
              title: `Fichaje confirmado: ${o.playerName}`,
              body: `El ${o.toClubName} ha aceptado tu oferta de ${Math.round(o.amount).toLocaleString("es-ES")} €. El jugador ya forma parte de tu plantilla.`,
              read: false, important: true,
            };
            newsList = [item, ...newsList];
            backend.addNews(c.id, item).catch(() => {});
          }
          setClub(c);
          backend.saveClub(c).catch(() => {});
          setNews(newsList.sort((a, b) => (a.date < b.date ? 1 : -1)));
          squad = await backend.getPlayers(c.id);
          squad.sort((a, b) => b.overall - a.overall);
          setRawPlayers(squad);
        }
        setOffersOut(out.map((o) => (o.status === "aceptada" ? { ...o, status: "liquidada" as const } : o)));

        /* FASE 14 — scouting: resolver misiones vencidas */
        let sc = await backend.getScouting(c.id);
        if (!sc) sc = createScouting(c);
        const scRes = resolveMissions(sc, c);
        sc = scRes.state;
        setScouting(sc);
        backend.saveScouting(sc).catch(() => {});
        if (scRes.newDiscoveries.length) {
          const best = [...scRes.newDiscoveries].sort((a, b) => b.report.potHigh - a.report.potHigh)[0];
          const item: NewsItem = {
            id: uid("news"), clubId: c.id, date: gameNow().toISOString(), category: "mercado",
            title: `Informe de ojeo: ${scRes.newDiscoveries.length} jugador(es) localizados`,
            body: `${best.foundBy} destaca a ${best.player.name} (${best.player.age} años, ${best.player.position}). Techo estimado ${best.report.potLow}-${best.report.potHigh} con un ${best.report.confidence}% de fiabilidad.`,
            read: false, important: true,
          };
          newsList = [item, ...newsList];
          backend.addNews(c.id, item).catch(() => {});
          setNews(newsList.sort((a, b) => (a.date < b.date ? 1 : -1)));
        }

        /* FASE 15 — vestuario */
        let room = await backend.getDressingRoom(c.id);
        if (!room) {
          room = createDressingRoom(c);
          backend.saveDressingRoom(room).catch(() => {});
        }
        setDressingRoom(room);

        /* FASE 10 — verificación de integridad anti-exploit */
        const report = verifyState(c, squad);
        setIntegrity(report);
        if (!report.ok) {
          setClub(report.club);
          setRawPlayers(report.players);
          backend.saveClub(report.club).catch(() => {});
        }
      } else {
        setClub(null);
        setRawPlayers([]); setStaff([]); setNews([]); setLeague(null);
        setMatches([]); setMarket(null); setAcademy(null); setDraft(null);
        setStaffMarket(null); setNational(null); setFame(null); setCompetitions(null);
        setScouting(null); setDressingRoom(null);
      }
      backend.getRankings().then(setRankings).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando los datos");
    } finally {
      setLoadingClub(false);
    }
  }, []);

  useEffect(() => {
    const unsub = backend.onAuth(async (u) => {
      setUser(u);
      if (u) {
        if (loadedFor.current !== u.uid) {
          loadedFor.current = u.uid;
          await loadEverything(u);
        }
      } else {
        loadedFor.current = null;
        setProfile(null); setClub(null); setRawPlayers([]); setStaff([]);
        setNews([]); setLeague(null); setMatches([]); setLastMatch(null);
      }
      setReady(true);
    });
    return unsub;
  }, [loadEverything]);

  /** Jugadores con condición y estadísticas de la temporada aplicadas */
  const players = useMemo(() => mergePlayers(rawPlayers, league), [rawPlayers, league]);

  /** Efectos agregados del cuerpo técnico (FASE 7) */
  const staffEffects = useMemo(() => computeStaffEffects(staff), [staff]);
  const coachLevel = staffEffects.coachLevel;

  /** Preferencias de avisos del manager (FASE 13) */
  const notifPrefs = useMemo<NotifPrefs>(
    () => ({ ...DEFAULT_PREFS, ...((profile as ExtendedProfile | null)?.notifPrefs ?? {}) }),
    [profile]
  );

  /** Logros calculados en vivo (FASE 9) */
  const achievements = useMemo<Achievement[]>(() => {
    if (!club || !fame) return [];
    const position = league ? sortedTable(league).findIndex((r) => r.clubId === club.id) + 1 : 0;
    return evaluateAchievements({
      club, players, league, national, fame, leaguePosition: position, matchesPlayed: matches.length,
    });
  }, [club, players, league, national, fame, matches.length]);

  /** Progresión del manager y centro de notificaciones (FASE 13) */
  const managerStats = useMemo<ManagerStats>(
    () => computeManagerStats({
      club, league, fame, history: seasonHistory, market, academy,
      achievementsUnlocked: achievements.filter((a) => a.progress >= 1).length,
    }),
    [club, league, fame, seasonHistory, market, academy, achievements]
  );

  /** Química y preocupaciones del vestuario (FASE 15) */
  const chemistry = useMemo<ChemistryReport>(() => analyseChemistry(players), [players]);
  const concerns = useMemo<Concern[]>(
    () => (club ? detectConcerns(players, club) : []),
    [players, club]
  );

  const notifications = useMemo<Notification[]>(
    () => buildNotifications({
      club, players, league, market, academy, draft, staffMarket, national, competitions,
      offersPending: offersIn.filter((o) => o.status === "pendiente").length,
      news, prefs: notifPrefs,
    }),
    [club, players, league, market, academy, draft, staffMarket, national, competitions, offersIn, news, notifPrefs]
  );

  const value = useMemo<GameState>(
    () => ({
      ready, user, profile, club, players, staff, news, rankings, league, matches, lastMatch,
      loadingClub, simulating, error,
      mode: backend.mode,

      async signIn(email, password) {
        const u = await backend.signIn(email, password);
        loadedFor.current = u.uid;
        setUser(u);
        await loadEverything(u);
      },
      async signUp(email, password, managerName) {
        const u = await backend.signUp(email, password, managerName);
        loadedFor.current = u.uid;
        setUser(u);
        await loadEverything(u);
      },
      async logout() {
        await backend.signOutUser();
        setUser(null); setProfile(null); setClub(null); setRawPlayers([]);
        setStaff([]); setNews([]); setLeague(null); setMatches([]); setLastMatch(null);
      },
      async createClub(input) {
        if (!user || !profile) throw new Error("Sesión no iniciada");
        setLoadingClub(true);
        try {
          const res = await backend.createClub({ ...input, ownerUid: user.uid, managerName: profile.managerName });
          const sorted = res.players.sort((a, b) => b.overall - a.overall);
          setClub(res.club);
          setRawPlayers(sorted);
          const [st, nw] = await Promise.all([backend.getStaff(res.club.id), backend.getNews(res.club.id)]);
          setStaff(st);
          setNews(nw);
          const lg = createLeague(res.club, sorted);
          await backend.saveLeague(lg);
          setLeague(lg);
          const wid = worldLeagueId(res.club.country, res.club.division);
          let wl = await backend.getWorldLeague(wid);
          if (!wl) wl = createWorldLeague(res.club.country, res.club.division, squadStrength(sorted));
          const joined = joinWorldLeague(wl, res.club, squadStrength(sorted), user.uid);
          if (!joined.error) {
            wl = joined.league;
            await backend.saveWorldLeague(wl);
            setWorld(wl);
            const item: NewsItem = {
              id: uid("news"), clubId: res.club.id, date: gameNow().toISOString(), category: "club",
              title: "¡Bienvenido a la Liga Mundial!",
              body: `Tu club ya está inscrito en la Liga Mundial · División ${res.club.division}.`,
              read: false,
            };
            setNews((prev) => [item, ...prev]);
            backend.addNews(res.club.id, item).catch(() => {});
          } else {
            setWorld(wl);
          }
          setProfile({ ...profile, clubId: res.club.id, country: input.country });
        } finally {
          setLoadingClub(false);
        }
      },
      async refresh() {
        if (user) await loadEverything(user);
      },
      async saveTactics(t) {
        if (!club) return;
        setClub({ ...club, tactics: t });
        await backend.saveTactics(club.id, t);
      },
      async saveTraining(t) {
        if (!club) return;
        setClub({ ...club, training: t });
        await backend.saveTraining(club.id, t);
      },
      async setPlayerTraining(playerId, focus, role) {
        if (!club) return;
        setRawPlayers((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? { ...p, trainingFocus: focus as Player["trainingFocus"], squadRole: role as Player["squadRole"] }
              : p
          )
        );
        await backend.setPlayerTraining(club.id, playerId, focus, role);
      },
      async markNewsRead(id) {
        if (!club) return;
        setNews((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        await backend.markNewsRead(club.id, id).catch(() => {});
      },

      /* ------------------------- FASE 2 ------------------------- */
      async playMatch() {
        if (!club || !league) return null;
        setSimulating(true);
        try {
          const res = playNextRound({ league, club, players, coachLevel });
          if (!res) return null;
          setLeague(res.league);
          setLastMatch(res.match);
          setMatches((prev) => [res.match, ...prev].slice(0, 30));
          await backend.saveLeague(res.league);
          await backend.saveMatch(club.id, res.match).catch(() => {});

          const us = res.match.userSide === "home" ? res.match.home : res.match.away;
          const them = res.match.userSide === "home" ? res.match.away : res.match.home;
          const verdict = us.goals > them.goals ? "Victoria" : us.goals === them.goals ? "Empate" : "Derrota";
          const outcome = us.goals > them.goals ? "win" : us.goals === them.goals ? "draw" : "loss";
          const rival = res.league.clubs.find((c) => c.id === them.clubId);

          /* FASE 3 — efectos económicos y sociales del partido */
          let updated = applyResultEffects(club, outcome as "win" | "draw" | "loss", rival?.rating ?? 55);
          let gate = null;
          if (res.match.userSide === "home") {
            gate = matchdayIncome(updated, { rivalRating: rival?.rating ?? 55, seed: res.match.id });
            updated = applyMatchdayIncome(updated, gate, them.name);
          }

          /* FASE 9 — fama de los jugadores, récords y logros */
          const deltas = fameFromMatch(res.match, rawPlayers, club.reputation, rival?.rating ?? 55);
          if (deltas.length) {
            const famed = applyFameDeltas(rawPlayers, deltas);
            setRawPlayers(famed);
            backend.savePlayersBatch(famed.filter((p) => deltas.some((d) => d.playerId === p.id))).catch(() => {});
            updated = refreshFavourites(updated, famed);
          }
          setClub(updated);
          backend.saveClub(updated).catch(() => {});

          if (fame) {
            const position = sortedTable(res.league).findIndex((r) => r.clubId === club.id) + 1;
            let nextFame = updateRecords(fame, res.match, updated, gate?.attendance ?? 0, position);
            nextFame = { ...nextFame, legends: computeLegends(rawPlayers, res.league, national) };
            const achs = evaluateAchievements({
              club: updated, players: rawPlayers, league: res.league, national, fame: nextFame,
              leaguePosition: position, matchesPlayed: matches.length + 1,
            });
            const synced = syncAchievements(nextFame, achs);
            setFame(synced.fame);
            backend.saveFame(synced.fame).catch(() => {});
            for (const a of synced.newly) {
              const achNews: NewsItem = {
                id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "club",
                title: `${a.icon} Logro desbloqueado: ${a.label}`,
                body: `${a.desc} Categoría ${a.tier}.`,
                read: false, important: a.tier === "oro" || a.tier === "leyenda",
              };
              setNews((prev) => [achNews, ...prev]);
              backend.addNews(club.id, achNews).catch(() => {});
            }
          }

          const item: NewsItem = {
            id: uid("news"),
            clubId: club.id,
            date: res.match.date,
            category: "partido",
            title: `${verdict} ${us.goals}-${them.goals} frente al ${them.name}`,
            body:
              `${res.match.competition}. MVP: ${res.match.motm?.name ?? "—"} (${res.match.motm?.rating ?? "-"}). ` +
              `Posesión ${res.match.home.stats.possession}%-${res.match.away.stats.possession}%, remates ${res.match.home.stats.shots}-${res.match.away.stats.shots}.` +
              (gate
                ? ` Taquilla: ${gate.attendance.toLocaleString("es-ES")} espectadores (${gate.occupancy}% de aforo) y ${Math.round(gate.total).toLocaleString("es-ES")} € de ingresos.`
                : ""),
            read: false,
            important: verdict === "Victoria",
          };
          setNews((prev) => [item, ...prev]);
          backend.addNews(club.id, item).catch(() => {});
          return res.match;
        } finally {
          setSimulating(false);
        }
      },

      async playFriendlyMatch() {
        if (!club || !league) return null;
        setSimulating(true);
        try {
          const res = simFriendly({ league, club, players, coachLevel });
          if (!res) return null;
          setLeague(res.league);
          setLastMatch(res.match);
          setMatches((prev) => [res.match, ...prev].slice(0, 30));
          await backend.saveLeague(res.league);
          await backend.saveMatch(club.id, res.match).catch(() => {});
          return res.match;
        } finally {
          setSimulating(false);
        }
      },

      /* ------------------------- FASE 3 ------------------------- */
      async upgradeFacility(key) {
        if (!club) return "Sin club";
        const { club: updated, error } = startFacilityUpgrade(club, key);
        if (error) return error;
        setClub(updated);
        await backend.saveClub(updated);
        const work = updated.facilities[key]?.upgrading;
        if (work) {
          const item: NewsItem = {
            id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "club",
            title: `Comienzan las obras: ${key} nivel ${work.toLevel}`,
            body: `El club invierte ${Math.round(work.cost).toLocaleString("es-ES")} € en la ampliación. Las obras terminarán según el calendario previsto.`,
            read: false,
          };
          setNews((prev) => [item, ...prev]);
          backend.addNews(club.id, item).catch(() => {});
        }
        return null;
      },

      async setTicketPrice(price) {
        if (!club) return;
        const updated = applyTicketPrice(club, price);
        setClub(updated);
        await backend.saveClub(updated);
      },

      async signSponsor(offer) {
        if (!club) return;
        const updated = applySponsor(club, offer);
        setClub(updated);
        await backend.saveClub(updated);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "finanzas",
          title: `Nuevo patrocinador principal: ${offer.name}`,
          body: `Acuerdo por ${offer.years} temporada(s) con ${Math.round(offer.weekly).toLocaleString("es-ES")} € semanales y una prima de firma de ${Math.round(offer.signingBonus).toLocaleString("es-ES")} €. Condición: ${offer.requirement.toLowerCase()}.`,
          read: false, important: true,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
      },

      async requestBudget() {
        if (!club) return 0;
        const { club: updated, amount } = grantBudget(club);
        setClub(updated);
        await backend.saveClub(updated);
        return amount;
      },

      /* ------------------------- FASE 4 ------------------------- */
      market,

      async bid(listingId, offer) {
        if (!club || !market) return null;
        const res = submitBid(market, club, listingId, offer);
        setMarket(res.market);
        await backend.saveMarket(res.market).catch(() => {});
        return res;
      },

      async signPlayer(listingId) {
        if (!club || !market) return "Sin club";
        const res = completeSigning(market, club, rawPlayers.length, listingId);
        if (res.error || !res.player) return res.error ?? "No se pudo completar el fichaje.";
        setMarket(res.market);
        setClub(res.club);
        setRawPlayers((prev) => [...prev, res.player!].sort((a, b) => b.overall - a.overall));
        await Promise.all([
          backend.addPlayer(res.player),
          backend.saveClub(res.club),
          backend.saveMarket(res.market),
        ]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "mercado",
          title: `Fichaje cerrado: ${res.player.name}`,
          body: `${res.player.name} (${res.player.age} años, ${res.player.position}, nivel ${res.player.overall}) llega procedente del ${res.record?.otherClub}. Operación: ${res.record?.amount ? `${Math.round(res.record.amount).toLocaleString("es-ES")} €` : "libre"}. Ficha: ${Math.round(res.player.contract.wage).toLocaleString("es-ES")} €/semana.`,
          read: false, important: true,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      async listForSale(playerId, price) {
        if (!market) return;
        const next = mkListPlayer(market, playerId, price);
        setMarket(next);
        await backend.saveMarket(next).catch(() => {});
      },

      async unlist(playerId) {
        if (!market) return;
        const next = mkUnlist(market, playerId);
        setMarket(next);
        await backend.saveMarket(next).catch(() => {});
      },

      async toggleLoan(playerId) {
        if (!market) return;
        const next = mkToggleLoan(market, playerId);
        setMarket(next);
        await backend.saveMarket(next).catch(() => {});
      },

      async acceptOffer(offerId) {
        if (!club || !market) return "Sin club";
        const res = mkAcceptOffer(market, club, rawPlayers, offerId);
        if (res.error) return res.error;
        setMarket(res.market);
        setClub(res.club);
        if (res.soldPlayerId) {
          setRawPlayers((prev) => prev.filter((p) => p.id !== res.soldPlayerId));
          backend.removePlayer(res.soldPlayerId).catch(() => {});
        }
        await Promise.all([backend.saveClub(res.club), backend.saveMarket(res.market)]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "mercado",
          title: `${res.record?.type === "venta" ? "Venta" : "Cesión"} de ${res.record?.playerName}`,
          body: `Acuerdo con el ${res.record?.otherClub} por ${Math.round(res.record?.amount ?? 0).toLocaleString("es-ES")} €. El dinero ya está disponible en la caja del club.`,
          read: false,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      async rejectOffer(offerId) {
        if (!market) return;
        const next = mkRejectOffer(market, offerId);
        setMarket(next);
        await backend.saveMarket(next).catch(() => {});
      },

      async renewContract(playerId, wage, years) {
        if (!club || !market) return "Sin club";
        const base = rawPlayers.find((p) => p.id === playerId);
        if (!base) return "Jugador no encontrado.";
        const res = applyRenewal(market, club, base, wage, years);
        if (res.error) return res.error;
        setMarket(res.market);
        setRawPlayers((prev) => prev.map((p) => (p.id === playerId ? res.player : p)));
        await Promise.all([backend.savePlayer(res.player), backend.saveMarket(res.market)]);
        return null;
      },

      /* ---------------------- FASES 5 y 6 ---------------------- */
      academy,
      draft,

      async setAcademyPrefs(prefs) {
        if (!club || !academy) return;
        const next = ytSetPrefs(academy, club, prefs);
        setAcademy(next);
        await backend.saveAcademy(next).catch(() => {});
      },

      async promoteYouth(candidateId) {
        if (!club || !academy) return "Sin club";
        const res = promoteCandidate(academy, club, rawPlayers.length, candidateId, SQUAD_MAX);
        if (res.error || !res.player) return res.error ?? "No se pudo promocionar.";
        setAcademy(res.academy);
        setClub(res.club);
        setRawPlayers((prev) => [...prev, res.player!].sort((a, b) => b.overall - a.overall));
        await Promise.all([
          backend.addPlayer(res.player),
          backend.saveClub(res.club),
          backend.saveAcademy(res.academy),
        ]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "academia",
          title: `${res.player.name} sube al primer equipo`,
          body: `El canterano de ${res.player.age} años (${res.player.position}) firma su primer contrato profesional. Nivel actual ${res.player.overall}, potencial estimado clase ${res.player.potentialClass}.`,
          read: false, important: true,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      async pickProspect(prospectId) {
        if (!draft) return "Draft no disponible";
        const res = makeDraftPick(draft, prospectId);
        if (res.error) return res.error;
        setDraft(res.draft);
        await backend.saveDraft(res.draft).catch(() => {});
        return null;
      },

      async unpickProspect(prospectId) {
        if (!draft) return;
        const next = undoDraftPick(draft, prospectId);
        setDraft(next);
        await backend.saveDraft(next).catch(() => {});
      },

      async finishDraft() {
        if (!club || !draft) return null;
        const res = ytCloseDraft(draft, club, rawPlayers.length, SQUAD_MAX);
        setDraft(res.draft);
        setClub(res.club);
        if (res.signed.length) {
          setRawPlayers((prev) => [...prev, ...res.signed].sort((a, b) => b.overall - a.overall));
          await Promise.all(res.signed.map((p) => backend.addPlayer(p)));
        }
        await Promise.all([backend.saveClub(res.club), backend.saveDraft(res.draft)]);

        const best = [...res.signed].sort((a, b) => b.potential - a.potential)[0];
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "draft",
          title: res.signed.length
            ? `Draft cerrado: ${res.signed.length} promesa(s) para la cantera`
            : "Draft cerrado sin incorporaciones",
          body: res.signed.length
            ? `Se han revelado los datos reales. Destaca ${best.name} (${best.age} años, ${best.position}) con potencial clase ${best.potentialClass}.` +
              (res.lost.length ? ` Perdimos a ${res.lost.join(", ")} ante clubes con turno anterior.` : "")
            : `Los clubes con turno anterior se llevaron a nuestros objetivos${res.lost.length ? `: ${res.lost.join(", ")}` : ""}.`,
          read: false, important: res.signed.length > 0,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return { signed: res.signed.length, lost: res.lost };
      },

      /* ------------------------- FASE 7 ------------------------- */
      staffMarket,
      staffEffects,

      async hireStaffMember(candidateId) {
        if (!club || !staffMarket) return "Sin club";
        const res = hireStaff(staffMarket, club, staff, candidateId);
        if (res.error || !res.member) return res.error ?? "No se pudo contratar.";
        setStaffMarket(res.state);
        setClub(res.club);
        setStaff((prev) => [...prev, res.member!]);
        await Promise.all([
          backend.addStaff(club.id, res.member),
          backend.saveClub(res.club),
          backend.saveStaffState(res.state),
        ]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "club",
          title: `${res.member.name}, nuevo ${res.member.role.toLowerCase()}`,
          body: `Llega al club con nivel ${res.member.level} y especialidad en ${res.member.specialities.join(", ")}. Ficha: ${Math.round(res.member.wage).toLocaleString("es-ES")} €/semana.`,
          read: false,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      async fireStaffMember(staffId) {
        if (!club) return "Sin club";
        const member = staff.find((s) => s.id === staffId);
        if (!member) return "Técnico no encontrado.";
        const res = fireStaff(club, member, staff.length);
        if (res.error) return res.error;
        setClub(res.club);
        setStaff((prev) => prev.filter((s) => s.id !== staffId));
        await Promise.all([backend.saveClub(res.club), backend.removeStaff(staffId)]);
        return null;
      },

      async renewStaffMember(staffId, years) {
        if (!club) return;
        const member = staff.find((s) => s.id === staffId);
        if (!member) return;
        const updated = renewStaff(member, years);
        setStaff((prev) => prev.map((s) => (s.id === staffId ? updated : s)));
        await backend.saveStaffMember(club.id, updated).catch(() => {});
      },

      async enrollStaffCourse(staffId, courseKey) {
        if (!club || !staffMarket) return "Sin club";
        const member = staff.find((s) => s.id === staffId);
        if (!member) return "Técnico no encontrado.";
        const res = enrollCourse(staffMarket, club, member, courseKey);
        if (res.error) return res.error;
        setStaffMarket(res.state);
        setClub(res.club);
        await Promise.all([backend.saveStaffState(res.state), backend.saveClub(res.club)]);
        return null;
      },

      /* ------------------------- FASE 8 ------------------------- */
      national,

      async applyForNt(category, manifesto) {
        if (!national || !profile || !club) return "Sin datos";
        const res = applyAsCoach(national, category, profile, club, manifesto);
        if (res.error) return res.error;
        setNational(res.state);
        await backend.saveNational(res.state).catch(() => {});
        return null;
      },

      async voteNt(category, candidacyId) {
        if (!national || !user) return "Sin sesión";
        const res = castVote(national, category, user.uid, candidacyId);
        if (res.error) return res.error;
        setNational(res.state);
        await backend.saveNational(res.state).catch(() => {});
        return null;
      },

      async closeElection(category) {
        if (!national || !club) return null;
        const res = resolveElection(national, category);
        if (!res.winner) return null;
        setNational(res.state);
        await backend.saveNational(res.state).catch(() => {});
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "seleccion",
          title: res.userWon
            ? `¡Serás el seleccionador ${category}!`
            : `${res.winner.managerName} dirigirá la selección ${category}`,
          body: res.userWon
            ? `Has ganado la votación con ${res.winner.votes} votos. Tu mandato dura 120 días de juego: convoca jugadores y compite.`
            : `Ha ganado la votación con ${res.winner.votes} votos. Podrás presentarte de nuevo cuando termine su mandato.`,
          read: false, important: res.userWon,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return { winner: res.winner.managerName, userWon: res.userWon };
      },

      async toggleNtCallUp(category, playerId) {
        if (!national) return "Sin datos";
        const res = ntToggleCallUp(national, category, playerId);
        if (res.error) return res.error;
        setNational(res.state);
        await backend.saveNational(res.state).catch(() => {});
        return null;
      },

      async autoCallUp(category) {
        if (!national) return;
        const next = ntAutoCallUp(national, category, players);
        setNational(next);
        await backend.saveNational(next).catch(() => {});
      },

      async playNtMatch(category, competition) {
        if (!national || !club) return "Sin datos";
        const res = playInternational(national, category, players, competition);
        if (res.error || !res.match) return res.error ?? "No se pudo jugar.";
        setNational(res.state);
        await backend.saveNational(res.state).catch(() => {});
        const m = res.match;
        const ours = m.home ? m.homeGoals : m.awayGoals;
        const theirs = m.home ? m.awayGoals : m.homeGoals;
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: m.date, category: "seleccion",
          title: `${category} ${ours}-${theirs} ${m.rivalName} (${m.competition})`,
          body: m.scorers.length
            ? `Goles de ${m.scorers.join(", ")}. ${m.home ? "Partido en casa" : "Partido a domicilio"}.`
            : `Sin goles a favor. ${m.home ? "Partido en casa" : "Partido a domicilio"}.`,
          read: false,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      /* ------------------------- FASE 9 ------------------------- */
      fame,
      achievements,

      /* ------------------------ FASE 10 ------------------------- */
      seasonHistory,
      integrity,
      lastSeasonSummary,
      dismissSeasonSummary() {
        setLastSeasonSummary(null);
      },
      runIntegrityCheck() {
        if (!club) return;
        const report = verifyState(club, rawPlayers);
        setIntegrity(report);
        if (!report.ok) {
          setClub(report.club);
          setRawPlayers(report.players);
          backend.saveClub(report.club).catch(() => {});
        }
      },

      /* ------------------------ FASE 11 ------------------------- */
      competitions,

      async playCup(kind) {
        if (!club || !competitions) return "Sin datos";
        const cup = competitions[kind];
        if (!cup) return "Competición no disponible.";
        setSimulating(true);
        try {
          const res = playCupRound({ cup, club, players, coachLevel });
          if (res.error || !res.match) return res.error ?? "No se pudo disputar.";

          const nextComp: CompetitionsState = { ...competitions, [kind]: res.cup, updatedAt: Date.now() };
          const updatedClub = applyCupOutcome(club, res.cup, res.prize, res.champion);
          setCompetitions(nextComp);
          setClub(updatedClub);
          setLastMatch(res.match);
          setMatches((prev) => [res.match!, ...prev].slice(0, 30));
          await Promise.all([
            backend.saveCompetitions(nextComp),
            backend.saveClub(updatedClub),
            backend.saveMatch(club.id, res.match).catch(() => {}),
          ]);

          const us = res.match.userSide === "home" ? res.match.home : res.match.away;
          const them = res.match.userSide === "home" ? res.match.away : res.match.home;
          const item: NewsItem = {
            id: uid("news"), clubId: club.id, date: res.match.date, category: "partido",
            title: res.champion
              ? `🏆 ¡CAMPEONES de la ${res.cup.name}!`
              : res.advanced
              ? `Pase de ronda en ${res.cup.name} (${us.goals}-${them.goals})`
              : `Eliminados de ${res.cup.name} (${us.goals}-${them.goals})`,
            body: res.champion
              ? `El club conquista la ${res.cup.name} tras ganar la final al ${them.name}. Premio total: ${Math.round(res.cup.prizeEarned).toLocaleString("es-ES")} €.`
              : res.advanced
              ? `Victoria ante el ${them.name}. Premio: ${Math.round(res.prize).toLocaleString("es-ES")} €. Siguiente ronda ya sorteada.`
              : `Adiós al torneo frente al ${them.name}. Toca centrarse en la liga.`,
            read: false,
            important: res.champion || res.advanced,
          };
          setNews((prev) => [item, ...prev]);
          backend.addNews(club.id, item).catch(() => {});
          return null;
        } finally {
          setSimulating(false);
        }
      },

      /* ------------------------ FASE 12 ------------------------- */
      world,
      offersIn,
      offersOut,
      inWorld: !!(world && club && isMember(world, club.id)),

      async joinWorld() {
        if (!club || !world || !user) return "Sin datos";
        const res = joinWorldLeague(world, club, squadStrength(players), user.uid);
        if (res.error) return res.error;
        setWorld(res.league);
        await backend.saveWorldLeague(res.league);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "sistema",
          title: `Inscritos en ${res.league.name}`,
          body: "El club competirá contra managers reales. Cuando comience la competición se sorteará el calendario de ida y vuelta.",
          read: false, important: true,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      async leaveWorld() {
        if (!club || !world) return;
        const next = leaveWorldLeague(world, club.id, squadStrength(players));
        setWorld(next);
        await backend.saveWorldLeague(next);
      },

      async kickoffWorld() {
        if (!world) return "Sin liga";
        if (world.status !== "abierta") return "La competición ya está en marcha.";
        const next = startWorldLeague(world);
        setWorld(next);
        await backend.saveWorldLeague(next);
        return null;
      },

      async playWorldMatch() {
        if (!club || !world) return "Sin datos";
        setSimulating(true);
        try {
          const res = playWorldRound({ league: world, club, players, coachLevel });
          if (res.error || !res.match) return res.error ?? "No se pudo disputar.";
          setWorld(res.league);
          setLastMatch(res.match);
          setMatches((prev) => [res.match!, ...prev].slice(0, 30));
          await Promise.all([
            backend.saveWorldLeague(res.league),
            backend.saveMatch(club.id, res.match).catch(() => {}),
          ]);
          const us = res.match.userSide === "home" ? res.match.home : res.match.away;
          const them = res.match.userSide === "home" ? res.match.away : res.match.home;
          const item: NewsItem = {
            id: uid("news"), clubId: club.id, date: res.match.date, category: "partido",
            title: `${res.league.name}: ${us.goals}-${them.goals} vs ${them.name}`,
            body: res.vsHuman
              ? `Duelo contra otro manager real. ${res.match.competition}. MVP: ${res.match.motm?.name ?? "—"}.`
              : `${res.match.competition}. MVP: ${res.match.motm?.name ?? "—"}.`,
            read: false,
          };
          setNews((prev) => [item, ...prev]);
          backend.addNews(club.id, item).catch(() => {});
          return null;
        } finally {
          setSimulating(false);
        }
      },

      async makeUserOffer(target, player, amount, message) {
        if (!club || !user) return "Sin sesión";
        const err = validateOffer(club, amount, rawPlayers.length);
        if (err) return err;
        const offer = buildOffer({
          fromClub: club, fromUid: user.uid, toClubId: target.clubId,
          toClubName: target.clubName, toUid: target.uid, player, amount, message,
        });
        await backend.sendOffer(offer);
        setOffersOut((prev) => [offer, ...prev]);
        return null;
      },

      async respondUserOffer(offerId, accept) {
        if (!club) return "Sin club";
        const offer = offersIn.find((o) => o.id === offerId);
        if (!offer) return "Oferta no encontrada.";
        if (!accept) {
          const rejected: UserTransferOffer = { ...offer, status: "rechazada", resolvedAt: Date.now() };
          setOffersIn((prev) => prev.map((o) => (o.id === offerId ? rejected : o)));
          await backend.updateOffer(rejected);
          return null;
        }
        const player = rawPlayers.find((p) => p.id === offer.playerId);
        if (!player) return "Ese jugador ya no está en tu plantilla.";
        const res = acceptUserOffer(club, player, offer, rawPlayers.length);
        if (res.error) return res.error;

        setClub(res.club);
        setRawPlayers((prev) => prev.filter((p) => p.id !== player.id));
        setOffersIn((prev) => prev.map((o) => (o.id === offerId ? res.offer : o)));
        await Promise.all([
          backend.saveClub(res.club),
          backend.transferPlayerTo(res.player),
          backend.updateOffer(res.offer),
        ]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "mercado",
          title: `${player.name} traspasado al ${offer.fromClubName}`,
          body: `Acuerdo con el manager ${offer.fromManager} por ${Math.round(offer.amount).toLocaleString("es-ES")} €. El importe ya está en caja.`,
          read: false, important: true,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      async refreshOffers() {
        if (!user) return;
        const [inc, out] = await Promise.all([
          backend.getOffersFor(user.uid).catch(() => []),
          backend.getOffersFrom(user.uid).catch(() => []),
        ]);
        setOffersIn(inc);
        setOffersOut(out);
      },

      /* ------------------------ FASE 13 ------------------------- */
      managerStats,
      notifications,
      notifPrefs,

      async saveProfile(patch) {
        if (!user || !profile) return;
        const next = { ...profile, ...patch } as UserProfile;
        setProfile(next);
        await backend.updateProfile(user.uid, patch as Record<string, unknown>).catch(() => {});
      },

      async setNotifPrefs(prefs) {
        if (!user || !profile) return;
        setProfile({ ...profile, notifPrefs: prefs } as UserProfile);
        await backend.updateProfile(user.uid, { notifPrefs: prefs }).catch(() => {});
      },

      /* ------------------------ FASE 14 ------------------------- */
      scouting,

      async sendScout(scoutId, country, position, focus, days) {
        if (!club || !scouting) return "Sin datos";
        const scout = staff.find((s) => s.id === scoutId);
        if (!scout) return "Ojeador no encontrado.";
        const res = startMission({
          state: scouting, club, scout, country,
          position: position as never, focus, days,
        });
        if (res.error) return res.error;
        setScouting(res.state);
        setClub(res.club);
        await Promise.all([backend.saveScouting(res.state), backend.saveClub(res.club)]);
        return null;
      },

      async signScoutedPlayer(discoveryId) {
        if (!club || !scouting) return "Sin datos";
        const res = signDiscovery(scouting, club, discoveryId, rawPlayers.length, SQUAD_MAX);
        if (res.error || !res.player) return res.error ?? "No se pudo fichar.";
        setScouting(res.state);
        setClub(res.club);
        setRawPlayers((prev) => [...prev, res.player!].sort((a, b) => b.overall - a.overall));
        await Promise.all([
          backend.addPlayer(res.player),
          backend.saveClub(res.club),
          backend.saveScouting(res.state),
        ]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "mercado",
          title: `Fichaje por scouting: ${res.player.name}`,
          body: `El trabajo de los ojeadores da sus frutos. ${res.player.name} (${res.player.age} años) se incorpora con un nivel real de ${res.player.overall} y potencial ${res.player.potential}.`,
          read: false, important: true,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return null;
      },

      /* ------------------------ FASE 15 ------------------------- */
      dressingRoom,
      chemistry,
      concerns,

      async talkTo(playerId, kind) {
        if (!club || !dressingRoom) return "Sin datos";
        const player = rawPlayers.find((p) => p.id === playerId);
        if (!player) return "Jugador no encontrado.";
        const res = talkToPlayer(dressingRoom, club, player, kind);
        if (res.error) return res.error;
        setDressingRoom(res.state);
        setRawPlayers((prev) => prev.map((p) => (p.id === playerId ? res.player : p)));
        await Promise.all([
          backend.saveDressingRoom(res.state),
          backend.savePlayer(res.player).catch(() => {}),
        ]);
        return null;
      },

      async giveTeamTalk(preview, starterIds) {
        if (!dressingRoom) return "Sin datos";
        const res = applyTeamTalk(dressingRoom, rawPlayers, starterIds, preview);
        setDressingRoom(res.state);
        setRawPlayers(res.players);
        await backend.saveDressingRoom(res.state).catch(() => {});
        return res.record.text;
      },

      /* ------------------------ FASE 16 ------------------------- */
      liveMatch,

      async startLiveMatch() {
        if (!club || !league) return "Sin datos";
        const fx = nextFixture(league);
        if (!fx) return "No hay partidos pendientes.";
        if (Date.parse(fx.date) > gameNow().getTime()) return "Todavía no es la fecha del partido.";
        const isHome = fx.homeId === club.id;
        const rival = clubOf(league, isHome ? fx.awayId : fx.homeId);
        if (!rival) return "Rival no encontrado.";

        const userTeam = buildUserTeam(club, players, coachLevel);
        const aiTeam = buildAiTeam(rival, league.country, `${league.id}:${fx.id}`);
        setLiveMatch(createLiveMatch({
          id: `ml_${fx.id}_${uid("x").slice(-5)}`,
          seed: `${league.id}:${fx.id}:${league.seasonId}`,
          date: fx.date,
          competition: `${league.name} · Jornada ${fx.round}`,
          round: fx.round,
          leagueId: league.id,
          fixtureId: fx.id,
          home: isHome ? userTeam : aiTeam,
          away: isHome ? aiTeam : userTeam,
        }));
        return null;
      },

      advanceLiveMatch(toMinute) {
        setLiveMatch((prev) => (prev ? advanceLive(prev, toMinute).state : prev));
      },

      liveSubstitution(outId, inId) {
        if (!liveMatch) return "Sin partido en curso";
        const res = makeSubstitution(liveMatch, outId, inId);
        if (res.error) return res.error;
        setLiveMatch(res.state);
        return null;
      },

      liveTacticChange(patch) {
        if (!liveMatch) return "Sin partido en curso";
        const res = adjustTactics(liveMatch, patch);
        if (res.error) return res.error;
        setLiveMatch(res.state);
        return null;
      },

      abandonLiveMatch() {
        setLiveMatch(null);
      },

      async finishLiveMatch() {
        if (!club || !league || !liveMatch) return null;
        const finished = liveMatch.finished ? liveMatch : advanceLive(liveMatch, 90).state;
        const match = buildResult(finished);
        const nextLeague = finished.fixtureId
          ? commitLiveResult({ league, fixtureId: finished.fixtureId, match })
          : league;

        setLeague(nextLeague);
        setLastMatch(match);
        setMatches((prev) => [match, ...prev].slice(0, 30));
        setLiveMatch(null);
        await backend.saveLeague(nextLeague);
        backend.saveMatch(club.id, match).catch(() => {});

        const us = match.userSide === "home" ? match.home : match.away;
        const them = match.userSide === "home" ? match.away : match.home;
        const outcome = us.goals > them.goals ? "win" : us.goals === them.goals ? "draw" : "loss";
        const rival = nextLeague.clubs.find((c) => c.id === them.clubId);

        let updated = applyResultEffects(club, outcome as "win" | "draw" | "loss", rival?.rating ?? 55);
        let gate = null;
        if (match.userSide === "home") {
          gate = matchdayIncome(updated, { rivalRating: rival?.rating ?? 55, seed: match.id });
          updated = applyMatchdayIncome(updated, gate, them.name);
        }
        const deltas = fameFromMatch(match, rawPlayers, club.reputation, rival?.rating ?? 55);
        if (deltas.length) {
          const famed = applyFameDeltas(rawPlayers, deltas);
          setRawPlayers(famed);
          backend.savePlayersBatch(famed.filter((p) => deltas.some((d) => d.playerId === p.id))).catch(() => {});
          updated = refreshFavourites(updated, famed);
        }
        setClub(updated);
        backend.saveClub(updated).catch(() => {});

        if (fame) {
          const position = sortedTable(nextLeague).findIndex((r) => r.clubId === club.id) + 1;
          let nextFame = updateRecords(fame, match, updated, gate?.attendance ?? 0, position);
          nextFame = { ...nextFame, legends: computeLegends(rawPlayers, nextLeague, national) };
          const synced = syncAchievements(
            nextFame,
            evaluateAchievements({
              club: updated, players: rawPlayers, league: nextLeague, national, fame: nextFame,
              leaguePosition: position, matchesPlayed: matches.length + 1,
            })
          );
          setFame(synced.fame);
          backend.saveFame(synced.fame).catch(() => {});
        }

        const verdict = outcome === "win" ? "Victoria" : outcome === "draw" ? "Empate" : "Derrota";
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: match.date, category: "partido",
          title: `${verdict} ${us.goals}-${them.goals} frente al ${them.name} (dirigido en directo)`,
          body:
            `${match.competition}. MVP: ${match.motm?.name ?? "—"}. ` +
            `Hiciste ${finished.subsUsed[finished.userSide]} cambio(s) y ${finished.adjustments} ajuste(s) táctico(s).` +
            (gate ? ` Taquilla: ${gate.attendance.toLocaleString("es-ES")} espectadores.` : ""),
          read: false, important: outcome === "win",
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return match;
      },

      async doPressConference(answers) {
        if (!club || !dressingRoom) return [];
        const res = answerPress(dressingRoom, club, rawPlayers, answers);
        setDressingRoom(res.state);
        setClub(res.club);
        setRawPlayers(res.players);
        await Promise.all([
          backend.saveDressingRoom(res.state),
          backend.saveClub(res.club),
        ]);
        const item: NewsItem = {
          id: uid("news"), clubId: club.id, date: gameNow().toISOString(), category: "club",
          title: "Rueda de prensa del entrenador",
          body: res.summary.join(" "),
          read: false,
        };
        setNews((prev) => [item, ...prev]);
        backend.addNews(club.id, item).catch(() => {});
        return res.summary;
      },
    }),
    [
      ready, user, profile, club, players, rawPlayers, staff, news, rankings, league, market,
      academy, draft, staffMarket, staffEffects, national, fame, achievements, seasonHistory,
      integrity, lastSeasonSummary, competitions, world, offersIn, offersOut, managerStats,
      notifications, notifPrefs, scouting, dressingRoom, chemistry, concerns, liveMatch,
      matches, lastMatch, loadingClub, simulating, error, coachLevel, loadEverything,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): GameState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGame debe usarse dentro de <GameProvider>");
  return ctx;
}
