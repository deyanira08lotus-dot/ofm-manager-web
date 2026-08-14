/**
 * firebase/cloud-functions/gameEngine.js
 * Motor de generación del SERVIDOR. Debe mantenerse equivalente a
 * src/game/players.ts + src/game/club.ts (mismos pesos y fórmulas).
 */
const NAMES = {
  ESP: { f: ["Álvaro","Iker","Rubén","Sergio","Marcos","Adrián","Hugo","Nicolás","Javier","Pablo","Diego","Unai"], l: ["Arrieta","Vidal","Salazar","Peralta","Montoya","Cabrera","Quintana","Bermúdez","Escudero","Lozano"] },
  ARG: { f: ["Lautaro","Matías","Facundo","Tomás","Agustín","Franco","Joaquín","Nahuel"], l: ["Ferreyra","Bianchi","Solari","Ocampo","Barrios","Zabala","Maidana","Cardozo"] },
  BRA: { f: ["Vinícius","Kaio","Rafael","Wesley","Éverton","Gabriel","Lucas","Matheus"], l: ["Bragança","Ribeiro","Machado","Andrade","Cavalcanti","Barbosa","Teixeira","Nogueira"] },
  ENG: { f: ["Harvey","Callum","Reece","Kyle","Jude","Ollie","Mason","Tyler"], l: ["Whitmore","Ashcroft","Braddock","Hollis","Nightingale","Kingsley","Redfern","Blackwood"] },
  FRA: { f: ["Enzo","Théo","Maël","Lucas","Nolan","Yanis","Ilan","Rayan"], l: ["Delacroix","Beaumont","Marchand","Lefevre","Chevalier","Dubreuil","Fontaine","Sauvage"] },
  GER: { f: ["Jonas","Lennart","Finn","Maximilian","Niklas","Tobias","Julian","Marvin"], l: ["Brandtner","Kohlmann","Steinbach","Vogelsang","Reinhardt","Hartwig","Krüger","Naumann"] },
  ITA: { f: ["Alessio","Riccardo","Davide","Federico","Lorenzo","Simone","Tommaso","Giulio"], l: ["Bergonzi","Fontanella","Marchetti","Cavalieri","Zaccaria","Rinaldi","Trevisan","Pellegrino"] },
  POR: { f: ["Rúben","Tomás","Gonçalo","Diogo","Afonso","Rodrigo","Duarte","Vasco"], l: ["Coentrão","Salgueiro","Bandeira","Mendonça","Frazão","Abreu","Loureiro","Estrela"] },
  NED: { f: ["Sven","Daan","Bram","Joost","Ruben","Thijs","Stijn","Cas"], l: ["van Dammen","Brouwer","Hulshof","van Nistel","Verhoeven","Kuipers","de Ruiter","Vermeulen"] },
  MEX: { f: ["Emiliano","Santiago","Ángel","Ulises","Rodrigo","César","Iker","Erick","Cuauhtémoc","Rogelio","Efraín","Leobardo"], l: ["Zaragoza","Ocaranza","Villalobos","Aceves","Barragán","Quiñones","Solís","Mondragón","Xochipa","Berrelleza","Zepeda","Iturbide"] },
  CHI: { f: ["Matías","Vicente","Benjamín","Cristóbal","Ignacio","Bastián","Maximiliano","Sebastián","Gaspar","Emilio","Renato","Camilo"], l: ["Aravena","Sepúlveda","Fuentealba","Bascuñán","Mardones","Cárcamo","Zúñiga","Villagrán","Millalén","Huenchul","Nahuelpán","Valdebenito"] },
  JPN: { f: ["Haruto","Sota","Ren","Yuto","Kaito","Riku","Sora","Takumi"], l: ["Kurosawa","Mizuhara","Takeda","Nishimura","Hasegawa","Onodera","Kirishima","Amemiya"] },
  NGA: { f: ["Chidi","Emeka","Tunde","Kelechi","Obinna","Ifeanyi","Segun","Bayo"], l: ["Adeyemi","Okonkwo","Balogun","Nwachukwu","Eze","Obi","Adebayo","Chukwu"] },
};

