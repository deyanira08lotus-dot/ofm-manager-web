/**
 * src/services/backend.ts
 * Capa única de acceso a datos. Dos implementaciones con la MISMA interfaz:
 *   - firebaseBackend: Firestore + Firebase Auth (+ Cloud Functions si están activas)
 *   - localBackend:    localStorage (modo demo / desarrollo sin claves)
 *
 * Toda la UI usa `backend`, así que cuando conectes Firebase no hay que tocar
 * ni una pantalla.
 */
import type { Club, NewsItem, Player, StaffMember, Tactics, UserProfile } from "@/types";
import { createClubBundle, type CreateClubInput } from "@/game/club";
import type { LeagueState } from "@/game/league";
import type { MatchResult } from "@/game/match";
import type { MarketState } from "@/game/market";
import type { AcademyState, DraftState } from "@/game/youth";
import type { StaffState } from "@/game/staff";
import type { NationalState } from "@/game/national";
import type { FameState } from "@/game/fame";
import type { SeasonHistoryState } from "@/game/season";
import type { CompetitionsState } from "@/game/cups";
import type { UserTransferOffer, WorldLeague } from "@/game/multiplayer";
import type { ScoutingState } from "@/game/scouting";
import type { DressingRoomState } from "@/game/dressingroom";
import { fb, firebaseConfigured, useCloudFunctions } from "@/lib/firebase";
import { uid } from "@/game/rng";

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string | null;
}

export interface RankingRow {
  clubId: string;
  name: string;
  shortName: string;
  country: string;
  managerName: string;
  reputation: number;
  balance: number;
  squadRating: number;
}

