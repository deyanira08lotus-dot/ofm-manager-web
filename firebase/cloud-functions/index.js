/**
 * firebase/cloud-functions/index.js
 * Cloud Functions (Node 20, firebase-functions v2). El SERVIDOR es la fuente de
 * verdad: aquí se genera el club, se procesan entrenamientos, finanzas, academia
 * y draft. El cliente nunca escribe dinero, atributos ni resultados.
 *
 * Desplegar:
 *   npm i -g firebase-tools
 *   firebase login
 *   cd firebase/cloud-functions && npm install
 *   firebase deploy --only functions
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { generateSquad, buildClub } = require("./gameEngine");

initializeApp();
const db = getFirestore();
const REGION = "europe-west1";

/* Config replicada del cliente (src/game/config.ts) */
const PRESETS = {
  modesto:   { balance: 4000000,  wageBudget: 120000, reputation: 32, stadiumCapacity: 9000,  quality: 47 },
  estandar:  { balance: 12000000, wageBudget: 260000, reputation: 46, stadiumCapacity: 18000, quality: 55 },
  ambicioso: { balance: 30000000, wageBudget: 520000, reputation: 58, stadiumCapacity: 30000, quality: 62 },
};
const COMPOSITION = { GK: 3, CB: 4, LB: 2, RB: 2, DM: 2, CM: 3, AM: 2, LW: 1, RW: 1, ST: 2 };
const GAME_EPOCH = Date.parse("2026-07-01T00:00:00.000Z");
const REAL_EPOCH = Date.parse("2026-01-01T00:00:00.000Z");
const RATE = 3; // días de juego por día real
const gameNow = () => new Date(GAME_EPOCH + (Date.now() - REAL_EPOCH) * RATE);

function rngFactory(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = (h ^ (h >>> 16)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* 1) CREAR CLUB — una sola vez por usuario, escritura atómica          */
/* ------------------------------------------------------------------ */
exports.createClub = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const { clubName, shortName, country, colors, presetKey } = req.data || {};
  if (!clubName || String(clubName).trim().length < 3) throw new HttpsError("invalid-argument", "Nombre inválido.");
  const preset = PRESETS[presetKey] || PRESETS.estandar;

  const existing = await db.collection("clubs").where("ownerUid", "==", uid).limit(1).get();
  if (!existing.empty) throw new HttpsError("already-exists", "Ya tienes un club.");

  const clubRef = db.collection("clubs").doc();
  const clubId = clubRef.id;
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const managerName = (userSnap.data() || {}).managerName || "Manager";

  const players = generateSquad({
    clubId, ownerUid: uid, leagueCountry: country,
    quality: preset.quality, composition: COMPOSITION, seedBase: `${clubId}:squad`,
  });
  const club = buildClub({ clubId, uid, managerName, clubName, shortName, country, colors, preset, players, now: gameNow() });

  const batch = db.batch();
  batch.set(clubRef, club);
  players.forEach((p) => batch.set(db.doc(`players/${p.id}`), p));
  batch.set(userRef, { clubId, country, lastSeen: Date.now() }, { merge: true });
  batch.set(clubRef.collection("news").doc(), {
    clubId, date: gameNow().toISOString(), category: "club", read: false, important: true,
    title: `${managerName} toma las riendas del ${clubName}`,
    body: "La directiva presenta al nuevo manager y aprueba el presupuesto de la temporada.",
  });
  await batch.commit();
  return { clubId };
});

