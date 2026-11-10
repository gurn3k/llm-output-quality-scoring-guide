// Seeded randomness, so every draw and split can be repeated exactly from its seed (ADR 0009).

// mulberry32: a small, well-known 32-bit generator. Returns numbers in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh seed for a new project. Uses the browser's or Node's crypto source.
export function newSeed() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0];
}

// Fisher-Yates on a copy. The input array is never changed.
export function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The labelling sample: n items drawn at random (all of them if there are fewer than n).
export function drawSample(ids, n, seed) {
  return shuffle(ids, mulberry32(seed)).slice(0, Math.min(n, ids.length));
}

// Splits sampled ids, in draw order, into tuning (about two-thirds) and held back (every third item).
// Taking positions from the draw order keeps the split stable when the sample grows in rounds:
// extending the sample never moves an item between sets (ADRs 0009, 0013).
export function splitHeldBack(ids) {
  const tuning = [], heldBack = [];
  ids.forEach((id, i) => (i % 3 === 2 ? heldBack : tuning).push(id));
  return { tuning, heldBack };
}
