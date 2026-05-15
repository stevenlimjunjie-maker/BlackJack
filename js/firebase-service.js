/**
 * firebase-service.js
 * ───────────────────
 * Thin wrapper around Firestore. All database reads/writes
 * go through this module — the rest of the app never touches
 * the Firebase SDK directly. This makes swapping backends easy.
 *
 * Data model (Firestore):
 *
 *   games/{sessionId}
 *     ├─ name          (string)
 *     ├─ pin           (string | "")
 *     ├─ startingBal   (number)
 *     ├─ bankerBalance (number)
 *     ├─ currentRound  (number)
 *     ├─ phase         ("lobby" | "betting" | "resolving" | "summary" | "ended")
 *     ├─ createdAt     (Timestamp)
 *     └─ players/      (subcollection)
 *          └─ {playerId}
 *               ├─ name       (string)
 *               ├─ balance    (number)
 *               ├─ bet        (number)
 *               ├─ betReady   (boolean)
 *               └─ outcome    (string | null)
 *
 *   games/{sessionId}/rounds/{roundNumber}
 *     └─ entries[]  [{playerId, name, bet, outcome, delta}]
 */

const FirebaseService = (() => {

  let db = null;
  let _unsubscribers = [];

  /* ─── Initialise ───────────────────────────────────── */
  function init() {
    if (APP_CONFIG.DEMO_MODE) {
      console.info('[Firebase] Demo mode — using localStorage only.');
      return;
    }
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      // Enable offline persistence for graceful handling
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[Firebase] Persistence: multiple tabs open.');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firebase] Persistence not supported in this browser.');
        }
      });
      console.info('[Firebase] Initialised.');
    } catch (e) {
      console.error('[Firebase] Init failed:', e);
      showToast('Firebase connection failed. Check config.js', 'error');
    }
  }

  /* ─── Helpers ──────────────────────────────────────── */
  function gamesRef()              { return db.collection('games'); }
  function gameRef(id)             { return gamesRef().doc(id); }
  function playersRef(id)          { return gameRef(id).collection('players'); }
  function playerRef(gid, pid)     { return playersRef(gid).doc(pid); }
  function roundsRef(id)           { return gameRef(id).collection('rounds'); }
  function roundRef(gid, round)    { return roundsRef(gid).doc(String(round)); }

  /* Generate a random N-letter uppercase code */
  function generateCode(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusables
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /* ─── Create Game ──────────────────────────────────── */
  async function createGame({ name, startingBal, pin }) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.createGame({ name, startingBal, pin });

    const sessionId = generateCode(APP_CONFIG.SESSION_CODE_LENGTH);
    const gameData = {
      name:          name || 'Blackjack Table',
      pin:           pin  || '',
      startingBal:   startingBal,
      bankerBalance: startingBal,
      currentRound:  1,
      phase:         'lobby',
      createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
    };
    await gameRef(sessionId).set(gameData);
    return { sessionId, ...gameData };
  }

  /* ─── Get Game (one-time) ──────────────────────────── */
  async function getGame(sessionId) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.getGame(sessionId);
    const snap = await gameRef(sessionId.toUpperCase()).get();
    if (!snap.exists) return null;
    return { sessionId: snap.id, ...snap.data() };
  }

  /* ─── Listen to Game (realtime) ────────────────────── */
  function listenGame(sessionId, callback) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.listenGame(sessionId, callback);
    const unsub = gameRef(sessionId).onSnapshot(snap => {
      if (!snap.exists) { callback(null); return; }
      callback({ sessionId: snap.id, ...snap.data() });
    }, err => console.error('[Firebase] listenGame error:', err));
    _unsubscribers.push(unsub);
    return unsub;
  }

  /* ─── Listen to Players (realtime) ─────────────────── */
  function listenPlayers(sessionId, callback) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.listenPlayers(sessionId, callback);
    const unsub = playersRef(sessionId).onSnapshot(snap => {
      const players = {};
      snap.forEach(doc => { players[doc.id] = { id: doc.id, ...doc.data() }; });
      callback(players);
    }, err => console.error('[Firebase] listenPlayers error:', err));
    _unsubscribers.push(unsub);
    return unsub;
  }

  /* ─── Join Game ────────────────────────────────────── */
  async function joinGame(sessionId, { name }) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.joinGame(sessionId, { name });
    const game = await getGame(sessionId);
    if (!game) throw new Error('Game not found');

    // Count current players
    const playersSnap = await playersRef(sessionId).get();
    if (playersSnap.size >= APP_CONFIG.MAX_PLAYERS) throw new Error('Table is full (max 4 players)');

    const playerId = generateCode(8);
    await playerRef(sessionId, playerId).set({
      name,
      balance:  game.startingBal,
      bet:      Math.min(100, Math.floor(game.startingBal * 0.1)),
      betReady: false,
      outcome:  null,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Store locally so this device knows "who it is"
    localStorage.setItem('bj_playerId', playerId);
    localStorage.setItem('bj_sessionId', sessionId);
    return { playerId, game };
  }

  /* ─── Start Game ────────────────────────────────────── */
  async function startGame(sessionId) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.startGame(sessionId);
    await gameRef(sessionId).update({ phase: 'betting' });
  }

  /* ─── Player Places Bet ─────────────────────────────── */
  async function placeBet(sessionId, playerId, betAmount) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.placeBet(sessionId, playerId, betAmount);
    await playerRef(sessionId, playerId).update({
      bet: betAmount,
      betReady: true,
      outcome: null,
    });
  }

  /* ─── Move to Resolve Phase ─────────────────────────── */
  async function goToResolve(sessionId) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.goToResolve(sessionId);
    await gameRef(sessionId).update({ phase: 'resolving' });
  }

  /* ─── Confirm Round Results ─────────────────────────── */
  async function resolveRound(sessionId, outcomes) {
    /**
     * outcomes: { [playerId]: { outcome, delta } }
     * outcome values: 'win' | 'bj' | 'loss' | 'push' | 'dd-win' | 'dd-loss'
     */
    if (APP_CONFIG.DEMO_MODE) return DemoService.resolveRound(sessionId, outcomes);

    const gameSnap = await gameRef(sessionId).get();
    const game = gameSnap.data();

    const batch = db.batch();
    let bankerDelta = 0;

    const roundEntries = [];

    for (const [pid, { outcome, delta, name, bet }] of Object.entries(outcomes)) {
      const pRef = playerRef(sessionId, pid);
      const pSnap = await pRef.get();
      const currentBal = pSnap.data().balance;
      const newBal = Math.max(0, currentBal + delta); // can't go below 0
      batch.update(pRef, { balance: newBal, outcome, bet, betReady: false });
      bankerDelta -= delta; // zero sum
      roundEntries.push({ playerId: pid, name, bet, outcome, delta, newBalance: newBal });
    }

    const newBankerBal = game.bankerBalance + bankerDelta;
    batch.update(gameRef(sessionId), {
      bankerBalance: newBankerBal,
      phase: 'summary',
    });

    // Save round record
    const rRef = roundRef(sessionId, game.currentRound);
    batch.set(rRef, {
      round:     game.currentRound,
      entries:   roundEntries,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return { newBankerBal, roundEntries };
  }

  /* ─── Advance to Next Round ─────────────────────────── */
  async function nextRound(sessionId) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.nextRound(sessionId);
    const snap = await gameRef(sessionId).get();
    const { currentRound } = snap.data();
    await gameRef(sessionId).update({
      currentRound: currentRound + 1,
      phase: 'betting',
    });
    // Reset all players' betReady
    const playersSnap = await playersRef(sessionId).get();
    const batch = db.batch();
    playersSnap.forEach(doc => {
      batch.update(doc.ref, { betReady: false, outcome: null });
    });
    await batch.commit();
  }

  /* ─── End Game ──────────────────────────────────────── */
  async function endGame(sessionId) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.endGame(sessionId);
    await gameRef(sessionId).update({ phase: 'ended' });
  }

  /* ─── Get Round History ─────────────────────────────── */
  async function getRoundHistory(sessionId) {
    if (APP_CONFIG.DEMO_MODE) return DemoService.getRoundHistory(sessionId);
    const snap = await roundsRef(sessionId)
      .orderBy('round', 'asc')
      .limit(APP_CONFIG.ROUND_HISTORY_LIMIT)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /* ─── Unsubscribe all listeners ─────────────────────── */
  function cleanup() {
    _unsubscribers.forEach(fn => fn());
    _unsubscribers = [];
  }

  /* ─── Update Banker Balance Sync ────────────────────── */
  async function updateBankerBalance(sessionId, amount) {
    if (APP_CONFIG.DEMO_MODE) return;
    await gameRef(sessionId).update({ bankerBalance: amount });
  }

  return {
    init, createGame, getGame, listenGame, listenPlayers,
    joinGame, startGame, placeBet, goToResolve, resolveRound,
    nextRound, endGame, getRoundHistory, cleanup,
    generateCode,
  };

})();