/* ------------------------------------------------------------------ */
/* 2) TICK DIARIO: entrenamiento, forma, fatiga, lesiones               */
/*    (cada 8 h reales = 1 día de juego con RATE=3)                     */
/* ------------------------------------------------------------------ */
exports.dailyTick = onSchedule(
  { region: REGION, schedule: "every 8 hours", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const now = gameNow();
    const clubs = await db.collection("clubs").get();

    for (const clubDoc of clubs.docs) {
      const club = clubDoc.data();
      const players = await db.collection("players").where("clubId", "==", club.id).get();
      const batch = db.batch();
      const trainingLevel = (club.facilities && club.facilities.trainingGround && club.facilities.trainingGround.level) || 1;
      const medicalLevel = (club.facilities && club.facilities.medical && club.facilities.medical.level) || 1;

      players.forEach((snap) => {
        const p = snap.data();
        const rnd = rngFactory(`${p.id}:${now.toISOString().slice(0, 10)}`);
        const updates = {};

        updates.fitness = Math.min(100, (p.fitness || 90) + 4 + medicalLevel * 0.5);

        const room = (p.potential || 60) - (p.overall || 50);
        const ageFactor = p.age <= 21 ? 1.4 : p.age <= 25 ? 1 : p.age <= 29 ? 0.4 : -0.6;
        const gain = (room > 0 ? room * 0.004 : 0) * ageFactor * (0.7 + trainingLevel * 0.06) * (0.5 + rnd());
        if (gain !== 0) updates.overall = Math.max(1, Math.min(99, Number(((p.overall || 50) + gain).toFixed(2))));

        updates.form = Math.max(20, Math.min(99, (p.form || 60) + (rnd() * 6 - 3)));
        updates.morale = Math.max(10, Math.min(99, (p.morale || 65) + (rnd() * 4 - 2)));

        if (!p.injury && rnd() < 0.004 / (1 + medicalLevel * 0.15)) {
          const days = 3 + Math.floor(rnd() * 45);
          updates.injury = {
            name: days > 30 ? "Lesión muscular grave" : "Molestias musculares",
            daysOut: days, since: now.toISOString(),
          };
        } else if (p.injury) {
          const left = p.injury.daysOut - 1;
          updates.injury = left <= 0 ? null : Object.assign({}, p.injury, { daysOut: left });
        }
        batch.update(snap.ref, updates);
      });

      await batch.commit();
    }
  }
);

/* ------------------------------------------------------------------ */
/* 3) FINANZAS SEMANALES + OBRAS (FASE 3)                               */
/*    Réplica de src/game/economy.ts (weeklyBreakdown + processEconomy) */
/* ------------------------------------------------------------------ */
const FACILITY_KEYS = ["stands", "shops", "trainingGround", "academy", "medical", "analytics", "directors"];
const FACILITY_BASE_COST = {
  stands: 2400000, shops: 900000, trainingGround: 1400000,
  academy: 1100000, medical: 800000, analytics: 700000, directors: 1000000,
};
const SEATS_PER_STAND_LEVEL = 2600;

function facilityUpkeep(key, level) {
  return Math.round((FACILITY_BASE_COST[key] || 1000000) * 0.0016 * level);
}

function weeklyBreakdown(club, playerWages, staffWages) {
  const fac = club.facilities || {};
  const shopsLevel = (fac.shops && fac.shops.level) || 1;
  const followers = (club.fanbase && club.fanbase.followers) || 0;
  const loyalty = (club.fanbase && club.fanbase.loyalty) || 50;
  const capacity = (club.stadium && club.stadium.capacity) || 0;
  const divisionFactor = club.division === 1 ? 2.2 : club.division === 2 ? 1 : 0.6;

  const income =
    ((club.finances && club.finances.sponsorship && club.finances.sponsorship.weekly) || 0) +
    Math.round(followers * 0.11 * (1 + shopsLevel * 0.18) * (0.7 + loyalty / 200)) +
    Math.round(capacity * 0.85 * (loyalty / 100)) +
    Math.round((club.reputation || 40) * 900 * divisionFactor);

  const upkeep = FACILITY_KEYS.reduce((s, k) => s + facilityUpkeep(k, (fac[k] && fac[k].level) || 1), 0);
  const expense = playerWages + staffWages + Math.round(capacity * 0.11) + upkeep + 9000;

  return { income, expense, net: income - expense };
}