const WEIGHTS = {
  GK: { reflexes:5, handling:4, aerialReach:3, kicking:2, oneOnOne:4, communication:3, concentration:3, composure:2, positioning:3, agility:2, jumping:1 },
  CB: { marking:5, tackling:5, heading:4, strength:4, positioning:4, decisions:3, concentration:3, jumping:3, passing:2, pace:2, aggression:2, composure:2 },
  LB: { tackling:4, marking:3, crossing:4, pace:4, stamina:4, workRate:3, positioning:3, dribbling:2, passing:3, agility:2, decisions:2 },
  RB: { tackling:4, marking:3, crossing:4, pace:4, stamina:4, workRate:3, positioning:3, dribbling:2, passing:3, agility:2, decisions:2 },
  DM: { tackling:5, marking:4, positioning:4, passing:4, workRate:4, stamina:3, strength:3, decisions:4, concentration:3, vision:2, aggression:2 },
  CM: { passing:5, vision:4, firstTouch:4, stamina:4, workRate:4, decisions:4, dribbling:3, tackling:3, composure:3, longShots:2, positioning:2 },
  AM: { passing:4, vision:5, dribbling:4, firstTouch:4, longShots:3, composure:3, finishing:3, decisions:3, agility:3, setPieces:2, acceleration:2 },
  LW: { dribbling:5, pace:5, acceleration:4, crossing:4, agility:4, finishing:3, firstTouch:3, workRate:2, composure:2, passing:2 },
  RW: { dribbling:5, pace:5, acceleration:4, crossing:4, agility:4, finishing:3, firstTouch:3, workRate:2, composure:2, passing:2 },
  ST: { finishing:6, positioning:4, firstTouch:4, composure:4, heading:3, strength:3, pace:3, acceleration:3, dribbling:3, longShots:2, jumping:2 },
};

const ATTRS = ["finishing","passing","dribbling","crossing","firstTouch","heading","tackling","marking","longShots","setPieces","pace","acceleration","stamina","strength","agility","jumping","vision","composure","workRate","positioning","decisions","leadership","aggression","concentration","reflexes","handling","aerialReach","kicking","oneOnOne","communication"];
const GK_ATTRS = ["reflexes","handling","aerialReach","kicking","oneOnOne","communication"];
const PERSONALITIES = ["Profesional","Ambicioso","Líder nato","Determinado","Trabajador","Temperamental","Egoísta","Tímido","Leal","Bohemio","Modelo a seguir","Inconstante"];
const STYLES = ["Killer del área","Falso 9","Torre de referencia","Extremo veloz","Cerebro organizador","Box-to-box","Destructor","Central contundente","Líbero moderno","Portero moderno"];

function rngFactory(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let s = (h ^ (h >>> 16)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, min = 1, max = 99) => Math.max(min, Math.min(max, Math.round(v)));

function overallFor(pos, a) {
  const w = WEIGHTS[pos];
  let sum = 0, tot = 0;
  for (const k in w) { sum += (a[k] || 0) * w[k]; tot += w[k]; }
  return clamp(sum / tot);
}
function classOf(p) { return p >= 93 ? "SS" : p >= 87 ? "S" : p >= 80 ? "A" : p >= 72 ? "B" : p >= 63 ? "C" : "D"; }
function marketValue(ovr, pot, age) {
  const base = 18000 * Math.exp((ovr - 40) / 6.4);
  const potF = 1 + Math.max(0, pot - ovr) * 0.035;
  const ageF = age <= 19 ? 1.45 : age <= 22 ? 1.3 : age <= 27 ? 1.05 : age <= 30 ? 0.8 : 0.5;
  return Math.max(15000, Math.round((base * potF * ageF) / 5000) * 5000);
}

function generatePlayer(opts) {
  const { seed, leagueCountry, position, quality, clubId, ownerUid } = opts;
  const minAge = opts.minAge || 17;
  const maxAge = opts.maxAge || 26;
  const forceLocal = !!opts.forceLocal;
  const origin = opts.origin || "generated";
  const rnd = rngFactory(seed);
  const pool = Object.keys(NAMES);
  const nationality = forceLocal || rnd() < 0.65 ? leagueCountry : pool[Math.floor(rnd() * pool.length)];
  const nm = NAMES[nationality] || NAMES.ESP;
  const age = minAge + Math.floor(rnd() * (maxAge - minAge + 1));
  const now = new Date();
  const birth = new Date(Date.UTC(now.getUTCFullYear() - age, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)));
  const base = quality + (age - minAge) * 0.9 + (rnd() * 10 - 5);
  const a = {};
  for (const k of ATTRS) {
    const w = WEIGHTS[position][k] || 0;
    let target = base + (w - 2.4) * 3.6;
    if (position !== "GK" && GK_ATTRS.indexOf(k) >= 0) target = 4 + rnd() * 18;
    if (position === "GK" && GK_ATTRS.indexOf(k) < 0 && w === 0) target = base * 0.45 + rnd() * 15;
    a[k] = clamp(target + (rnd() * 12 - 6));
  }
  const overall = overallFor(position, a);
  const potential = clamp(overall + (rnd() * Math.max(0, 30 - age)) * (0.4 + rnd()));
  const value = marketValue(overall, potential, age);
  const wage = Math.max(400, Math.round((value * 0.00075 + overall * 12) / 50) * 50);
  return {
    id: seed, clubId: clubId || null, ownerUid: ownerUid || null,
    name: `${nm.f[Math.floor(rnd() * nm.f.length)]} ${nm.l[Math.floor(rnd() * nm.l.length)]}`,
    nationality, birthDate: birth.toISOString(), age, position, secondaryPositions: [],
    foot: rnd() < 0.25 ? "Izquierdo" : "Derecho",
    attributes: a, overall, potential, potentialClass: classOf(potential),
    personality: PERSONALITIES[Math.floor(rnd() * PERSONALITIES.length)],
    playStyle: STYLES[Math.floor(rnd() * STYLES.length)],
    form: clamp(50 + rnd() * 30), morale: clamp(55 + rnd() * 30), fitness: clamp(88 + rnd() * 12),
    experience: clamp((age - 15) * 7), reputation: clamp(overall * 0.55 + (age - 16)),
    popularity: { local: clamp(overall * 0.4), national: clamp(overall * 0.25), international: clamp(overall * 0.12) },
    value,
    contract: {
      expires: new Date(Date.now() + (1 + Math.floor(rnd() * 4)) * 31536000000).toISOString(),
      wage, releaseClause: Math.round(value * 2.5), bonusPerGoal: Math.round(wage * 0.12),
      signedOn: new Date().toISOString(),
    },
    injury: null, trainingFocus: null,
    squadRole: overall >= 72 ? "Estrella" : overall >= 63 ? "Titular" : "Rotación",
    stats: { seasonId: "", clubId: clubId || "", apps: 0, goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0, minutes: 0, avgRating: 0 },
    careerTotals: { apps: 0, goals: 0, assists: 0, trophies: 0 },
    history: [], status: "active", createdAt: Date.now(), origin, seed,
  };
}