export interface Backend {
  mode: "firebase" | "local";
  onAuth(cb: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string, managerName: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOutUser(): Promise<void>;
  getProfile(uid: string): Promise<UserProfile | null>;
  ensureProfile(user: AuthUser, managerName?: string): Promise<UserProfile>;
  /** FASE 13: avatar, escudo, biografía y preferencias de avisos */
  updateProfile(uid: string, patch: Record<string, unknown>): Promise<void>;
  getClubByOwner(uid: string): Promise<Club | null>;
  createClub(input: CreateClubInput): Promise<{ club: Club; players: Player[] }>;
  getPlayers(clubId: string): Promise<Player[]>;
  getStaff(clubId: string): Promise<StaffMember[]>;
  getNews(clubId: string): Promise<NewsItem[]>;
  markNewsRead(clubId: string, newsId: string): Promise<void>;
  saveTactics(clubId: string, tactics: Tactics): Promise<void>;
  setPlayerTraining(clubId: string, playerId: string, focus: string | null, role: string): Promise<void>;
  getRankings(): Promise<RankingRow[]>;
  /* --- FASE 2: competición --- */
  getLeague(clubId: string): Promise<LeagueState | null>;
  saveLeague(league: LeagueState): Promise<void>;
  saveMatch(clubId: string, match: MatchResult): Promise<void>;
  getMatches(clubId: string): Promise<MatchResult[]>;
  saveTraining(clubId: string, training: Club["training"]): Promise<void>;
  addNews(clubId: string, item: NewsItem): Promise<void>;
  /* --- FASE 3: economía, instalaciones y directiva --- */
  saveClub(club: Club): Promise<void>;
  /* --- FASE 4: mercado --- */
  getMarket(clubId: string): Promise<MarketState | null>;
  saveMarket(market: MarketState): Promise<void>;
  addPlayer(player: Player): Promise<void>;
  savePlayer(player: Player): Promise<void>;
  removePlayer(playerId: string): Promise<void>;
  /* --- FASES 5-6: academia y draft --- */
  getAcademy(clubId: string): Promise<AcademyState | null>;
  saveAcademy(state: AcademyState): Promise<void>;
  getDraft(clubId: string): Promise<DraftState | null>;
  saveDraft(state: DraftState): Promise<void>;
  /* --- FASE 7: cuerpo técnico --- */
  getStaffState(clubId: string): Promise<StaffState | null>;
  saveStaffState(state: StaffState): Promise<void>;
  addStaff(clubId: string, member: StaffMember): Promise<void>;
  saveStaffMember(clubId: string, member: StaffMember): Promise<void>;
  removeStaff(staffId: string): Promise<void>;
  /* --- FASE 8: selecciones --- */
  getNational(clubId: string): Promise<NationalState | null>;
  saveNational(state: NationalState): Promise<void>;
  /* --- FASE 9: fama, logros y récords --- */
  getFame(clubId: string): Promise<FameState | null>;
  saveFame(state: FameState): Promise<void>;
  savePlayersBatch(players: Player[]): Promise<void>;
  /* --- FASE 10: temporadas --- */
  getSeasonHistory(clubId: string): Promise<SeasonHistoryState | null>;
  saveSeasonHistory(state: SeasonHistoryState): Promise<void>;
  replaceSquad(clubId: string, players: Player[], removedIds: string[]): Promise<void>;
  /* --- FASE 11: copas y competiciones --- */
  getCompetitions(clubId: string): Promise<CompetitionsState | null>;
  saveCompetitions(state: CompetitionsState): Promise<void>;
  /* --- FASE 12: multijugador --- */
  getWorldLeague(leagueId: string): Promise<WorldLeague | null>;
  saveWorldLeague(league: WorldLeague): Promise<void>;
  listWorldLeagues(): Promise<WorldLeague[]>;
  sendOffer(offer: UserTransferOffer): Promise<void>;
  getOffersFor(uid: string): Promise<UserTransferOffer[]>;
  getOffersFrom(uid: string): Promise<UserTransferOffer[]>;
  updateOffer(offer: UserTransferOffer): Promise<void>;
  transferPlayerTo(player: Player): Promise<void>;
  /* --- FASE 14: scouting --- */
  getScouting(clubId: string): Promise<ScoutingState | null>;
  saveScouting(state: ScoutingState): Promise<void>;
  /* --- FASE 15: vestuario --- */
  getDressingRoom(clubId: string): Promise<DressingRoomState | null>;
  saveDressingRoom(state: DressingRoomState): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* MODO LOCAL                                                          */
/* ------------------------------------------------------------------ */

const LS = {
  users: "fm.users",
  session: "fm.session",
  profiles: "fm.profiles",
  clubs: "fm.clubs",
  players: "fm.players",
  staff: "fm.staff",
  news: "fm.news",
  leagues: "fm.leagues",
  matches: "fm.matches",
  markets: "fm.markets",
  academies: "fm.academies",
  drafts: "fm.drafts",
  staffStates: "fm.staffStates",
  nationals: "fm.nationals",
  fame: "fm.fame",
  seasons: "fm.seasons",
  competitions: "fm.competitions",
  worlds: "fm.worlds",
  offers: "fm.offers",
  scouting: "fm.scouting",
  dressing: "fm.dressing",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

const listeners = new Set<(u: AuthUser | null) => void>();

const localBackend: Backend = {
  mode: "local",

  onAuth(cb) {
    listeners.add(cb);
    const session = read<AuthUser | null>(LS.session, null);
    setTimeout(() => cb(session), 0);
    return () => listeners.delete(cb);
  },

  async signUp(email, password, managerName) {
    const users = read<Record<string, { uid: string; pass: string }>>(LS.users, {});
    const key = email.toLowerCase();
    if (users[key]) throw new Error("Ya existe una cuenta con ese email.");
    const user: AuthUser = { uid: uid("u"), email: key, displayName: managerName };
    users[key] = { uid: user.uid, pass: hash(password) };
    write(LS.users, users);
    write(LS.session, user);
    await this.ensureProfile(user, managerName);
    listeners.forEach((l) => l(user));
    return user;
  },

  async signIn(email, password) {
    const users = read<Record<string, { uid: string; pass: string }>>(LS.users, {});
    const key = email.toLowerCase();
    const rec = users[key];
    if (!rec || rec.pass !== hash(password)) throw new Error("Email o contraseña incorrectos.");
    const profiles = read<Record<string, UserProfile>>(LS.profiles, {});
    const user: AuthUser = { uid: rec.uid, email: key, displayName: profiles[rec.uid]?.managerName };
    write(LS.session, user);
    listeners.forEach((l) => l(user));
    return user;
  },

  async signOutUser() {
    localStorage.removeItem(LS.session);
    listeners.forEach((l) => l(null));
  },

  async getProfile(id) {
    return read<Record<string, UserProfile>>(LS.profiles, {})[id] ?? null;
  },

  async ensureProfile(user, managerName) {
    const profiles = read<Record<string, UserProfile>>(LS.profiles, {});
    if (!profiles[user.uid]) {
      profiles[user.uid] = {
        uid: user.uid,
        email: user.email,
        managerName: managerName || user.displayName || user.email.split("@")[0],
        clubId: null,
        country: null,
        managerLevel: 1,
        managerXp: 0,
        reputation: 20,
        achievements: [],
        createdAt: Date.now(),
        lastSeen: Date.now(),
      };
      write(LS.profiles, profiles);
    }
    return profiles[user.uid];
  },

  async updateProfile(uid, patch) {
    const profiles = read<Record<string, UserProfile>>(LS.profiles, {});
    if (profiles[uid]) {
      profiles[uid] = { ...profiles[uid], ...patch } as UserProfile;
      write(LS.profiles, profiles);
    }
  },

  async getClubByOwner(ownerUid) {
    const clubs = read<Record<string, Club>>(LS.clubs, {});
    return Object.values(clubs).find((c) => c.ownerUid === ownerUid) ?? null;
  },

  async createClub(input) {
    const existing = await this.getClubByOwner(input.ownerUid);
    if (existing) throw new Error("Este usuario ya tiene un club.");
    const bundle = createClubBundle(input);
    const clubs = read<Record<string, Club>>(LS.clubs, {});
    clubs[bundle.club.id] = bundle.club;
    write(LS.clubs, clubs);

    const players = read<Record<string, Player>>(LS.players, {});
    bundle.players.forEach((p) => (players[p.id] = p));
    write(LS.players, players);

    const staff = read<Record<string, StaffMember & { clubId: string }>>(LS.staff, {});
    bundle.staff.forEach((s) => (staff[s.id] = { ...s, clubId: bundle.club.id }));
    write(LS.staff, staff);

    const news = read<NewsItem[]>(LS.news, []);
    write(LS.news, [...bundle.news, ...news]);

    const profiles = read<Record<string, UserProfile>>(LS.profiles, {});
    if (profiles[input.ownerUid]) {
      profiles[input.ownerUid].clubId = bundle.club.id;
      profiles[input.ownerUid].country = input.country;
      write(LS.profiles, profiles);
    }
    return { club: bundle.club, players: bundle.players };
  },

  async getPlayers(clubId) {
    return Object.values(read<Record<string, Player>>(LS.players, {})).filter((p) => p.clubId === clubId);
  },

  async getStaff(clubId) {
    return Object.values(read<Record<string, StaffMember & { clubId: string }>>(LS.staff, {})).filter(
      (s) => s.clubId === clubId
    );
  },

  async getNews(clubId) {
    return read<NewsItem[]>(LS.news, []).filter((n) => n.clubId === clubId);
  },

  async markNewsRead(clubId, newsId) {
    const news = read<NewsItem[]>(LS.news, []);
    const item = news.find((n) => n.id === newsId && n.clubId === clubId);
    if (item) item.read = true;
    write(LS.news, news);
  },

  async saveTactics(clubId, tactics) {
    const clubs = read<Record<string, Club>>(LS.clubs, {});
    if (clubs[clubId]) {
      clubs[clubId].tactics = tactics;
      clubs[clubId].updatedAt = Date.now();
      write(LS.clubs, clubs);
    }
  },

  async setPlayerTraining(_clubId, playerId, focus, role) {
    const players = read<Record<string, Player>>(LS.players, {});
    const p = players[playerId];
    if (p) {
      p.trainingFocus = (focus as Player["trainingFocus"]) ?? null;
      p.squadRole = role as Player["squadRole"];
      write(LS.players, players);
    }
  },

  async getLeague(clubId) {
    return read<Record<string, LeagueState>>(LS.leagues, {})[clubId] ?? null;
  },

  async saveLeague(league) {
    const all = read<Record<string, LeagueState>>(LS.leagues, {});
    all[league.clubId] = league;
    write(LS.leagues, all);
  },

  async saveMatch(clubId, match) {
    const all = read<Record<string, MatchResult[]>>(LS.matches, {});
    all[clubId] = [match, ...(all[clubId] ?? [])].slice(0, 40);
    write(LS.matches, all);
  },

  async getMatches(clubId) {
    return read<Record<string, MatchResult[]>>(LS.matches, {})[clubId] ?? [];
  },

  async saveTraining(clubId, training) {
    const clubs = read<Record<string, Club>>(LS.clubs, {});
    if (clubs[clubId]) {
      clubs[clubId].training = training;
      clubs[clubId].updatedAt = Date.now();
      write(LS.clubs, clubs);
    }
  },

  async addNews(clubId, item) {
    const news = read<NewsItem[]>(LS.news, []);
    write(LS.news, [{ ...item, clubId }, ...news].slice(0, 120));
  },

  async saveClub(club) {
    const clubs = read<Record<string, Club>>(LS.clubs, {});
    clubs[club.id] = club;
    write(LS.clubs, clubs);
  },

  async getMarket(clubId) {
    return read<Record<string, MarketState>>(LS.markets, {})[clubId] ?? null;
  },

  async saveMarket(market) {
    const all = read<Record<string, MarketState>>(LS.markets, {});
    all[market.clubId] = market;
    write(LS.markets, all);
  },

  async addPlayer(player) {
    const players = read<Record<string, Player>>(LS.players, {});
    players[player.id] = player;
    write(LS.players, players);
  },

  async savePlayer(player) {
    const players = read<Record<string, Player>>(LS.players, {});
    players[player.id] = player;
    write(LS.players, players);
  },

  async removePlayer(playerId) {
    const players = read<Record<string, Player>>(LS.players, {});
    delete players[playerId];
    write(LS.players, players);
  },

  async getAcademy(clubId) {
    return read<Record<string, AcademyState>>(LS.academies, {})[clubId] ?? null;
  },
  async saveAcademy(state) {
    const all = read<Record<string, AcademyState>>(LS.academies, {});
    all[state.clubId] = state;
    write(LS.academies, all);
  },
  async getDraft(clubId) {
    return read<Record<string, DraftState>>(LS.drafts, {})[clubId] ?? null;
  },
  async saveDraft(state) {
    const all = read<Record<string, DraftState>>(LS.drafts, {});
    all[state.clubId] = state;
    write(LS.drafts, all);
  },

  async getStaffState(clubId) {
    return read<Record<string, StaffState>>(LS.staffStates, {})[clubId] ?? null;
  },
  async saveStaffState(state) {
    const all = read<Record<string, StaffState>>(LS.staffStates, {});
    all[state.clubId] = state;
    write(LS.staffStates, all);
  },
  async addStaff(clubId, member) {
    const all = read<Record<string, StaffMember & { clubId: string }>>(LS.staff, {});
    all[member.id] = { ...member, clubId };
    write(LS.staff, all);
  },
  async saveStaffMember(clubId, member) {
    const all = read<Record<string, StaffMember & { clubId: string }>>(LS.staff, {});
    all[member.id] = { ...member, clubId };
    write(LS.staff, all);
  },
  async removeStaff(staffId) {
    const all = read<Record<string, StaffMember & { clubId: string }>>(LS.staff, {});
    delete all[staffId];
    write(LS.staff, all);
  },

  async getNational(clubId) {
    return read<Record<string, NationalState>>(LS.nationals, {})[clubId] ?? null;
  },
  async saveNational(state) {
    const all = read<Record<string, NationalState>>(LS.nationals, {});
    all[state.clubId] = state;
    write(LS.nationals, all);
  },

  async getFame(clubId) {
    return read<Record<string, FameState>>(LS.fame, {})[clubId] ?? null;
  },
  async saveFame(state) {
    const all = read<Record<string, FameState>>(LS.fame, {});
    all[state.clubId] = state;
    write(LS.fame, all);
  },
  async savePlayersBatch(list) {
    const players = read<Record<string, Player>>(LS.players, {});
    list.forEach((p) => (players[p.id] = p));
    write(LS.players, players);
  },

  async getSeasonHistory(clubId) {
    return read<Record<string, SeasonHistoryState>>(LS.seasons, {})[clubId] ?? null;
  },
  async saveSeasonHistory(state) {
    const all = read<Record<string, SeasonHistoryState>>(LS.seasons, {});
    all[state.clubId] = state;
    write(LS.seasons, all);
  },
  async replaceSquad(_clubId, list, removedIds) {
    const players = read<Record<string, Player>>(LS.players, {});
    removedIds.forEach((id) => delete players[id]);
    list.forEach((p) => (players[p.id] = p));
    write(LS.players, players);
  },

  async getCompetitions(clubId) {
    return read<Record<string, CompetitionsState>>(LS.competitions, {})[clubId] ?? null;
  },
  async saveCompetitions(state) {
    const all = read<Record<string, CompetitionsState>>(LS.competitions, {});
    all[state.clubId] = state;
    write(LS.competitions, all);
  },

  async getWorldLeague(leagueId) {
    return read<Record<string, WorldLeague>>(LS.worlds, {})[leagueId] ?? null;
  },
  async saveWorldLeague(league) {
    const all = read<Record<string, WorldLeague>>(LS.worlds, {});
    all[league.id] = league;
    write(LS.worlds, all);
  },
  async listWorldLeagues() {
    return Object.values(read<Record<string, WorldLeague>>(LS.worlds, {}));
  },
  async sendOffer(offer) {
    const all = read<UserTransferOffer[]>(LS.offers, []);
    write(LS.offers, [offer, ...all].slice(0, 200));
  },
  async getOffersFor(uid) {
    return read<UserTransferOffer[]>(LS.offers, []).filter((o) => o.toUid === uid);
  },
  async getOffersFrom(uid) {
    return read<UserTransferOffer[]>(LS.offers, []).filter((o) => o.fromUid === uid);
  },
  async updateOffer(offer) {
    const all = read<UserTransferOffer[]>(LS.offers, []);
    write(LS.offers, all.map((o) => (o.id === offer.id ? offer : o)));
  },
  async transferPlayerTo(player) {
    const players = read<Record<string, Player>>(LS.players, {});
    players[player.id] = player;
    write(LS.players, players);
  },

  async getScouting(clubId) {
    return read<Record<string, ScoutingState>>(LS.scouting, {})[clubId] ?? null;
  },
  async saveScouting(state) {
    const all = read<Record<string, ScoutingState>>(LS.scouting, {});
    all[state.clubId] = state;
    write(LS.scouting, all);
  },
  async getDressingRoom(clubId) {
    return read<Record<string, DressingRoomState>>(LS.dressing, {})[clubId] ?? null;
  },
  async saveDressingRoom(state) {
    const all = read<Record<string, DressingRoomState>>(LS.dressing, {});
    all[state.clubId] = state;
    write(LS.dressing, all);
  },

  async getRankings() {
    const clubs = Object.values(read<Record<string, Club>>(LS.clubs, {}));
    const players = Object.values(read<Record<string, Player>>(LS.players, {}));
    return clubs
      .map((c) => {
        const squad = players.filter((p) => p.clubId === c.id).sort((a, b) => b.overall - a.overall).slice(0, 11);
        return {
          clubId: c.id,
          name: c.name,
          shortName: c.shortName,
          country: c.country,
          managerName: c.managerName,
          reputation: c.reputation,
          balance: c.finances.balance,
          squadRating: squad.length ? Math.round(squad.reduce((s, p) => s + p.overall, 0) / squad.length) : 0,
        };
      })
      .sort((a, b) => b.reputation - a.reputation);
  },
};

/* ------------------------------------------------------------------ */
/* MODO FIREBASE                                                       */
/* ------------------------------------------------------------------ */

const firebaseBackend: Backend = {
  mode: "firebase",

  onAuth(cb) {
    let unsub = () => {};
    (async () => {
      const { onAuthStateChanged } = await import("firebase/auth");
      const ctx = fb()!;
      unsub = onAuthStateChanged(ctx.auth, (u) =>
        cb(u ? { uid: u.uid, email: u.email ?? "", displayName: u.displayName } : null)
      );
    })();
    return () => unsub();
  },

  async signUp(email, password, managerName) {
    const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
    const ctx = fb()!;
    const cred = await createUserWithEmailAndPassword(ctx.auth, email, password);
    await updateProfile(cred.user, { displayName: managerName });
    const user: AuthUser = { uid: cred.user.uid, email: cred.user.email ?? email, displayName: managerName };
    await this.ensureProfile(user, managerName);
    return user;
  },

  async signIn(email, password) {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const ctx = fb()!;
    const cred = await signInWithEmailAndPassword(ctx.auth, email, password);
    return { uid: cred.user.uid, email: cred.user.email ?? email, displayName: cred.user.displayName };
  },

  async signOutUser() {
    const { signOut } = await import("firebase/auth");
    await signOut(fb()!.auth);
  },

  async getProfile(id) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "users", id));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  },