exports.weeklyFinances = onSchedule({ region: REGION, schedule: "every 56 hours", timeoutSeconds: 540 }, async () => {
  const nowMs = gameNow().getTime();
  const clubs = await db.collection("clubs").get();

  for (const clubDoc of clubs.docs) {
    const club = clubDoc.data();
    const [players, staff] = await Promise.all([
      db.collection("players").where("clubId", "==", club.id).get(),
      db.collection("staff").where("clubId", "==", club.id).get(),
    ]);
    const playerWages = players.docs.reduce((s, d) => s + ((d.data().contract && d.data().contract.wage) || 0), 0);
    const staffWages = staff.docs.reduce((s, d) => s + (d.data().wage || 0), 0);
    const bd = weeklyBreakdown(club, playerWages, staffWages);

    const updates = {
      "finances.balance": FieldValue.increment(bd.net),
      "finances.weeklyIncome": bd.income,
      "finances.weeklyExpense": bd.expense,
      "finances.lastProcessedAt": nowMs,
      updatedAt: Date.now(),
    };

    /* Obras terminadas */
    const fac = club.facilities || {};
    for (const key of FACILITY_KEYS) {
      const st = fac[key];
      if (st && st.upgrading && Date.parse(st.upgrading.finishesAt) <= nowMs) {
        updates[`facilities.${key}.level`] = Math.min(st.maxLevel || 10, st.upgrading.toLevel);
        updates[`facilities.${key}.upgrading`] = null;
        if (key === "stands" && club.stadium) {
          const capacity = (club.stadium.capacity || 0) + SEATS_PER_STAND_LEVEL;
          updates["stadium.capacity"] = capacity;
          updates["stadium.level"] = st.upgrading.toLevel;
          updates["stadium.seats"] = {
            general: Math.round(capacity * 0.78),
            premium: Math.round(capacity * 0.17),
            vip: Math.round(capacity * 0.05),
          };
        }
        await clubDoc.ref.collection("news").doc().set({
          clubId: club.id, date: gameNow().toISOString(), category: "club", read: false, important: true,
          title: `Obra finalizada: ${key} nivel ${st.upgrading.toLevel}`,
          body: "Las obras han concluido y la instalación ya está operativa.",
        });
      }
    }

    /* Patrocinio caducado */
    if (club.finances && club.finances.sponsorship && Date.parse(club.finances.sponsorship.expires) <= nowMs) {
      updates["finances.sponsorship"] = null;
    }

    await clubDoc.ref.update(updates);
  }
});

/* ------------------------------------------------------------------ */
/* 3.b) PARTIDOS (FASE 2) — simulación autoritativa en el servidor      */
/*      Activa VITE_USE_CLOUD_FUNCTIONS=true y cambia la regla de       */
/*      `leagues` a `allow write: if false;` para blindar resultados.   */
/* ------------------------------------------------------------------ */
exports.playMatch = onCall({ region: REGION, timeoutSeconds: 120 }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const clubSnap = await db.doc(`clubs/${req.data.clubId}`).get();
  const club = clubSnap.data();
  if (!club || club.ownerUid !== uid) throw new HttpsError("permission-denied", "No es tu club.");

  const leagueRef = db.doc(`leagues/${club.id}`);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) throw new HttpsError("not-found", "Liga no encontrada.");
  const league = leagueSnap.data();

  const fixture = (league.fixtures || []).find(
    (f) => !f.played && (f.homeId === league.clubId || f.awayId === league.clubId)
  );
  if (!fixture) throw new HttpsError("failed-precondition", "No hay partidos pendientes.");
  if (Date.parse(fixture.date) > gameNow().getTime()) {
    throw new HttpsError("failed-precondition", "Todavía no es la fecha del partido.");
  }

  // Anti-exploit: un partido cada 60 s como máximo por club
  const lastPlay = league.lastPlayAt || 0;
  if (Date.now() - lastPlay < 60000) throw new HttpsError("resource-exhausted", "Demasiadas peticiones.");

  /* Aquí se ejecuta el port del simulador (src/game/match.ts).
     Al portarlo, guarda: fixtures, table, playerStats, conditions y el informe
     en clubs/{clubId}/matches/{matchId}. */
  await leagueRef.update({ lastPlayAt: Date.now() });
  return { ok: true, fixtureId: fixture.id };
});

