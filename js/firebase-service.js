/**
 * firebase-service.js
 * ────────────────────
 * Fetches Firebase config from /api/config (Vercel serverless function),
 * then initialises Firebase. This is the correct pattern for plain static
 * HTML on Vercel — no build tool, no placeholder substitution needed.
 */

const FirebaseService = (() => {

  let db = null;
  let _unsubscribers = [];

  /* ─── Initialise ─────────────────────────────────────── */
  async function init() {
    try {
      // Fetch credentials from our Vercel API route
      const res = await fetch('/api/config');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.hint || 'Failed to load Firebase config from /api/config');
      }
      const config = await res.json();

      if (!config.projectId) {
        throw new Error('FIREBASE_PROJECT_ID is not set in Vercel Environment Variables.');
      }

      firebase.initializeApp(config);
      db = firebase.firestore();

      // Enable offline persistence
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[Firebase] Persistence: multiple tabs open.');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firebase] Persistence not supported in this browser.');
        }
      });

      console.info('[Firebase] Initialised with project:', config.projectId);
      return true;
    } catch (e) {
      console.error('[Firebase] Init failed:', e.message);
      showToast('Firebase connection failed: ' + e.message, 'error', 8000);
      return false;
    }
  }

  /* ─── Helpers ─────────────────────────────────────────── */
  function gamesRef()           { return db.collection('games'); }
  function gameRef(id)          { return gamesRef().doc(id); }
  function playersRef(id)       { return gameRef(id).collection('players'); }
  function playerRef(gid, pid)  { return playersRef(gid).doc(pid); }
  function roundsRef(id)        { return gameRef(id).collection('rounds'); }
  function roundRef(gid, round) { return roundsRef(gid).doc(String(round)); }

  function generateCode(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /* ─── Create Game ─────────────────────────────────────── */
  async function createGame({ name, startingBal, pin }) {
    const sessionId = generateCode(6);
    await gameRef(sessionId).set({
      name:          name || 'Blackjack Table',
      pin:           pin  || '',
      startingBal,
      bankerBalance: startingBal,
      currentRound:  1,
      phase:         'lobby',
      createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { sessionId, name, startingBal, bankerBalance: startingBal, currentRound: 1, phase: 'lobby' };
  }

  /* ─── Get Game ────────────────────────────────────────── */
  async function getGame(sessionId) {
    const snap = await gameRef(sessionId.toUpperCase()).get();
    if (!snap.exists) return null;
    return { sessionId: snap.id, ...snap.data() };
  }

  /* ─── Listen to Game ──────────────────────────────────── */
  function listenGame(sessionId, callback) {
    const unsub = gameRef(sessionId).onSnapshot(snap => {
      if (!snap.exists) { callback(null); return; }
      callback({ sessionId: snap.id, ...snap.data() });
    }, err => console.error('[Firebase] listenGame error:', err));
    _unsubscribers.push(unsub);
    return unsub;
  }

  /* ─── Listen to Players ───────────────────────────────── */
  function listenPlayers(sessionId, callback) {
    const unsub = playersRef(sessionId).onSnapshot(snap => {
      const players = {};
      snap.forEach(doc => { players[doc.id] = { id: doc.id, ...doc.data() }; });
      callback(players);
    }, err => console.error('[Firebase] listenPlayers error:', err));
    _unsubscribers.push(unsub);
    return unsub;
  }

  /* ─── Join Game ───────────────────────────────────────── */
  async function joinGame(sessionId, { name }) {
    const game = await getGame(sessionId);
    if (!game) throw new Error('Game not found');
    const playersSnap = await playersRef(sessionId).get();
    if (playersSnap.size >= 4) throw new Error('Table is full (max 4 players)');
    const playerId = generateCode(8);
    await playerRef(sessionId, playerId).set({
      name,
      balance:  game.startingBal,
      bet:      Math.min(100, Math.floor(game.startingBal * 0.1)),
      betReady: false,
      outcome:  null,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    localStorage.setItem('bj_playerId', playerId);
    localStorage.setItem('bj_sessionId', sessionId);
    return { playerId, game };
  }

  /* ─── Start Game ──────────────────────────────────────── */
  async function startGame(sessionId) {
    await gameRef(sessionId).update({ phase: 'betting' });
  }

  /* ─── Place Bet ───────────────────────────────────────── */
  async function placeBet(sessionId, playerId, betAmount) {
    await playerRef(sessionId, playerId).update({ bet: betAmount, betReady: true, outcome: null });
  }

  /* ─── Go To Resolve ───────────────────────────────────── */
  async function goToResolve(sessionId) {
    await gameRef(sessionId).update({ phase: 'resolving' });
  }

  /* ─── Resolve Round ───────────────────────────────────── */
  async function resolveRound(sessionId, outcomes) {
    const gameSnap = await gameRef(sessionId).get();
    const game = gameSnap.data();
    const batch = db.batch();
    let bankerDelta = 0;
    const roundEntries = [];

    for (const [pid, { outcome, delta, name, bet }] of Object.entries(outcomes)) {
      const pRef = playerRef(sessionId, pid);
      const pSnap = await pRef.get();
      const newBal = Math.max(0, pSnap.data().balance + delta);
      batch.update(pRef, { balance: newBal, outcome, bet, betReady: false });
      bankerDelta -= delta;
      roundEntries.push({ playerId: pid, name, bet, outcome, delta, newBalance: newBal });
    }

    batch.update(gameRef(sessionId), {
      bankerBalance: game.bankerBalance + bankerDelta,
      phase: 'summary',
    });
    batch.set(roundRef(sessionId, game.currentRound), {
      round: game.currentRound,
      entries: roundEntries,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return { newBankerBal: game.bankerBalance + bankerDelta, roundEntries };
  }

  /* ─── Next Round ──────────────────────────────────────── */
  async function nextRound(sessionId) {
    const snap = await gameRef(sessionId).get();
    const { currentRound } = snap.data();
    await gameRef(sessionId).update({ currentRound: currentRound + 1, phase: 'betting' });
    const playersSnap = await playersRef(sessionId).get();
    const batch = db.batch();
    playersSnap.forEach(doc => batch.update(doc.ref, { betReady: false, outcome: null }));
    await batch.commit();
  }

  /* ─── End Game ────────────────────────────────────────── */
  async function endGame(sessionId) {
    await gameRef(sessionId).update({ phase: 'ended' });
  }

  /* ─── Get Round History ───────────────────────────────── */
  async function getRoundHistory(sessionId) {
    const snap = await roundsRef(sessionId).orderBy('round', 'asc').limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /* ─── Cleanup ─────────────────────────────────────────── */
  function cleanup() {
    _unsubscribers.forEach(fn => fn());
    _unsubscribers = [];
  }

  return {
    init, createGame, getGame, listenGame, listenPlayers,
    joinGame, startGame, placeBet, goToResolve, resolveRound,
    nextRound, endGame, getRoundHistory, cleanup, generateCode,
  };

})();
