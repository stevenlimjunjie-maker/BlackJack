/**
 * ui.js
 * ─────
 * DOM utilities, screen transitions, toast notifications,
 * QR code generation and scanning helpers, and confetti.
 * Keeps all direct DOM manipulation out of app.js.
 */

const UI = (() => {

  /* ─── Screen Management ──────────────────────────────── */
  let currentScreen = 'home';

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${id}`);
    if (target) {
      target.classList.add('active');
      currentScreen = id;
    }
  }

  /* ─── Toast Notifications ────────────────────────────── */
  let toastTimer = null;

  function showToast(msg, type = 'info', duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  }
  // Make globally available for firebase-service.js
  window.showToast = showToast;

  /* ─── Loading Overlay ────────────────────────────────── */
  function showLoading(text = 'Loading...') {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-text').textContent = text;
  }
  function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
  }

  /* ─── QR Code Generation ─────────────────────────────── */
  let qrInstance = null;
  let qrOverlayInstance = null;

  function generateQR(containerId, url, size = 220) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    // qrcodejs library
    return new QRCode(container, {
      text:          url,
      width:         size,
      height:        size,
      colorDark:     '#000000',
      colorLight:    '#ffffff',
      correctLevel:  QRCode.CorrectLevel.H,
    });
  }

  /* ─── QR Code Scanner ────────────────────────────────── */
  let html5QrScanner = null;

  function startQRScanner(onSuccess) {
    if (html5QrScanner) return; // already running
    html5QrScanner = new Html5Qrcode('qr-reader');
    html5QrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        stopQRScanner();
        onSuccess(decodedText);
      },
      () => {} // ignore frame errors
    ).catch(err => {
      console.warn('[QR] Camera start failed:', err);
      showToast('Camera access denied. Use the code entry instead.', 'error');
    });
  }

  function stopQRScanner() {
    if (html5QrScanner) {
      html5QrScanner.stop().catch(() => {});
      html5QrScanner = null;
    }
  }

  /* ─── Confetti ───────────────────────────────────────── */
  function fireConfetti(type = 'win') {
    if (typeof confetti === 'undefined') return;
    if (type === 'bj') {
      // Golden confetti burst for Blackjack
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 },
        colors: ['#d4a843', '#f0c866', '#ffffff', '#ffd700'] });
    } else if (type === 'win') {
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 },
        colors: ['#27ae60', '#2ecc71', '#ffffff'] });
    } else if (type === 'end') {
      // Final game — big burst
      setTimeout(() => confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } }), 0);
      setTimeout(() => confetti({ particleCount: 100, spread: 80, angle: 60, origin: { x: 0, y: 0.6 } }), 300);
      setTimeout(() => confetti({ particleCount: 100, spread: 80, angle: 120, origin: { x: 1, y: 0.6 } }), 500);
    }
  }

  /* ─── Money Formatting ───────────────────────────────── */
  function formatMoney(n)  { return GameLogic.formatMoney(n); }
  function formatDelta(n)  { return GameLogic.formatDelta(n); }
  function getInitials(n)  { return GameLogic.getInitials(n); }

  /* ─── Player Balance Row ─────────────────────────────── */
  function buildPlayerBalanceRow(player, prevBalance) {
    const delta = prevBalance != null ? player.balance - prevBalance : 0;
    const balClass = player.balance > 0 ? 'positive' : player.balance < 0 ? 'negative' : 'neutral';
    const deltaHtml = delta !== 0
      ? `<span class="pbr-delta ${delta > 0 ? 'pos' : 'neg'}">${formatDelta(delta)}</span>`
      : '';
    return `
      <div class="player-balance-row ${player.balance <= 0 ? 'bankrupt' : ''}">
        <div class="pbr-avatar">${getInitials(player.name)}</div>
        <div class="pbr-name">${escHtml(player.name)}</div>
        <div class="pbr-balance ${balClass}">${formatMoney(player.balance)}</div>
        ${deltaHtml}
      </div>`;
  }

  /* ─── Bet Status Row (banker view) ──────────────────── */
  function buildBetStatusRow(player) {
    return `
      <div class="bet-status-row">
        <div class="bsr-name">${escHtml(player.name)}</div>
        <div class="bsr-amount">${formatMoney(player.bet || 0)}</div>
        <div class="bsr-status ${player.betReady ? 'ready' : 'waiting'}">
          ${player.betReady ? '✓ Ready' : 'Betting...'}
        </div>
      </div>`;
  }

  /* ─── Resolve Row (banker view) ─────────────────────── */
  function buildResolveRow(player) {
    const outcomes = [
      { key: 'win',     },
      { key: 'bj',      },
      { key: 'loss',    },
      { key: 'push',    },
      { key: 'dd-win',  },
      { key: 'dd-loss', },
      { key: 'triple',  },
    ];
    const btns = outcomes.map(o => {
      const info = GameLogic.getOutcome(o.key);
      return `<button class="outcome-btn" data-outcome="${o.key}" data-pid="${player.id}">
        ${info.btnLabel}
       </button>`;
    }).join('');
    return `
      <div class="resolve-row" data-pid="${player.id}">
        <div class="resolve-row-header">
          <div class="resolve-name">${escHtml(player.name)}</div>
          <div class="resolve-bet">Bet: <strong>${formatMoney(player.bet || 0)}</strong></div>
        </div>
        <div class="outcome-grid seven">${btns}</div>
      </div>`;
  }

  /* ─── Summary Row ────────────────────────────────────── */
  function buildSummaryRow({ name, outcome, delta }) {
    const info = GameLogic.getOutcome(outcome) || { label: outcome, cssClass: 'push' };
    const deltaClass = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
    return `
      <div class="summary-row">
        <div class="sr-name">${escHtml(name)}</div>
        <div class="sr-outcome ${info.cssClass}">${info.label}</div>
        <div class="sr-delta ${deltaClass}">${formatDelta(delta)}</div>
      </div>`;
  }

  /* ─── Leaderboard Row ────────────────────────────────── */
  function buildLeaderboardRow(player, rank, startingBal) {
    const medals = ['gold','silver','bronze'];
    const rankClass = medals[rank] || '';
    const rankSymbol = ['🥇','🥈','🥉'][rank] || `${rank + 1}`;
    const net = player.balance - startingBal;
    const netClass = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
    return `
      <div class="lb-row">
        <div class="lb-rank ${rankClass}">${rankSymbol}</div>
        <div class="lb-name">${escHtml(player.name)}</div>
        <div class="lb-final-balance">${formatMoney(player.balance)}</div>
        <div class="lb-net ${netClass}">${net >= 0 ? '+' : ''}${formatMoney(net)}</div>
      </div>`;
  }

  /* ─── History Entry ──────────────────────────────────── */
  function buildHistoryRound(round) {
    const entries = round.entries || [];
    const rows = entries.map(e => {
      const info = GameLogic.getOutcome(e.outcome) || { label: e.outcome };
      const sign = e.delta >= 0 ? '+' : '';
      return `<div class="history-entry">
        <span>${escHtml(e.name)}</span>
        <span>${info.label} · ${sign}${formatMoney(e.delta)}</span>
      </div>`;
    }).join('');
    return `
      <div class="history-round">
        <div class="history-round-title">ROUND ${round.round}</div>
        ${rows}
      </div>`;
  }

  /* ─── Waiting Player Chip ────────────────────────────── */
  function buildWaitingChip(player) {
    return `
      <div class="player-waiting-chip">
        <div class="chip-avatar">${getInitials(player.name)}</div>
        <div class="chip-name">${escHtml(player.name)}</div>
      </div>`;
  }

  /* ─── Escape HTML ────────────────────────────────────── */
  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ─── Sound (subtle click) ───────────────────────────── */
  let soundEnabled = true;
  let audioCtx = null;

  function playTone(type = 'click') {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      if (type === 'click') {
        osc.frequency.value = 440; gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      } else if (type === 'win') {
        osc.frequency.value = 523; gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      } else if (type === 'loss') {
        osc.frequency.value = 220; gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.frequency.setValueAtTime(180, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      }
      osc.start(); osc.stop(audioCtx.currentTime + 0.4);
    } catch(e) {}
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    return soundEnabled;
  }

  /* ─── Overlay helpers ────────────────────────────────── */
  function showOverlay(id) {
    document.getElementById(id).style.display = 'flex';
    document.getElementById(id).style.flexDirection = 'column';
  }
  function hideOverlay(id) {
    document.getElementById(id).style.display = 'none';
  }

  return {
    showScreen, showToast, showLoading, hideLoading,
    generateQR, startQRScanner, stopQRScanner,
    fireConfetti, formatMoney, formatDelta, getInitials,
    buildPlayerBalanceRow, buildBetStatusRow, buildResolveRow,
    buildSummaryRow, buildLeaderboardRow, buildHistoryRound,
    buildWaitingChip, escHtml, playTone, toggleSound,
    showOverlay, hideOverlay,
  };

})();