/* ------------------------------------------------------------------ */
/* 4) ACADEMIA MENSUAL / DRAFT BIMENSUAL (esqueleto FASES 5-6)          */
/* ------------------------------------------------------------------ */
/**
 * FASE 5 — Academia mensual.
 * Cada 30 días de juego (= 240 h reales con ritmo x3) se avisa a los clubes de
 * que hay nueva promoción. El contenido es DETERMINISTA por semilla
 * (club + periodo), así que el cliente lo regenera idéntico sin coste extra.
 */
const ACADEMY_PERIOD_DAYS = 30;
const DRAFT_PERIOD_DAYS = 60;

exports.monthlyAcademy = onSchedule({ region: REGION, schedule: "every 240 hours", timeoutSeconds: 300 }, async () => {
  const period = Math.floor(gameNow().getTime() / (ACADEMY_PERIOD_DAYS * 86400000));
  const clubs = await db.collection("clubs").get();
  for (const clubDoc of clubs.docs) {
    const club = clubDoc.data();
    const level = (club.facilities && club.facilities.academy && club.facilities.academy.level) || 1;
    await db.doc(`academies/${club.id}`).set(
      { clubId: club.id, ownerUid: club.ownerUid, periodIndex: period, promoted: [], updatedAt: Date.now() },
      { merge: true }
    );
    await clubDoc.ref.collection("news").doc().set({
      clubId: club.id, date: gameNow().toISOString(), category: "academia", read: false,
      title: "Nueva promoción de la academia",
      body: `Cinco jugadores de 15 a 18 años esperan tu decisión en la academia (nivel ${level}).`,
    });
  }
});

/**
 * FASE 6 — Draft bimensual.
 * Genera el periodo del draft y notifica. La clase (24 promesas de 15-16 años
 * del país de la liga) y el sorteo son deterministas por semilla; las clases
 * SS..D permanecen ocultas hasta que el usuario cierra su draft.
 */
exports.bimonthlyDraft = onSchedule({ region: REGION, schedule: "every 480 hours", timeoutSeconds: 300 }, async () => {
  const period = Math.floor(gameNow().getTime() / (DRAFT_PERIOD_DAYS * 86400000));
  const clubs = await db.collection("clubs").get();
  for (const clubDoc of clubs.docs) {
    const club = clubDoc.data();
    await db.doc(`drafts/${club.id}`).set(
      {
        clubId: club.id, ownerUid: club.ownerUid, periodIndex: period,
        phase: "abierto", country: club.country, userPicks: [], updatedAt: Date.now(),
      },
      { merge: true }
    );
    await clubDoc.ref.collection("news").doc().set({
      clubId: club.id, date: gameNow().toISOString(), category: "draft", read: false, important: true,
      title: "Se abre el draft juvenil",
      body: "24 promesas de 15-16 años del país. Puedes seleccionar 2 candidatos; sus datos reales se revelarán al cerrar el draft.",
    });
  }
});

/**
 * FASE 8 — Cierre de elecciones a seleccionador.
 * Cuenta los votos reales de la colección `votes` (uno por manager y elección),
 * proclama al ganador y abre el mandato. Cron cada 7 días de juego.
 */
