// Minimal FSRS-4.5 scheduler (the algorithm used by modern Anki).
// Grades: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
const FSRS = (() => {
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
    1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5, FACTOR = 19 / 81, DAY = 86400000, MIN = 60000;
  const clampD = d => Math.min(10, Math.max(1, d));
  const d0 = g => clampD(W[4] - (g - 3) * W[5]);
  const retrievability = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
  const intervalDays = (s, r) => Math.max(1, Math.round(s / FACTOR * (Math.pow(r, 1 / DECAY) - 1)));

  function next(card, g, retention = 0.9, now = Date.now()) {
    const c = { ...card };
    if (!c.reps) {
      c.s = W[g - 1];
      c.d = d0(g);
    } else {
      const t = Math.max(0, (now - (c.last || now)) / DAY);
      const R = retrievability(t, c.s);
      const oldD = c.d, oldS = c.s;
      c.d = clampD(W[7] * d0(3) + (1 - W[7]) * (oldD - W[6] * (g - 3)));
      if (g === 1) {
        c.s = Math.min(oldS, W[11] * Math.pow(oldD, -W[12]) * (Math.pow(oldS + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
      } else {
        c.s = oldS * (1 + Math.exp(W[8]) * (11 - oldD) * Math.pow(oldS, -W[9]) *
          (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
      }
    }
    c.reps = (c.reps || 0) + 1;
    c.last = now;
    if (g === 1) {
      c.lapses = (c.lapses || 0) + (card.reps ? 1 : 0);
      c.due = now + 10 * MIN;
      c.ivl = 0;
    } else {
      c.ivl = intervalDays(c.s, retention);
      c.due = now + c.ivl * DAY;
    }
    return c;
  }

  function label(card, g, retention) {
    const n = next(card, g, retention);
    if (!n.ivl) return '10 min';
    const d = n.ivl;
    if (d < 31) return d + ' d';
    if (d < 365) return (d / 30).toFixed(1).replace('.0', '') + ' mo';
    return (d / 365).toFixed(1).replace('.0', '') + ' y';
  }
  return { next, label };
})();