  async ensureProfile(user, managerName) {
    const { doc, getDoc, setDoc, serverTimestamp, updateDoc } = await import("firebase/firestore");
    const ref = doc(fb()!.db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { lastSeen: Date.now() }).catch(() => {});
      return snap.data() as UserProfile;
    }
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email,
      managerName: managerName || user.displayName || user.email.split("@")[0],
      clubId: null,
      country: null,
      managerLevel: 1,
      managerXp: 0,
      reputation: 20,
      achievements: [],
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };
    await setDoc(ref, { ...profile, createdAtServer: serverTimestamp() });
    return profile;
  },

  async updateProfile(uid, patch) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "users", uid), patch, { merge: true });
  },

  async getClubByOwner(ownerUid) {
    const { collection, getDocs, limit, query, where } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "clubs"), where("ownerUid", "==", ownerUid), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as Club);
  },

  async createClub(input) {
    const ctx = fb()!;
    // 1) Camino recomendado: Cloud Function (el servidor genera todo)
    if (useCloudFunctions) {
      const { httpsCallable } = await import("firebase/functions");
      const call = httpsCallable(ctx.functions, "createClub");
      const res = (await call(input)) as { data: { clubId: string } };
      const club = await this.getClubByOwner(input.ownerUid);
      const players = await this.getPlayers(res.data.clubId);
      if (!club) throw new Error("El servidor no devolvió el club.");
      return { club, players };
    }
    // 2) Camino sin Functions: escritura en lote protegida por reglas
    //    (las reglas impiden crear un 2º club y modificar el saldo después).
    const { doc, writeBatch } = await import("firebase/firestore");
    const existing = await this.getClubByOwner(input.ownerUid);
    if (existing) throw new Error("Este usuario ya tiene un club.");
    const bundle = createClubBundle(input);
    const batch = writeBatch(ctx.db);
    batch.set(doc(ctx.db, "clubs", bundle.club.id), bundle.club);
    bundle.players.forEach((p) => batch.set(doc(ctx.db, "players", p.id), p));
    bundle.staff.forEach((s) => batch.set(doc(ctx.db, "staff", s.id), { ...s, clubId: bundle.club.id }));
    bundle.news.forEach((n) => batch.set(doc(ctx.db, "clubs", bundle.club.id, "news", n.id), n));
    batch.set(
      doc(ctx.db, "users", input.ownerUid),
      { clubId: bundle.club.id, country: input.country },
      { merge: true }
    );
    await batch.commit();
    return { club: bundle.club, players: bundle.players };
  },

  async getPlayers(clubId) {
    const { collection, getDocs, query, where } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "players"), where("clubId", "==", clubId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Player);
  },

  async getStaff(clubId) {
    const { collection, getDocs, query, where } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "staff"), where("clubId", "==", clubId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StaffMember);
  },

  async getNews(clubId) {
    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "clubs", clubId, "news"), orderBy("date", "desc"), limit(30));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as NewsItem);
  },

  async markNewsRead(clubId, newsId) {
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(fb()!.db, "clubs", clubId, "news", newsId), { read: true });
  },

  async saveTactics(clubId, tactics) {
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(fb()!.db, "clubs", clubId), { tactics, updatedAt: Date.now() });
  },

  async setPlayerTraining(_clubId, playerId, focus, role) {
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(fb()!.db, "players", playerId), { trainingFocus: focus, squadRole: role });
  },

  async getLeague(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "leagues", clubId));
    return snap.exists() ? (snap.data() as LeagueState) : null;
  },

  async saveLeague(league) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "leagues", league.clubId), league);
  },

  async saveMatch(clubId, match) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "clubs", clubId, "matches", match.id), match);
  },

  async getMatches(clubId) {
    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "clubs", clubId, "matches"), orderBy("date", "desc"), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MatchResult);
  },

  async saveTraining(clubId, training) {
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(fb()!.db, "clubs", clubId), { training, updatedAt: Date.now() });
  },

  async addNews(clubId, item) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "clubs", clubId, "news", item.id), { ...item, clubId });
  },

  async saveClub(club) {
    const { doc, updateDoc } = await import("firebase/firestore");
    // Solo campos de gestión: nunca se tocan ownerUid, id ni trofeos.
    await updateDoc(doc(fb()!.db, "clubs", club.id), {
      finances: club.finances,
      facilities: club.facilities,
      stadium: club.stadium,
      fanbase: club.fanbase,
      board: club.board,
      reputation: club.reputation,
      record: club.record,
      squadSize: club.squadSize,
      updatedAt: Date.now(),
    });
  },

  async getMarket(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "transfers", clubId));
    return snap.exists() ? (snap.data() as MarketState) : null;
  },

  async saveMarket(market) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "transfers", market.clubId), market);
  },

  async addPlayer(player) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "players", player.id), player);
  },

  async savePlayer(player) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "players", player.id), player, { merge: true });
  },

  async removePlayer(playerId) {
    const { doc, updateDoc } = await import("firebase/firestore");
    // No se borra: se desvincula (trazabilidad e histórico del jugador)
    await updateDoc(doc(fb()!.db, "players", playerId), { clubId: null, ownerUid: null, status: "free" });
  },

  async getAcademy(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "academies", clubId));
    return snap.exists() ? (snap.data() as AcademyState) : null;
  },
  async saveAcademy(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "academies", state.clubId), state);
  },
  async getDraft(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "drafts", clubId));
    return snap.exists() ? (snap.data() as DraftState) : null;
  },
  async saveDraft(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "drafts", state.clubId), state);
  },

  async getStaffState(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "staffMarkets", clubId));
    return snap.exists() ? (snap.data() as StaffState) : null;
  },
  async saveStaffState(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "staffMarkets", state.clubId), state);
  },
  async addStaff(clubId, member) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "staff", member.id), { ...member, clubId });
  },
  async saveStaffMember(clubId, member) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "staff", member.id), { ...member, clubId }, { merge: true });
  },
  async removeStaff(staffId) {
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(fb()!.db, "staff", staffId), { clubId: null });
  },

  async getNational(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "nationalTeams", clubId));
    return snap.exists() ? (snap.data() as NationalState) : null;
  },
  async saveNational(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "nationalTeams", state.clubId), state);
  },

  async getFame(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "achievements", clubId));
    return snap.exists() ? (snap.data() as FameState) : null;
  },
  async saveFame(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "achievements", state.clubId), state);
  },
  async savePlayersBatch(list) {
    if (!list.length) return;
    const { doc, writeBatch } = await import("firebase/firestore");
    const ctx = fb()!;
    // Lotes de 400 para no superar el límite de 500 escrituras
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(ctx.db);
      list.slice(i, i + 400).forEach((p) => {
        batch.set(
          doc(ctx.db, "players", p.id),
          { reputation: p.reputation, popularity: p.popularity },
          { merge: true }
        );
      });
      await batch.commit();
    }
  },

  async getSeasonHistory(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "seasons", clubId));
    return snap.exists() ? (snap.data() as SeasonHistoryState) : null;
  },
  async saveSeasonHistory(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "seasons", state.clubId), state);
  },
  async replaceSquad(_clubId, list, removedIds) {
    const { doc, writeBatch } = await import("firebase/firestore");
    const ctx = fb()!;
    const batch = writeBatch(ctx.db);
    // Los retirados no se borran: quedan como histórico
    removedIds.slice(0, 200).forEach((id) => {
      batch.set(doc(ctx.db, "players", id), { clubId: null, status: "retired" }, { merge: true });
    });
    list.slice(0, 250).forEach((p) => batch.set(doc(ctx.db, "players", p.id), p, { merge: true }));
    await batch.commit();
  },

  async getCompetitions(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "competitions", clubId));
    return snap.exists() ? (snap.data() as CompetitionsState) : null;
  },
  async saveCompetitions(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "competitions", state.clubId), state);
  },

  /* --- FASE 12: multijugador (documentos compartidos) --- */
  async getWorldLeague(leagueId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "worldLeagues", leagueId));
    return snap.exists() ? (snap.data() as WorldLeague) : null;
  },
  async saveWorldLeague(league) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "worldLeagues", league.id), league);
  },
  async listWorldLeagues() {
    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "worldLeagues"), orderBy("updatedAt", "desc"), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WorldLeague);
  },
  async sendOffer(offer) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "transferOffers", offer.id), offer);
  },
  async getOffersFor(uid) {
    const { collection, getDocs, limit, query, where } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "transferOffers"), where("toUid", "==", uid), limit(40));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserTransferOffer);
  },
  async getOffersFrom(uid) {
    const { collection, getDocs, limit, query, where } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "transferOffers"), where("fromUid", "==", uid), limit(40));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserTransferOffer);
  },
  async updateOffer(offer) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "transferOffers", offer.id), offer, { merge: true });
  },
  async transferPlayerTo(player) {
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(fb()!.db, "players", player.id), {
      clubId: player.clubId,
      ownerUid: player.ownerUid,
      origin: player.origin,
      morale: player.morale,
      history: player.history,
    });
  },

  async getScouting(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "scouting", clubId));
    return snap.exists() ? (snap.data() as ScoutingState) : null;
  },
  async saveScouting(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "scouting", state.clubId), state);
  },
  async getDressingRoom(clubId) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(fb()!.db, "dressingRooms", clubId));
    return snap.exists() ? (snap.data() as DressingRoomState) : null;
  },
  async saveDressingRoom(state) {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(fb()!.db, "dressingRooms", state.clubId), state);
  },

  async getRankings() {
    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");
    const q = query(collection(fb()!.db, "clubs"), orderBy("reputation", "desc"), limit(25));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const c = d.data() as Club;
      return {
        clubId: c.id,
        name: c.name,
        shortName: c.shortName,
        country: c.country,
        managerName: c.managerName,
        reputation: c.reputation,
        balance: c.finances?.balance ?? 0,
        squadRating: 0,
      };
    });
  },
};

export const backend: Backend = firebaseConfigured ? firebaseBackend : localBackend;
export const isLocalMode = backend.mode === "local";