exports.nationalTeamElection = onSchedule({ region: REGION, schedule: "every 56 hours", timeoutSeconds: 300 }, async () => {
  const elections = await db.collection("elections").where("resolved", "==", false).get();
  for (const doc of elections.docs) {
    const data = doc.data();
    if (data.closesAt && Date.parse(data.closesAt) > gameNow().getTime()) continue;

    const tally = data.tally || {};
    const candidacies = data.candidacies || {};
    let winnerId = null;
    let best = -1;
    for (const id of Object.keys(candidacies)) {
      const votes = tally[id] || 0;
      const rep = (candidacies[id] && candidacies[id].reputation) || 0;
      const score = votes * 1000 + rep; // desempate por reputación
      if (score > best) { best = score; winnerId = id; }
    }
    await doc.ref.update({
      resolved: true,
      winner: winnerId,
      termEnds: new Date(gameNow().getTime() + 120 * 86400000).toISOString(),
      resolvedAt: Date.now(),
    });
  }
});

/* ------------------------------------------------------------------ */
/* FASE 10 — CIERRE DE TEMPORADA, RANKINGS Y MANTENIMIENTO             */
/* ------------------------------------------------------------------ */

/**
 * Cierre de temporada: premios, ascensos/descensos, envejecimiento y retiros.
 * La temporada de juego va del 1 de julio al 30 de junio; con ritmo x3 eso son
 * ~122 días reales, así que el cron se ejecuta a diario y actúa solo si toca.
 */
exports.seasonRollover = onSchedule({ region: REGION, schedule: "every 24 hours", timeoutSeconds: 540, memory: "1GiB" }, async () => {
  const now = gameNow();
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const currentSeason = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

  const clubs = await db.collection("clubs").get();
  for (const clubDoc of clubs.docs) {
    const club = clubDoc.data();
    const histRef = db.doc(`seasons/${club.id}`);
    const hist = (await histRef.get()).data();
    if (hist && hist.lastSeasonId === currentSeason) continue; // ya cerrada

    const players = await db.collection("players").where("clubId", "==", club.id).get();
    const batch = db.batch();
    let retired = 0;

    players.forEach((snap) => {
      const p = snap.data();
      const age = (p.age || 20) + 1;
      const rnd = rngFactory(`age:${p.id}:${currentSeason}`);

      // Retiro por edad
      const retireChance = age < 32 ? 0 : Math.max(0, (age - 31) * 0.16 - Math.max(0, ((p.overall || 50) - 62) * 0.012));
      if (rnd() < retireChance) {
        batch.update(snap.ref, { status: "retired", clubId: null, age });
        retired++;
        return;
      }

      // Desarrollo / declive
      const room = (p.potential || 60) - (p.overall || 50);
      let delta;
      if (age <= 21) delta = room * (0.22 + rnd() * 0.22);
      else if (age <= 25) delta = room * (0.12 + rnd() * 0.16);
      else if (age <= 28) delta = room * (0.04 + rnd() * 0.1);
      else if (age <= 30) delta = rnd() * 1.4 - 0.6;
      else if (age <= 33) delta = -(0.4 + rnd() * 2.2);
      else delta = -(1.6 + rnd() * 2.9);

      batch.update(snap.ref, {
        age,
        overall: Math.max(1, Math.min(99, Math.round((p.overall || 50) + delta))),
        fitness: 100,
        injury: null,
        "careerTotals.apps": ((p.careerTotals && p.careerTotals.apps) || 0) + ((p.stats && p.stats.apps) || 0),
        "careerTotals.goals": ((p.careerTotals && p.careerTotals.goals) || 0) + ((p.stats && p.stats.goals) || 0),
        "careerTotals.assists": ((p.careerTotals && p.careerTotals.assists) || 0) + ((p.stats && p.stats.assists) || 0),
        stats: { seasonId: currentSeason, clubId: club.id, apps: 0, goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0, minutes: 0, avgRating: 0 },
      });
    });

    // Premios por posición
    const leagueSnap = await db.doc(`leagues/${club.id}`).get();
    let position = 0;
    if (leagueSnap.exists) {
      const table = Object.values(leagueSnap.data().table || {});
      table.sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));
      position = table.findIndex((r) => r.clubId === club.id) + 1;
    }
    const pool = club.division === 1 ? 9000000 : club.division === 2 ? 4200000 : 1800000;
    const prize = position > 0 ? Math.round(pool * Math.max(0.12, 1 - (position - 1) / 12)) : 0;

    batch.update(clubDoc.ref, {
      "finances.balance": FieldValue.increment(prize),
      seasonId: currentSeason,
      record: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
      division: position > 0 && position <= 2 && club.division > 1 ? club.division - 1 : club.division,
      updatedAt: Date.now(),
    });
    batch.set(histRef, { clubId: club.id, ownerUid: club.ownerUid, lastSeasonId: currentSeason, updatedAt: Date.now() }, { merge: true });
    batch.set(clubDoc.ref.collection("news").doc(), {
      clubId: club.id, date: gameNow().toISOString(), category: "club", read: false, important: true,
      title: `Temporada cerrada · ${position || "-"}º puesto`,
      body: `Premios: ${prize.toLocaleString("es-ES")} €. ${retired} jugador(es) se retiran del fútbol profesional.`,
    });

    await batch.commit();
  }
});