function generateSquad({ clubId, ownerUid, leagueCountry, quality, composition, seedBase }) {
  const out = [];
  let i = 0;
  for (const pos in composition) {
    for (let n = 0; n < composition[pos]; n++) {
      const rnd = rngFactory(`${seedBase}:${pos}:${n}`);
      const tier = n === 0 ? 5 : n === 1 ? 0 : -6;
      out.push(generatePlayer({
        seed: `${clubId}_p${String(i).padStart(2, "0")}_${Math.floor(rnd() * 9000 + 1000)}`,
        leagueCountry, position: pos, quality: quality + tier, clubId, ownerUid,
      }));
      i++;
    }
  }
  return out;
}

function buildClub({ clubId, uid, managerName, clubName, shortName, country, colors, preset, players, now }) {
  const wages = players.reduce((s, p) => s + p.contract.wage, 0);
  const followers = Math.round(preset.stadiumCapacity * 2.8);
  const mk = (key, level) => ({ key, level, maxLevel: 10, upgrading: null });
  return {
    id: clubId, ownerUid: uid, managerName, name: clubName,
    shortName: String(shortName || clubName).toUpperCase().slice(0, 4),
    country, leagueId: `${country}_D2`, division: 2, founded: 1950,
    colors: colors || { primary: "#10b981", secondary: "#0ea5e9" },
    reputation: preset.reputation,
    stadium: {
      name: `Estadio ${clubName}`, capacity: preset.stadiumCapacity, level: 2, pitchQuality: 62, ticketPrice: 25,
      seats: {
        general: Math.round(preset.stadiumCapacity * 0.78),
        premium: Math.round(preset.stadiumCapacity * 0.17),
        vip: Math.round(preset.stadiumCapacity * 0.05),
      },
      upgrading: null,
    },
    facilities: {
      stands: mk("stands", 2), shops: mk("shops", 1), trainingGround: mk("trainingGround", 2),
      academy: mk("academy", 1), medical: mk("medical", 1), analytics: mk("analytics", 1), directors: mk("directors", 1),
    },
    finances: {
      balance: preset.balance, wageBudget: preset.wageBudget, transferBudget: Math.round(preset.balance * 0.6),
      weeklyIncome: Math.round(followers * 0.11 + preset.stadiumCapacity * 1.1), weeklyExpense: wages,
      sponsorship: { name: "Aurora Energy", weekly: Math.round(preset.balance * 0.0045), expires: new Date(now.getTime() + 63072000000).toISOString() },
      ledger: [{ date: now.toISOString(), concept: "Aportación inicial de la directiva", amount: preset.balance, type: "in" }],
    },
    fanbase: { followers, loyalty: 58, satisfaction: 62, expectation: "Play-off de ascenso", favouritePlayerIds: players.slice(0, 2).map((p) => p.id) },
    tactics: { formation: "4-3-3", mentality: "Equilibrada", tempo: 55, pressing: 55, width: 55, passingStyle: "Mixto", lineup: {}, bench: [], captainId: null, penaltyTakerId: null },
    board: { confidence: 70, objective: "Luchar por plazas de ascenso", patience: 70, chairman: "Aurelio Vandermeer" },
    training: { intensity: 55, focus: "General" },
    squadSize: players.length,
    seasonId: `${now.getUTCFullYear()}-${String((now.getUTCFullYear() + 1) % 100).padStart(2, "0")}`,
    record: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
    trophies: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
}

module.exports = { generateSquad, generatePlayer, buildClub, rngFactory, overallFor, marketValue, classOf };
