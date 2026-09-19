/**
 * firebase/cloud-functions/leagueEngine.js
 * Motor de LIGAS del SERVIDOR. Debe mantenerse equivalente a src/game/league.ts
 * (mismos pesos y fórmulas).
 *
 * Depende de:
 *  - ./gameEngine  -> generatePlayer, NAMES (¡IMPORTANTE! ver nota abajo)
 *  - ./matchEngine -> quickSim, resolveLineup, simulateMatch
 *
 * NOTA 1: gameEngine.js actualmente NO exporta `NAMES`. Hay que agregarlo a su
 * module.exports:
 *   module.exports = { generateSquad, generatePlayer, buildClub, rngFactory,
 *                       overallFor, marketValue, classOf, NAMES };
 *
 * NOTA 2: en el original, el nombre de la liga usa `country.leagueName` de
 * countries.ts (ej. "LaLiga", "Premier League"). Como decidimos NO portar
 * countries.ts, acá se usa un nombre genérico: "Liga · División N". Si querés
 * los nombres reales de liga por país, hay que pasarme el mapping
 * country -> leagueName (no hace falta el archivo entero) y lo agrego.
 */

const { generatePlayer, NAMES } = require("./gameEngine");
const { quickSim, resolveLineup, simulateMatch } = require("./matchEngine");

/* ------------------------- Tiempo de juego (igual que index.js) ------------------------- */
const GAME_EPOCH = Date.parse("2026-07-01T00:00:00.000Z");
const REAL_EPOCH = Date.parse("2026-01-01T00:00:00.000Z");
const RATE = 3; // días de juego por día real
const gameNow = () => new Date(GAME_EPOCH + (Date.now() - REAL_EPOCH) * RATE);

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}
function seasonIdOf(now) {
  return `${now.getUTCFullYear()}-${String((now.getUTCFullYear() + 1) % 100).padStart(2, "0")}`;
}

/* ------------------------- RNG determinista (rng.ts) ------------------------- */
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