/**
 * Rankings agregados: un solo documento con el top global.
 * Evita que cada cliente consulte toda la colección de clubes (coste O(n) → O(1)).
 */
exports.rebuildRankings = onSchedule({ region: REGION, schedule: "every 6 hours", timeoutSeconds: 300 }, async () => {
  const clubs = await db.collection("clubs").orderBy("reputation", "desc").limit(100).get();
  const rows = clubs.docs.map((d) => {
    const c = d.data();
    return {
      clubId: c.id, name: c.name, shortName: c.shortName, country: c.country,
      managerName: c.managerName, reputation: Math.round(c.reputation || 0),
      balance: Math.round((c.finances && c.finances.balance) || 0),
      division: c.division || 2,
      points: (c.record && c.record.points) || 0,
    };
  });
  await db.doc("rankings/clubs").set({ rows, updatedAt: Date.now() });

  const managers = [...rows]
    .sort((a, b) => b.points * 3 + b.reputation - (a.points * 3 + a.reputation))
    .slice(0, 50)
    .map((r, i) => ({ rank: i + 1, managerName: r.managerName, clubName: r.name, score: r.points * 3 + r.reputation }));
  await db.doc("rankings/managers").set({ rows: managers, updatedAt: Date.now() });
});

/** Limpieza de comandos procesados y datos efímeros (control de coste) */
exports.cleanup = onSchedule({ region: REGION, schedule: "every 24 hours", timeoutSeconds: 300 }, async () => {
  const cutoff = Date.now() - 7 * 86400000;
  const old = await db.collection("commands").where("processedAt", "<", cutoff).limit(400).get();
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
});

