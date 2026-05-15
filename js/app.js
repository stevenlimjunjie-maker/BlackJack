/**
 * app.js
 * ──────
 * Main application controller. Orchestrates:
 *   - Screen navigation
 *   - Banker (host) flow
 *   - Player flow
 *   - Real-time listener management
 *   - URL-based deep linking (share game URL → auto-join)
 */

const App = (() => {

  /* ─── App State ─────────────────────────────────────── */
  let state = {
    role:        null,      // 'banker' | 'player'
    sessionId:   null,
    playerId:    null,
    game:        null,
    players:     {},
    prevBals:    {},        // to compute deltas
    selectedOutcomes: {},   // {[playerId]: outcome}
    joinedSessionId: null,  // temp during join flow
  };

  /* ─── Deep Link Handling ─────────────────────────────── */
  function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const sessionCode = params.get('g');
    if (sessionCode) {
      // Pre-fill join form and switch to join screen
      state.joinedSessionId = sessionCode.toUpperCase();
      UI.showScreen('join');
      showJoinTab('code');
      const inp = document.getElementById('join-session-code');
      if (inp) inp.value = state.joinedSessionId;
      setTimeout(() => findGame(state.joinedSessionId), 300);
    }
  }

  /* ─── Initialise Firebase ────────────────────────────── */
  function init() {
    FirebaseService.init();
    bindEvents();
    handleDeepLink();
  }

  /* ─── Build Game Share URL ───────────────────────────── */
  function buildGameUrl(sessionId) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?g=${sessionId}`;
  }

  /* ═══════════════════════════════════════════════════
     BANKER FLOW
  ═══════════════════════════════════════════════════ */

  async function createGame() {
    const name       = document.getElementById('game-name').value.trim() || 'Blackjack Table';
    const balance    = parseInt(document.getElementById('starting-balance').value) || APP_CONFIG.DEFAULT_BALANCE;
    const pin        = document.getElementById('game-pin').value.trim();

    UI.showLoading('Creating table...');
    try {
      const result = await FirebaseService.createGame({
        name, startingBal: balance, pin,
      });
      state.role      = 'banker';
      state.sessionId = result.sessionId;
      state.game      = result;

      // Store banker identity
      localStorage.setItem('bj_sessionId', result.sessionId);
      localStorage.setItem('bj_role',      'banker');

      // Update QR screen
      document.getElementById('qr-game-name-display').textContent = name;
      document.getElementById('qr-session-id-display').textContent = result.sessionId;
      const pinBadge = document.getElementById('qr-pin-display');
      if (pin) {
        pinBadge.textContent = `PIN: ${pin}`;
        pinBadge.style.display = 'inline-block';
      }
      const url = buildGameUrl(result.sessionId);
      document.getElementById('qr-share-url').textContent = url;
      UI.generateQR('qr-code-display', url, 220);

      // Subscribe to player updates
      FirebaseService.listenPlayers(result.sessionId, onPlayersUpdate);
      FirebaseService.listenGame(result.sessionId, onGameUpdate);

      UI.showScreen('host-qr');
    } catch(e) {
      UI.showToast('Failed to create game: ' + e.message, 'error');
    } finally {
      UI.hideLoading();
    }
  }

  async function startGame() {
    const playerCount = Object.keys(state.players).length;
    if (playerCount === 0) {
      UI.showToast('No players have joined yet!', 'error');
      return;
    }
    UI.showLoading('Starting game...');
    try {
      await FirebaseService.startGame(state.sessionId);
    } catch(e) {
      UI.showToast('Error: ' + e.message, 'error');
    } finally {
      UI.hideLoading();
    }
  }

  function onPlayersUpdate(players) {
    state.players = players || {};
    const count = Object.keys(state.players).length;

    // Update waiting list (QR screen)
    const waitingList = document.getElementById('waiting-players-list');
    const countBadge  = document.getElementById('player-count-badge');
    const startBtn    = document.getElementById('btn-start-game-from-qr');
    const hint        = document.getElementById('waiting-hint');
    if (waitingList) {
      waitingList.innerHTML = Object.values(state.players)
        .map(p => UI.buildWaitingChip(p)).join('');
      countBadge.textContent = `${count}/${APP_CONFIG.MAX_PLAYERS}`;
      if (startBtn) startBtn.disabled = count === 0;
      if (hint) hint.style.display = count > 0 ? 'none' : 'block';
    }

    // Update dashboard (game running)
    if (state.role === 'banker' && document.getElementById('screen-banker-dashboard').classList.contains('active')) {
      renderBankerDashboard();
    }
  }

  function onGameUpdate(game) {
    if (!game) return;
    state.game = game;

    if (state.role === 'banker') {
      handleBankerGameUpdate(game);
    } else if (state.role === 'player') {
      handlePlayerGameUpdate(game);
    }
  }

  function handleBankerGameUpdate(game) {
    if (game.phase === 'betting' || game.phase === 'resolving' || game.phase === 'summary') {
      // Switch from QR screen to dashboard if not already there
      if (!document.getElementById('screen-banker-dashboard').classList.contains('active')) {
        UI.showScreen('banker-dashboard');
      }
      renderBankerDashboard();
    } else if (game.phase === 'ended') {
      showFinalScreen();
    }
  }

  function renderBankerDashboard() {
    const game    = state.game;
    const players = state.players;
    if (!game) return;

    document.getElementById('dash-round-num').textContent    = game.currentRound;
    document.getElementById('dash-game-name').textContent    = game.name;
    document.getElementById('dash-banker-balance').textContent = UI.formatMoney(game.bankerBalance);

    // Player balance rows
    document.getElementById('dash-players-list').innerHTML =
      Object.values(players).map(p => UI.buildPlayerBalanceRow(p, state.prevBals[p.id])).join('');

    // Phase panels
    document.querySelectorAll('.phase-panel').forEach(el => el.classList.remove('active'));

    if (game.phase === 'betting') {
      document.getElementById('phase-betting').classList.add('active');
      document.getElementById('bets-status-list').innerHTML =
        Object.values(players).map(p => UI.buildBetStatusRow(p)).join('');

    } else if (game.phase === 'resolving') {
      document.getElementById('phase-resolve').classList.add('active');
      document.getElementById('resolve-round-num').textContent = game.currentRound;
      document.getElementById('resolve-players-list').innerHTML =
        Object.values(players).map(p => UI.buildResolveRow(p)).join('');
      // Re-bind outcome buttons
      bindOutcomeButtons();
      // Restore previously selected outcomes
      restoreSelectedOutcomes();

    } else if (game.phase === 'summary') {
      document.getElementById('phase-summary').classList.add('active');
      document.getElementById('summary-round-num').textContent = game.currentRound;
      // Build summary from last round selections
      const rows = Object.values(players).map(p => UI.buildSummaryRow({
        name:    p.name,
        outcome: p.outcome || 'push',
        delta:   GameLogic.calculateDelta(p.outcome || 'push', p.bet || 0),
      }));
      document.getElementById('summary-results-list').innerHTML = rows.join('');
    }
  }

  function bindOutcomeButtons() {
    document.querySelectorAll('.outcome-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid     = btn.dataset.pid;
        const outcome = btn.dataset.outcome;
        // Deselect siblings
        document.querySelectorAll(`.outcome-btn[data-pid="${pid}"]`).forEach(b => {
          b.className = 'outcome-btn';
        });
        btn.classList.add(`selected-${outcome}`);
        state.selectedOutcomes[pid] = outcome;
        UI.playTone('click');
      });
    });
  }

  function restoreSelectedOutcomes() {
    for (const [pid, outcome] of Object.entries(state.selectedOutcomes)) {
      const btn = document.querySelector(`.outcome-btn[data-pid="${pid}"][data-outcome="${outcome}"]`);
      if (btn) btn.classList.add(`selected-${outcome}`);
    }
  }

  async function goResolve() {
    UI.showLoading('Moving to resolve...');
    try {
      await FirebaseService.goToResolve(state.sessionId);
      state.selectedOutcomes = {}; // reset
    } finally {
      UI.hideLoading();
    }
  }

  async function confirmResolve() {
    const players = state.players;
    const missing = Object.values(players).filter(p => !state.selectedOutcomes[p.id]);
    if (missing.length > 0) {
      UI.showToast(`Select outcome for: ${missing.map(p => p.name).join(', ')}`, 'error');
      return;
    }

    // Build outcomes map
    const outcomes = {};
    for (const p of Object.values(players)) {
      const outcome = state.selectedOutcomes[p.id];
      const delta   = GameLogic.calculateDelta(outcome, p.bet || 0);
      outcomes[p.id] = { outcome, delta, name: p.name, bet: p.bet || 0 };
    }

    // Save previous balances for delta display
    for (const p of Object.values(players)) {
      state.prevBals[p.id] = p.balance;
    }

    UI.showLoading('Saving results...');
    try {
      await FirebaseService.resolveRound(state.sessionId, outcomes);
      state.selectedOutcomes = {};
      // Fire confetti for big wins
      const anyBJ     = Object.values(outcomes).some(o => o.outcome === 'bj');
      const anyTriple = Object.values(outcomes).some(o => o.outcome === 'triple');
      const anyWin    = Object.values(outcomes).some(o => ['win','bj','dd-win','triple'].includes(o.outcome));
      if (anyTriple) UI.fireConfetti('bj');      // big gold burst for triple
      else if (anyBJ) UI.fireConfetti('bj');
      else if (anyWin) UI.fireConfetti('win');
    } catch(e) {
      UI.showToast('Error saving: ' + e.message, 'error');
    } finally {
      UI.hideLoading();
    }
  }

  async function nextRound() {
    UI.showLoading('Next round...');
    try {
      await FirebaseService.nextRound(state.sessionId);
    } finally {
      UI.hideLoading();
    }
  }

  async function endGame() {
    if (!confirm('End the game and show final results?')) return;
    UI.showLoading('Ending game...');
    try {
      await FirebaseService.endGame(state.sessionId);
    } finally {
      UI.hideLoading();
    }
  }

  /* ═══════════════════════════════════════════════════
     PLAYER FLOW
  ═══════════════════════════════════════════════════ */

  function showJoinTab(tab) {
    document.querySelectorAll('.join-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.join-tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.join-tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`join-tab-${tab}`).classList.add('active');
    if (tab === 'scan') {
      UI.startQRScanner(handleQRScan);
    } else {
      UI.stopQRScanner();
    }
  }

  function handleQRScan(text) {
    // Text is a URL: parse out ?g=SESSIONCODE
    try {
      const url    = new URL(text);
      const code   = url.searchParams.get('g');
      if (code) {
        state.joinedSessionId = code.toUpperCase();
        findGame(state.joinedSessionId);
      } else {
        UI.showToast('Invalid QR code', 'error');
      }
    } catch(e) {
      // Maybe it's just a raw session code
      if (text.length === APP_CONFIG.SESSION_CODE_LENGTH) {
        state.joinedSessionId = text.toUpperCase();
        findGame(state.joinedSessionId);
      } else {
        UI.showToast('Could not read QR code', 'error');
      }
    }
  }

  async function findGame(sessionId) {
    if (!sessionId) {
      sessionId = document.getElementById('join-session-code').value.trim().toUpperCase();
    }
    if (sessionId.length !== APP_CONFIG.SESSION_CODE_LENGTH) {
      UI.showToast(`Enter a ${APP_CONFIG.SESSION_CODE_LENGTH}-letter code`, 'error');
      return;
    }
    UI.showLoading('Finding table...');
    try {
      const game = await FirebaseService.getGame(sessionId);
      if (!game) {
        UI.showToast('Table not found. Check the code.', 'error');
        return;
      }
      if (game.phase === 'ended') {
        UI.showToast('That game has already ended.', 'error');
        return;
      }
      state.joinedSessionId = sessionId;
      state.game = game;

      // Show PIN if required
      const pinSection  = document.getElementById('join-pin-section');
      if (game.pin) {
        pinSection.style.display = 'block';
      }

      document.getElementById('game-found-banner').textContent = `🃏 Found: ${game.name}`;
      document.getElementById('join-name-section').style.display = 'block';
      document.getElementById('join-nickname').focus();

    } catch(e) {
      UI.showToast('Error: ' + e.message, 'error');
    } finally {
      UI.hideLoading();
    }
  }

  async function confirmJoin() {
    const nickname = document.getElementById('join-nickname').value.trim();
    if (!nickname) { UI.showToast('Enter your nickname', 'error'); return; }

    // Validate PIN if required
    if (state.game?.pin) {
      const enteredPin = document.getElementById('join-pin-input').value.trim();
      if (enteredPin !== state.game.pin) {
        UI.showToast('Incorrect PIN', 'error');
        return;
      }
    }

    UI.showLoading('Joining table...');
    try {
      const result = await FirebaseService.joinGame(state.joinedSessionId, { name: nickname });
      state.role      = 'player';
      state.playerId  = result.playerId;
      state.sessionId = state.joinedSessionId;
      localStorage.setItem('bj_role', 'player');

      // Start listening
      FirebaseService.listenGame(state.sessionId,    onGameUpdate);
      FirebaseService.listenPlayers(state.sessionId, onPlayersUpdate);

      UI.showScreen('player-view');
      document.getElementById('pv-player-name').textContent = nickname;

    } catch(e) {
      UI.showToast(e.message || 'Could not join', 'error');
    } finally {
      UI.hideLoading();
    }
  }

  function handlePlayerGameUpdate(game) {
    document.getElementById('pv-round-num').textContent = game.currentRound;

    const me = state.players[state.playerId];
    if (me) {
      const prevBal = state.prevBals[state.playerId];
      const delta   = prevBal != null ? me.balance - prevBal : 0;
      document.getElementById('pv-balance').textContent = UI.formatMoney(me.balance);
      const deltaEl = document.getElementById('pv-balance-delta');
      deltaEl.textContent = delta !== 0 ? UI.formatDelta(delta) : '';
      deltaEl.className   = 'balance-delta ' + (delta > 0 ? 'pos' : delta < 0 ? 'neg' : '');
    }

    // Phase switching
    document.querySelectorAll('.pv-phase').forEach(el => el.classList.remove('active'));

    if (game.phase === 'lobby') {
      // Show a waiting message
      document.getElementById('pv-phase-bet').classList.add('active');
      document.getElementById('btn-place-bet').textContent = 'Waiting for host to start...';
      document.getElementById('btn-place-bet').disabled = true;

    } else if (game.phase === 'betting') {
      document.getElementById('btn-place-bet').textContent = 'Bet Placed – I\'m Ready ✓';
      document.getElementById('btn-place-bet').disabled = false;
      // Check if this player already submitted bet
      if (me?.betReady) {
        document.getElementById('btn-place-bet').style.display = 'none';
        document.getElementById('bet-locked-msg').style.display = 'block';
        document.getElementById('bet-locked-amount').textContent = UI.formatMoney(me.bet);
      } else {
        document.getElementById('btn-place-bet').style.display = 'block';
        document.getElementById('bet-locked-msg').style.display = 'none';
      }
      // Update slider max from balance
      if (me) {
        const slider = document.getElementById('pv-bet-slider');
        slider.max = me.balance;
        document.getElementById('bet-slider-max-label').textContent = UI.formatMoney(me.balance);
      }
      document.getElementById('pv-phase-bet').classList.add('active');

    } else if (game.phase === 'resolving') {
      document.getElementById('pv-phase-waiting').classList.add('active');

    } else if (game.phase === 'summary') {
      if (me?.outcome) {
        showPlayerResult(me);
      }
      document.getElementById('pv-phase-result').classList.add('active');
      renderAllBalancesMini();

    } else if (game.phase === 'ended') {
      showFinalScreen();
    }
  }

  function showPlayerResult(me) {
    const info  = GameLogic.getOutcome(me.outcome) || { label: me.outcome, cssClass: 'push' };
    const delta = GameLogic.calculateDelta(me.outcome, me.bet);
    const prevBal = state.prevBals[state.playerId] || (me.balance - delta);

    document.getElementById('pv-result-outcome').textContent = info.label.toUpperCase();
    document.getElementById('pv-result-outcome').className   = `result-outcome ${info.cssClass}`;
    document.getElementById('pv-result-amount').textContent  = UI.formatDelta(delta);
    document.getElementById('pv-result-amount').className    = `result-amount ${delta >= 0 ? 'pos' : 'neg'}`;
    document.getElementById('pv-result-new-balance').textContent = UI.formatMoney(me.balance);

    // Play sound
    if (['win','bj','dd-win','triple'].includes(me.outcome)) {
      UI.playTone('win');
      if (['bj','triple'].includes(me.outcome)) UI.fireConfetti('bj');
      else UI.fireConfetti('win');
    } else if (['loss','dd-loss'].includes(me.outcome)) {
      UI.playTone('loss');
    }
  }

  function renderAllBalancesMini() {
    const list = document.getElementById('pv-all-balances');
    if (!list) return;
    const sorted = Object.values(state.players).sort((a, b) => b.balance - a.balance);
    list.innerHTML = sorted.map(p => `
      <div class="abm-row">
        <span>${UI.escHtml(p.name)}</span>
        <span class="abm-balance">${UI.formatMoney(p.balance)}</span>
      </div>`).join('');
  }

  async function placeBet() {
    const slider = document.getElementById('pv-bet-slider');
    const bet    = parseInt(slider.value);
    const me     = state.players[state.playerId];
    if (!me) return;
    const clamped = GameLogic.clampBet(bet, APP_CONFIG.MIN_BET, me.balance);

    UI.showLoading('Placing bet...');
    try {
      await FirebaseService.placeBet(state.sessionId, state.playerId, clamped);
      UI.showToast(`Bet ${ UI.formatMoney(clamped) } locked in!`, 'success');
    } catch(e) {
      UI.showToast('Error: ' + e.message, 'error');
    } finally {
      UI.hideLoading();
    }
  }

  /* ═══════════════════════════════════════════════════
     FINAL SCREEN
  ═══════════════════════════════════════════════════ */

  async function showFinalScreen() {
    const game    = state.game;
    const players = state.players;

    document.getElementById('final-game-name').textContent  = game.name;
    document.getElementById('final-rounds').textContent     = game.currentRound;

    const lb = GameLogic.buildLeaderboard(players, game.startingBal);
    const winner = lb[0];
    document.getElementById('final-winner-name').textContent = winner?.name || '—';
    document.getElementById('final-biggest-win').textContent =
      winner ? UI.formatMoney(winner.balance) : '$0';

    document.getElementById('final-leaderboard').innerHTML =
      lb.map((p, i) => UI.buildLeaderboardRow(p, i, game.startingBal)).join('');

    UI.showScreen('final');
    UI.fireConfetti('end');
  }

  /* ─── Share & Export ─────────────────────────────────── */
  async function shareResults() {
    const game    = state.game;
    const players = state.players;
    const lb      = GameLogic.buildLeaderboard(players, game.startingBal);
    const text    = GameLogic.buildShareText(game.name, game.currentRound, lb, game.startingBal);

    if (navigator.share) {
      try {
        await navigator.share({ title: `♠ ${game.name} Results`, text });
        return;
      } catch(e) {}
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      UI.showToast('Results copied to clipboard!', 'success');
    } catch(e) {
      UI.showToast('Could not copy — try manually', 'error');
    }
  }

  function exportCSV() {
    const game    = state.game;
    const players = state.players;
    const lb      = GameLogic.buildLeaderboard(players, game.startingBal);
    const rows    = [
      ['Name', 'Final Balance', 'Net Gain/Loss'],
      ...lb.map(p => [p.name, p.balance, p.balance - game.startingBal]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${game.name.replace(/\s+/g,'_')}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── History Overlay ─────────────────────────────────── */
  async function showHistory() {
    UI.showOverlay('overlay-history');
    UI.showLoading('Loading history...');
    try {
      const rounds = await FirebaseService.getRoundHistory(state.sessionId);
      document.getElementById('history-list').innerHTML =
        rounds.length
          ? rounds.map(r => UI.buildHistoryRound(r)).join('')
          : '<div class="text-dim text-center" style="padding:20px">No rounds played yet</div>';
    } finally {
      UI.hideLoading();
    }
  }

  /* ─── QR Overlay (re-show during game) ───────────────── */
  function showQROverlay() {
    if (!state.sessionId) return;
    UI.showOverlay('overlay-qr');
    const url = buildGameUrl(state.sessionId);
    UI.generateQR('overlay-qr-code', url, 200);
    document.getElementById('overlay-session-code').textContent = state.sessionId;
  }

  /* ─── Bet Slider (player) ────────────────────────────── */
  function updateBetDisplay(value) {
    document.getElementById('pv-bet-display').textContent = parseInt(value).toLocaleString('en-US');
    // Update slider gradient
    const slider = document.getElementById('pv-bet-slider');
    const pct = ((value - slider.min) / (slider.max - slider.min) * 100).toFixed(1);
    slider.style.setProperty('--pct', pct + '%');
  }

  /* ═══════════════════════════════════════════════════
     EVENT BINDING
  ═══════════════════════════════════════════════════ */

  function bindEvents() {

    // ── Home ─────────────────────────────────────────────
    document.getElementById('btn-host').addEventListener('click', () => {
      UI.showScreen('host-setup');
      UI.playTone('click');
    });
    document.getElementById('btn-join').addEventListener('click', () => {
      UI.showScreen('join');
      UI.playTone('click');
    });

    // ── Host Setup ───────────────────────────────────────
    document.getElementById('back-from-host-setup').addEventListener('click', () => {
      UI.showScreen('home');
    });
    document.getElementById('btn-create-game').addEventListener('click', createGame);

    // Chip selector
    document.querySelectorAll('.chip-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chip-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('starting-balance').value = btn.dataset.val;
        UI.playTone('click');
      });
    });

    // Starting balance manual input sync
    document.getElementById('starting-balance').addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      document.querySelectorAll('.chip-opt').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.val) === v);
      });
    });

    // ── Host QR Screen ───────────────────────────────────
    document.getElementById('btn-start-game-from-qr').addEventListener('click', startGame);

    // ── Join Screen ──────────────────────────────────────
    document.getElementById('back-from-join').addEventListener('click', () => {
      UI.stopQRScanner();
      UI.showScreen('home');
    });

    document.querySelectorAll('.join-tab').forEach(tab => {
      tab.addEventListener('click', () => showJoinTab(tab.dataset.tab));
    });

    document.getElementById('btn-find-game').addEventListener('click', () => findGame());
    document.getElementById('join-session-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') findGame();
    });

    document.getElementById('btn-confirm-join').addEventListener('click', confirmJoin);

    // ── Banker Dashboard ──────────────────────────────────
    document.getElementById('btn-go-resolve').addEventListener('click', goResolve);
    document.getElementById('btn-confirm-resolve').addEventListener('click', confirmResolve);
    document.getElementById('btn-next-round').addEventListener('click', nextRound);
    document.getElementById('btn-end-game').addEventListener('click', endGame);

    // Bottom bar (banker)
    document.getElementById('bbar-dashboard').addEventListener('click', () => {
      // already on dashboard — no-op
    });
    document.getElementById('bbar-history').addEventListener('click', showHistory);
    document.getElementById('bbar-show-qr').addEventListener('click', showQROverlay);

    // ── Player View ───────────────────────────────────────
    document.getElementById('btn-place-bet').addEventListener('click', placeBet);

    document.getElementById('pv-bet-slider').addEventListener('input', (e) => {
      updateBetDisplay(e.target.value);
    });

    // Quick bet buttons
    document.querySelectorAll('.qbet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const me = state.players[state.playerId];
        if (!me) return;
        const pct    = parseFloat(btn.dataset.pct);
        const amount = GameLogic.clampBet(me.balance * pct, APP_CONFIG.MIN_BET, me.balance);
        const slider = document.getElementById('pv-bet-slider');
        slider.value = amount;
        updateBetDisplay(amount);
        UI.playTone('click');
      });
    });

    // Player bottom bar
    document.getElementById('pv-bbar-game').addEventListener('click', () => {
      // no-op — already on game
    });
    document.getElementById('pv-bbar-history').addEventListener('click', showHistory);

    // ── Overlays ──────────────────────────────────────────
    document.getElementById('close-history').addEventListener('click', () => {
      UI.hideOverlay('overlay-history');
    });
    document.getElementById('close-qr-overlay').addEventListener('click', () => {
      UI.hideOverlay('overlay-qr');
    });

    // ── Final Screen ──────────────────────────────────────
    document.getElementById('btn-share-results').addEventListener('click', shareResults);
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-new-game-from-final').addEventListener('click', () => {
      FirebaseService.cleanup();
      state = {
        role: null, sessionId: null, playerId: null,
        game: null, players: {}, prevBals: {}, selectedOutcomes: {},
        joinedSessionId: null,
      };
      localStorage.removeItem('bj_sessionId');
      localStorage.removeItem('bj_playerId');
      localStorage.removeItem('bj_role');
      UI.showScreen('home');
    });

    // ── Start scan on load if on join screen ─────────────
    // Handled by handleDeepLink / tab click

    // ── PWA install prompt ────────────────────────────────
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // Optionally show install button
    });
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { state }; // expose for debugging

})();
