/**
 * game-logic.js
 * ─────────────
 * Pure functions for Blackjack outcome calculations.
 * No side-effects, no DOM, no Firebase. Easily unit-testable.
 */

const GameLogic = (() => {

  /**
   * OUTCOME TYPES
   * Mapped to human labels, CSS classes, and payout multipliers.
   */
  const OUTCOMES = {
    'win':     { label: 'Win',       btnLabel: 'Win (1×)',      cssClass: 'win',     multiplier:  1,  displaySymbol: '✓' },
    'bj':      { label: 'Blackjack', btnLabel: 'Blackjack (2×)',cssClass: 'bj',      multiplier:  2,  displaySymbol: '♠' },
    'loss':    { label: 'Loss',      btnLabel: 'Loss (−1×)',    cssClass: 'loss',    multiplier: -1,  displaySymbol: '✗' },
    'push':    { label: 'Draw',      btnLabel: 'Draw (0)',      cssClass: 'push',    multiplier:  0,  displaySymbol: '–' },
    'dd-win':  { label: 'Dbl Win',   btnLabel: 'Dbl Win (2×)', cssClass: 'dd-win',  multiplier:  2,  displaySymbol: '2×✓' },
    'dd-loss': { label: 'Dbl Loss',  btnLabel: 'Dbl Loss (−2×)',cssClass: 'dd-loss', multiplier: -2,  displaySymbol: '2×✗' },
    'triple':  { label: 'Triple',    btnLabel: 'Triple (3×)',   cssClass: 'triple',  multiplier:  3,  displaySymbol: '3×✓' },
  };

  /**
   * Calculate the dollar delta for a given outcome + bet.
   * Returns a signed integer (can be fractional for BJ, then rounded).
   */
  function calculateDelta(outcome, bet) {
    const rule = OUTCOMES[outcome];
    if (!rule) return 0;
    return Math.round(bet * rule.multiplier);
  }

  /**
   * Format a dollar amount for display.
   * e.g.  1234 → "$1,234"
   *        -50 → "-$50"
   */
  function formatMoney(amount) {
    const abs = Math.abs(amount);
    const formatted = abs.toLocaleString('en-US');
    return amount < 0 ? `-$${formatted}` : `$${formatted}`;
  }

  /**
   * Format a delta (signed) with explicit + sign.
   * e.g.  150 → "+$150"
   *       -50 → "-$50"
   *          0 → "Push"
   */
  function formatDelta(delta) {
    if (delta === 0) return 'Push';
    const abs = Math.abs(delta);
    const formatted = abs.toLocaleString('en-US');
    return delta > 0 ? `+$${formatted}` : `-$${formatted}`;
  }

  /**
   * Get outcome metadata by key.
   */
  function getOutcome(key) {
    return OUTCOMES[key] || null;
  }

  /**
   * Return all outcome keys (for building UI buttons).
   */
  function getAllOutcomeKeys() {
    return Object.keys(OUTCOMES);
  }

  /**
   * Given players object { [id]: { name, balance, startingBal? } },
   * compute final leaderboard sorted by balance desc.
   */
  function buildLeaderboard(players, startingBal) {
    return Object.values(players)
      .map(p => ({
        id:      p.id,
        name:    p.name,
        balance: p.balance,
        net:     p.balance - (startingBal || p.startingBal || 0),
      }))
      .sort((a, b) => b.balance - a.balance);
  }

  /**
   * Get the initials of a player name (up to 2 chars).
   * e.g. "Lucky Steve" → "LS"
   */
  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  /**
   * Clamp a bet within [min, max].
   */
  function clampBet(bet, min, max) {
    return Math.max(min, Math.min(max, Math.round(bet)));
  }

  /**
   * Build shareable text summary.
   */
  function buildShareText(gameName, roundCount, leaderboard, startingBal) {
    const lines = [
      `♠ BlackJack Score — ${gameName}`,
      `${roundCount} rounds played`,
      '',
      '🏆 Final Standings:',
      ...leaderboard.map((p, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
        const net = p.balance - startingBal;
        const sign = net >= 0 ? '+' : '';
        return `${medal} ${p.name}: ${formatMoney(p.balance)} (${sign}${formatMoney(net)})`;
      }),
      '',
      'Played with BlackJack Score — virtual scoring only, no real money.',
    ];
    return lines.join('\n');
  }

  return {
    OUTCOMES,
    calculateDelta,
    formatMoney,
    formatDelta,
    getOutcome,
    getAllOutcomeKeys,
    buildLeaderboard,
    getInitials,
    clampBet,
    buildShareText,
  };

})();