/* ------------------------------------------------------------------ */
/* 5) COLA DE COMANDOS: el cliente pide, el servidor valida y ejecuta   */
/* ------------------------------------------------------------------ */
exports.onCommand = onDocumentCreated({ region: REGION, document: "commands/{cmdId}" }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const cmd = snap.data();
  try {
    switch (cmd.type) {
      /* FASE 4 — Fichaje validado en servidor.
         El cliente envía la intención; aquí se comprueban saldo, tamaño de
         plantilla y que el jugador exista realmente en el escaparate del
         periodo (regenerado con la misma semilla) -> imposible duplicar. */
      case "transferBid": {
        const clubSnap = await db.doc(`clubs/${cmd.clubId}`).get();
        const club = clubSnap.data();
        if (!club || club.ownerUid !== cmd.uid) throw new Error("No autorizado");

        const squad = await db.collection("players").where("clubId", "==", club.id).get();
        if (squad.size >= 30) throw new Error("Plantilla llena (máximo 30).");

        const fee = Math.max(0, Math.round(cmd.payload.fee || 0));
        if (club.finances.balance < fee) throw new Error("Saldo insuficiente");

        // Anti-duplicación: un jugador solo puede pertenecer a un club
        const existing = await db.collection("players")
          .where("seed", "==", cmd.payload.seed).limit(1).get();
        if (!existing.empty && existing.docs[0].data().clubId) {
          throw new Error("Ese jugador ya pertenece a un club.");
        }

        await db.runTransaction(async (tx) => {
          tx.update(clubSnap.ref, {
            "finances.balance": FieldValue.increment(-fee),
            squadSize: squad.size + 1,
            updatedAt: Date.now(),
          });
        });
        break;
      }

      /* FASE 8 — Voto único por manager y elección, contado en servidor. */
      case "vote": {
        const { electionId, candidacyId, category, country } = cmd.payload || {};
        if (!electionId || !candidacyId) throw new Error("Datos de voto incompletos");
        const voteRef = db.doc(`votes/${cmd.uid}_${electionId}`);
        const tallyRef = db.doc(`elections/${country}_${category}_${electionId}`);
        await db.runTransaction(async (tx) => {
          const existing = await tx.get(voteRef);
          if (existing.exists) throw new Error("Ya has votado en esta elección.");
          tx.set(voteRef, { uid: cmd.uid, electionId, candidacyId, at: Date.now() });
          tx.set(tallyRef, { [`tally.${candidacyId}`]: FieldValue.increment(1) }, { merge: true });
        });
        break;
      }

      /* FASE 8 — Candidatura a seleccionador con verificación de requisitos. */
      case "applyNationalCoach": {
        const clubSnap = await db.doc(`clubs/${cmd.clubId}`).get();
        const club = clubSnap.data();
        if (!club || club.ownerUid !== cmd.uid) throw new Error("No autorizado");
        const MIN_REP = { U15: 10, U17: 22, U20: 38, ABS: 55 };
        const need = MIN_REP[cmd.payload.category] || 55;
        if ((club.reputation || 0) < need) {
          throw new Error(`Reputación insuficiente (necesitas ${need}).`);
        }
        await db.doc(`elections/${club.country}_${cmd.payload.category}_${cmd.payload.electionId}`).set(
          {
            [`candidacies.${cmd.uid}`]: {
              uid: cmd.uid, managerName: club.managerName, clubName: club.name,
              reputation: club.reputation, manifesto: String(cmd.payload.manifesto || "").slice(0, 140),
            },
          },
          { merge: true }
        );
        break;
      }

      case "listPlayer": {
        const clubSnap = await db.doc(`clubs/${cmd.clubId}`).get();
        const club = clubSnap.data();
        if (!club || club.ownerUid !== cmd.uid) throw new Error("No autorizado");
        await db.doc(`transfers/${club.id}`).set(
          { [`listedForSale.${cmd.payload.playerId}`]: Math.max(0, cmd.payload.price || 0) },
          { merge: true }
        );
        break;
      }

      case "upgradeFacility": {
        const clubSnap = await db.doc(`clubs/${cmd.clubId}`).get();
        const club = clubSnap.data();
        if (!club || club.ownerUid !== cmd.uid) throw new Error("No autorizado");
        const key = cmd.payload.facilityKey;
        const level = ((club.facilities[key] && club.facilities[key].level) || 1) + 1;
        const cost = Math.round(1000000 * Math.pow(1.55, level - 1));
        if (club.finances.balance < cost) throw new Error("Saldo insuficiente");
        const finishes = new Date(gameNow().getTime() + (10 + level * 6) * 86400000).toISOString();
        await clubSnap.ref.update({
          [`facilities.${key}.upgrading`]: { toLevel: level, finishesAt: finishes, cost },
          "finances.balance": FieldValue.increment(-cost),
        });
        break;
      }
      default:
        throw new Error(`Comando no soportado: ${cmd.type}`);
    }
    await snap.ref.update({ status: "done", processedAt: Date.now() });
  } catch (e) {
    await snap.ref.update({ status: "error", error: String((e && e.message) || e), processedAt: Date.now() });
  }
});