/* ═══════════════════════════════════════════════════════
   DEMO SERVICE — localStorage fallback
   Simulates Firestore with in-memory + localStorage store.
   Used when APP_CONFIG.DEMO_MODE = true OR when Firebase
   is not configured. Real-time "sync" uses polling via
   BroadcastChannel (works in same-browser tabs).
   ═══════════════════════════════════════════════════════ */
const DemoService = (() => {
  const store = {}; // in-memory
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bj_demo') : null;
  const listeners = {};

  function save(sessionId) {
    try { localStorage.setItem('bj_demo_' + sessionId, JSON.stringify(store[sessionId])); } catch(e) {}
    if (channel) channel.postMessage({ type: 'update', sessionId });
  }
  function load(sessionId) {
    if (store[sessionId]) return store[sessionId];
    try {
      const raw = localStorage.getItem('bj_demo_' + sessionId);
      if (raw) store[sessionId] = JSON.parse(raw);
    } catch(e) {}
    return store[sessionId] || null;
  }

  if (channel) {
    channel.onmessage = (e) => {
      if (e.data.type === 'update') {
        const { sessionId } = e.data;
        store[sessionId] = null; // invalidate
        const game = load(sessionId);
        if (listeners[sessionId]) {
          listeners[sessionId].game?.forEach(cb => cb(game));
          listeners[sessionId].players?.forEach(cb => cb(game?.players || {}));
        }
      }
    };
  }

  function generateCode(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  function notify(sessionId) {
    save(sessionId);
    const game = load(sessionId);
    if (listeners[sessionId]) {
      listeners[sessionId].game?.forEach(cb => cb(game));
      listeners[sessionId].players?.forEach(cb => cb(game?.players || {}));
    }
  }

  return {
    createGame({ name, startingBal, pin }) {
      const sessionId = generateCode(6);
      store[sessionId] = {
        name, pin: pin || '', startingBal, bankerBalance: startingBal,
        currentRound: 1, phase: 'lobby', players: {}, rounds: {},
      };
      save(sessionId);
      return { sessionId, ...store[sessionId] };
    },
    getGame(sessionId) { return load(sessionId); },
    listenGame(sessionId, callback) {
      if (!listeners[sessionId]) listeners[sessionId] = {};
      if (!listeners[sessionId].game) listeners[sessionId].game = [];
      listeners[sessionId].game.push(callback);
      callback(load(sessionId));
      return () => {};
    },
    listenPlayers(sessionId, callback) {
      if (!listeners[sessionId]) listeners[sessionId] = {};
      if (!listeners[sessionId].players) listeners[sessionId].players = [];
      listeners[sessionId].players.push(callback);
      const game = load(sessionId);
      callback(game?.players || {});
      return () => {};
    },
    joinGame(sessionId, { name }) {
      const game = load(sessionId);
      if (!game) throw new Error('Game not found');
      const playerId = generateCode(8);
      game.players[playerId] = {
        id: playerId, name, balance: game.startingBal,
        bet: Math.min(100, Math.floor(game.startingBal * 0.1)),
        betReady: false, outcome: null,
      };
      localStorage.setItem('bj_playerId', playerId);
      localStorage.setItem('bj_sessionId', sessionId);
      notify(sessionId);
      return { playerId, game };
    },
    startGame(sessionId) {
      const game = load(sessionId); game.phase = 'betting'; notify(sessionId);
    },
    placeBet(sessionId, playerId, betAmount) {
      const game = load(sessionId);
      game.players[playerId].bet = betAmount;
      game.players[playerId].betReady = true;
      game.players[playerId].outcome = null;
      notify(sessionId);
    },
    goToResolve(sessionId) {
      const game = load(sessionId); game.phase = 'resolving'; notify(sessionId);
    },
    resolveRound(sessionId, outcomes) {
      const game = load(sessionId);
      let bankerDelta = 0;
      const roundEntries = [];
      for (const [pid, { outcome, delta, name, bet }] of Object.entries(outcomes)) {
        const p = game.players[pid];
        p.balance = Math.max(0, p.balance + delta);
        p.outcome = outcome; p.betReady = false;
        bankerDelta -= delta;
        roundEntries.push({ playerId: pid, name, bet, outcome, delta, newBalance: p.balance });
      }
      game.bankerBalance += bankerDelta;
      game.phase = 'summary';
      game.rounds = game.rounds || {};
      game.rounds[game.currentRound] = { round: game.currentRound, entries: roundEntries };
      notify(sessionId);
      return { newBankerBal: game.bankerBalance, roundEntries };
    },
    nextRound(sessionId) {
      const game = load(sessionId);
      game.currentRound++;
      game.phase = 'betting';
      Object.values(game.players).forEach(p => { p.betReady = false; p.outcome = null; });
      notify(sessionId);
    },
    endGame(sessionId) {
      const game = load(sessionId); game.phase = 'ended'; notify(sessionId);
    },
    getRoundHistory(sessionId) {
      const game = load(sessionId);
      return Object.values(game?.rounds || {}).sort((a, b) => a.round - b.round);
    },
    cleanup() {},
    generateCode,
  };
})();