class Rng {
  constructor(seed) {
    this.s = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  next() {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  float(min, max) {
    return this.next() * (max - min) + min;
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  gauss(mean, sd, min = -Infinity, max = Infinity) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(max, Math.max(min, mean + n * sd));
  }
  shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

function uid(prefix = "id") {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${t}${r}`;
}

/* ------------------------- squadStrength (players.ts) ------------------------- */
function squadStrength(players) {
  const sorted = [...players].sort((a, b) => b.overall - a.overall);
  const top = sorted.slice(0, 11);
  if (!top.length) return 0;
  return Math.round(top.reduce((s, p) => s + p.overall, 0) / top.length);
}

/* ------------------------- Nombres de clubes IA ------------------------- */
const PREFIX = ["Atlético", "Real", "Sporting", "Unión", "Racing", "Deportivo", "Club", "FC", "Olímpico", "Nacional"];
const SUFFIX = [
  "Valmar", "Ríos", "Aurora", "Montenegro", "Bahía", "Ferrolán", "Nordeste", "Castilar",
  "Verdal", "Oriente", "Peñalba", "Alborada", "Ribalta", "Costa Azul", "Monteverde", "Santa Vera",
];

const ROUND_GAP_DAYS = 2; // días de juego entre jornadas (~16 h reales)

/* ------------------------- Creación de la liga ------------------------- */

function makeAiClubs(rng, country, userRating, count) {
  const names = NAMES[country] || NAMES.ESP;
  const usedNames = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let name = "";
    do {
      name = `${rng.pick(PREFIX)} ${rng.pick(SUFFIX)}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    const rating = Math.max(32, Math.min(82, Math.round(userRating + rng.gauss(0, 5.5, -11, 12))));
    out.push({
      id: `ai_${i}_${rng.int(1000, 9999)}`,
      name,
      shortName: name.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").slice(0, 3) || name.slice(0, 3).toUpperCase(),
      colors: {
        primary: rng.pick(["#ef4444", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#14b8a6", "#e11d48", "#0ea5e9"]),
        secondary: "#0f172a",
      },
      rating,
      reputation: Math.max(15, Math.min(90, rating + rng.int(-8, 8))),
      managerName: `${rng.pick(names.f)} ${rng.pick(names.l)}`,
      isUser: false,
    });
  }
  return out;
}

/** Round-robin (método del círculo) */
function roundRobin(ids) {
  const teams = [...ids];
  if (teams.length % 2) teams.push("BYE");
  const n = teams.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    teams.splice(1, 0, teams.pop());
  }
  return rounds;
}

function emptyRow(clubId) {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, form: [] };
}

function createLeague(club, players) {
  const rng = new Rng(`${club.id}:league`);
  const now = gameNow();
  const userRating = squadStrength(players);

  const userClub = {
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    colors: club.colors,
    rating: userRating,
    reputation: club.reputation,
    managerName: club.managerName,
    isUser: true,
  };
  const clubs = [userClub, ...makeAiClubs(rng, club.country, userRating, 11)];
  const ids = rng.shuffle(clubs.map((c) => c.id));
  const first = roundRobin(ids);
  const second = first.map((round) => round.map(([h, a]) => [a, h]));
  const allRounds = [...first, ...second];

  const fixtures = [];
  allRounds.forEach((pairs, idx) => {
    const date = addDays(now, idx * ROUND_GAP_DAYS).toISOString();
    pairs.forEach(([homeId, awayId], j) => {
      fixtures.push({
        id: `f${idx + 1}_${j}`,
        round: idx + 1,
        date,
        homeId,
        awayId,
        played: false,
        homeGoals: null,
        awayGoals: null,
      });
    });
  });

  const table = {};
  clubs.forEach((c) => (table[c.id] = emptyRow(c.id)));

  const conditions = {};
  players.forEach((p) => (conditions[p.id] = { form: p.form, morale: p.morale, fitness: p.fitness }));

  return {
    id: club.id,
    ownerUid: club.ownerUid,
    clubId: club.id,
    country: club.country,
    name: `Liga · División ${club.division}`, // ver NOTA 2 al inicio del archivo
    division: club.division,
    seasonId: seasonIdOf(now),
    clubs,
    fixtures,
    table,
    playerStats: {},
    conditions,
    lastMatchId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/* ------------------------- Consultas útiles ------------------------- */

function sortedTable(league) {
  return Object.values(league.table)
    .map((row) => ({ ...row, club: league.clubs.find((c) => c.id === row.clubId) }))
    .filter((r) => r.club)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gf - b.ga - (a.gf - a.ga) ||
        b.gf - a.gf ||
        a.club.name.localeCompare(b.club.name)
    );
}

function nextFixture(league) {
  return (
    league.fixtures.find((f) => !f.played && (f.homeId === league.clubId || f.awayId === league.clubId)) ?? null
  );
}

function userFixtures(league) {
  return league.fixtures.filter((f) => f.homeId === league.clubId || f.awayId === league.clubId);
}

function clubOf(league, id) {
  return league.clubs.find((c) => c.id === id);
}

function isPlayable(fixture) {
  return Date.parse(fixture.date) <= gameNow().getTime();
}

/* ------------------------- Plantillas de la IA ------------------------- */

const AI_SQUAD_CACHE = new Map();
const AI_POSITIONS = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW", "GK", "CB", "CM", "AM", "ST"];

function aiSquad(club, country) {
  const cached = AI_SQUAD_CACHE.get(club.id);
  if (cached) return cached;
  const squad = AI_POSITIONS.map((pos, i) =>
    generatePlayer({
      seed: `${club.id}_ai_${i}`,
      leagueCountry: country,
      position: pos,
      quality: club.rating + (i < 11 ? 1.5 : -5),
      clubId: club.id,
      origin: "generated",
    })
  );
  AI_SQUAD_CACHE.set(club.id, squad);
  return squad;
}

function aiTactics(rng) {
  return {
    formation: rng.pick(["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "5-3-2"]),
    mentality: rng.pick(["Defensiva", "Equilibrada", "Equilibrada", "Ofensiva"]),
    tempo: rng.int(38, 78),
    pressing: rng.int(35, 80),
    width: rng.int(40, 75),
    passingStyle: rng.pick(["Corto", "Mixto", "Directo"]),
    lineup: {},
    bench: [],
    captainId: null,
    penaltyTakerId: null,
  };
}

function buildAiTeam(club, country, seed) {
  const squad = aiSquad(club, country);
  const rng = new Rng(seed);
  return {
    clubId: club.id,
    name: club.name,
    short: club.shortName,
    colors: club.colors,
    starters: squad.slice(0, 11),
    bench: squad.slice(11),
    tactics: aiTactics(rng),
    coachLevel: Math.max(30, Math.min(92, club.rating + rng.int(-6, 8))),
    isUser: false,
  };
}

function buildUserTeam(club, players, coachLevel) {
  const { starters, bench } = resolveLineup(club.tactics, players);
  return {
    clubId: club.id,
    name: club.name,
    short: club.shortName,
    colors: club.colors,
    starters,
    bench,
    tactics: club.tactics,
    coachLevel,
    isUser: true,
  };
}

/* ------------------------- Aplicar resultados ------------------------- */

function applyToTable(league, homeId, awayId, hg, ag) {
  const h = league.table[homeId] ?? (league.table[homeId] = emptyRow(homeId));
  const a = league.table[awayId] ?? (league.table[awayId] = emptyRow(awayId));
  h.played++;
  a.played++;
  h.gf += hg;
  h.ga += ag;
  a.gf += ag;
  a.ga += hg;
  if (hg > ag) {
    h.won++;
    a.lost++;
    h.points += 3;
    h.form.push("V");
    a.form.push("D");
  } else if (hg < ag) {
    a.won++;
    h.lost++;
    a.points += 3;
    a.form.push("V");
    h.form.push("D");
  } else {
    h.drawn++;
    a.drawn++;
    h.points++;
    a.points++;
    h.form.push("E");
    a.form.push("E");
  }
  h.form = h.form.slice(-5);
  a.form = a.form.slice(-5);
}

/**
 * Juega la próxima jornada del usuario: simula su partido en detalle y el
 * resto de la jornada con simulación rápida. Devuelve el resultado
 * detallado y la liga actualizada (clasificación, estadísticas y estado
 * físico de los jugadores).
 */
function playNextRound(params) {
  const league = JSON.parse(JSON.stringify(params.league));
  const fixture = nextFixture(league);
  if (!fixture) return null;

  const isHome = fixture.homeId === league.clubId;
  const rivalId = isHome ? fixture.awayId : fixture.homeId;
  const rival = clubOf(league, rivalId);
  if (!rival) return null;

  const userTeam = buildUserTeam(params.club, params.players, params.coachLevel);
  const aiTeam = buildAiTeam(rival, league.country, `${league.id}:${fixture.id}`);

  const match = simulateMatch({
    seed: `${league.id}:${fixture.id}:${league.seasonId}`,
    id: `m_${fixture.id}_${uid("x").slice(-5)}`,
    date: fixture.date,
    competition: `${league.name} · Jornada ${fixture.round}`,
    round: fixture.round,
    leagueId: league.id,
    home: isHome ? userTeam : aiTeam,
    away: isHome ? aiTeam : userTeam,
  });

  // Marcar y aplicar el partido del usuario
  const fx = league.fixtures.find((f) => f.id === fixture.id);
  fx.played = true;
  fx.homeGoals = match.home.goals;
  fx.awayGoals = match.away.goals;
  applyToTable(league, fx.homeId, fx.awayId, match.home.goals, match.away.goals);

  // Resto de partidos de la jornada (IA vs IA)
  league.fixtures
    .filter((f) => f.round === fixture.round && !f.played)
    .forEach((f) => {
      const home = clubOf(league, f.homeId);
      const away = clubOf(league, f.awayId);
      if (!home || !away) return;
      const [hg, ag] = quickSim(home.rating, away.rating, `${league.id}:${f.id}:${league.seasonId}`);
      f.played = true;
      f.homeGoals = hg;
      f.awayGoals = ag;
      applyToTable(league, f.homeId, f.awayId, hg, ag);
    });

  applyMatchToLeague(league, match);
  league.lastMatchId = match.id;
  league.updatedAt = Date.now();
  return { league, match };
}

/**
 * FASE 16 — Confirma el resultado de un partido dirigido EN VIVO.
 * Marca la eliminatoria/jornada, actualiza la tabla, resuelve el resto de la
 * jornada y aplica condición y estadísticas, igual que `playNextRound`.
 */
function commitLiveResult(params) {
  const league = JSON.parse(JSON.stringify(params.league));
  const fx = league.fixtures.find((f) => f.id === params.fixtureId);
  if (!fx || fx.played) return league;

  fx.played = true;
  fx.homeGoals = params.match.home.goals;
  fx.awayGoals = params.match.away.goals;
  applyToTable(league, fx.homeId, fx.awayId, params.match.home.goals, params.match.away.goals);

  league.fixtures
    .filter((f) => f.round === fx.round && !f.played)
    .forEach((f) => {
      const home = clubOf(league, f.homeId);
      const away = clubOf(league, f.awayId);
      if (!home || !away) return;
      const [hg, ag] = quickSim(home.rating, away.rating, `${league.id}:${f.id}:${league.seasonId}`);
      f.played = true;
      f.homeGoals = hg;
      f.awayGoals = ag;
      applyToTable(league, f.homeId, f.awayId, hg, ag);
    });

  applyMatchToLeague(league, params.match);
  league.lastMatchId = params.match.id;
  league.updatedAt = Date.now();
  return league;
}

function applyMatchToLeague(league, match, opts = {}) {
  const countStats = opts.countStats !== false;

  for (const [pid, cond] of Object.entries(match.conditionUpdates)) {
    const prev = league.conditions[pid] ?? { form: 55, morale: 60, fitness: 90 };
    league.conditions[pid] = {
      form: cond.form,
      morale: cond.morale,
      fitness: cond.fitness,
      injuryDays: cond.injuryDays ?? (prev.injuryDays && prev.injuryDays > 0 ? prev.injuryDays : undefined),
      injuryName: cond.injuryName ?? prev.injuryName,
    };
  }

  if (!countStats) return;
  for (const [pid, s] of Object.entries(match.statUpdates)) {
    const cur = league.playerStats[pid] ?? {
      apps: 0, goals: 0, assists: 0, minutes: 0, yellow: 0, red: 0, cleanSheets: 0, ratingSum: 0,
    };
    league.playerStats[pid] = {
      apps: cur.apps + s.apps,
      goals: cur.goals + s.goals,
      assists: cur.assists + s.assists,
      minutes: cur.minutes + s.minutes,
      yellow: cur.yellow + s.yellow,
      red: cur.red + s.red,
      cleanSheets: cur.cleanSheets + s.cleanSheets,
      ratingSum: cur.ratingSum + s.ratingSum,
    };
  }
}

/**
 * Recuperación entre partidos (se ejecuta al abrir la app y en el servidor):
 * físico, curación de lesiones y ligera regresión de la forma a la media.
 */
function recoverConditions(league, elapsedGameDays) {
  if (elapsedGameDays <= 0) return league;
  const days = Math.min(30, elapsedGameDays);
  const out = { ...league, conditions: { ...league.conditions } };
  for (const [pid, c] of Object.entries(out.conditions)) {
    const injuryDays = Math.max(0, (c.injuryDays ?? 0) - days);
    out.conditions[pid] = {
      form: Math.round(c.form + (58 - c.form) * 0.04 * days),
      morale: Math.round(c.morale + (62 - c.morale) * 0.03 * days),
      fitness: Math.min(100, Math.round(c.fitness + 6 * days)),
      injuryDays: injuryDays > 0 ? injuryDays : undefined,
      injuryName: injuryDays > 0 ? c.injuryName : undefined,
    };
  }
  return out;
}

/** Mezcla la ficha canónica del jugador con su estado dinámico y estadísticas */
function mergePlayers(players, league) {
  if (!league) return players;
  return players.map((p) => {
    const c = league.conditions[p.id];
    const s = league.playerStats[p.id];
    return {
      ...p,
      form: c ? c.form : p.form,
      morale: c ? c.morale : p.morale,
      fitness: c ? c.fitness : p.fitness,
      injury: c?.injuryDays ? { name: c.injuryName ?? "Lesión", daysOut: c.injuryDays, since: "" } : p.injury,
      stats: s
        ? {
            ...p.stats,
            seasonId: league.seasonId,
            clubId: league.clubId,
            apps: s.apps,
            goals: s.goals,
            assists: s.assists,
            minutes: s.minutes,
            yellow: s.yellow,
            red: s.red,
            cleanSheets: s.cleanSheets,
            avgRating: s.apps ? Math.round((s.ratingSum / s.apps) * 10) / 10 : 0,
          }
        : p.stats,
    };
  });
}

/** Amistoso: no puntúa ni cuenta para la clasificación, pero afecta a la condición */
function playFriendly(params) {
  const league = JSON.parse(JSON.stringify(params.league));
  const rivals = league.clubs.filter((c) => !c.isUser);
  if (!rivals.length) return null;
  const rng = new Rng(`${league.id}:friendly:${Date.now()}`);
  const rival = rng.pick(rivals);

  const match = simulateMatch({
    seed: `${league.id}:friendly:${Date.now()}`,
    id: `mf_${uid("x").slice(-6)}`,
    date: gameNow().toISOString(),
    competition: "Amistoso de pretemporada",
    round: null,
    leagueId: league.id,
    home: buildUserTeam(params.club, params.players, params.coachLevel),
    away: buildAiTeam(rival, league.country, `${league.id}:friendly:${rival.id}`),
    neutral: true,
  });

  applyMatchToLeague(league, match, { countStats: false });
  league.lastMatchId = match.id;
  league.updatedAt = Date.now();
  return { league, match };
}

module.exports = {
  Rng,
  uid,
  hashSeed,
  squadStrength,
  createLeague,
  sortedTable,
  nextFixture,
  userFixtures,
  clubOf,
  isPlayable,
  aiSquad,
  buildAiTeam,
  buildUserTeam,
  playNextRound,
  commitLiveResult,
  playFriendly,
  applyMatchToLeague,
  recoverConditions,
  mergePlayers,
  gameNow,
  addDays,
  seasonIdOf,
};
