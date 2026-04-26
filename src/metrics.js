// metrics.js — rolling average of worker arrival durations + anger curve.
//
// Tracks how long workers take to go from spawn to AT_WORK during a
// rush, and exposes a simple anger curve riders use to tint themselves
// red when they exceed that benchmark.

const MAX_SAMPLES = 20;
export const FULL_ANGRY_OVERSHOOT_MS = 5000;   // 5s over avg = fully red

export function createMetrics() {
  return {
    arrivalDurations: [],   // rolling window of worker spawn→AT_WORK times
    averageMs: null,        // null until at least one arrival recorded
  };
}

// Push a new worker arrival duration; update the rolling average.
export function recordArrival(metrics, durationMs) {
  metrics.arrivalDurations.push(durationMs);
  if (metrics.arrivalDurations.length > MAX_SAMPLES) {
    metrics.arrivalDurations.shift();
  }
  let sum = 0;
  for (const d of metrics.arrivalDurations) sum += d;
  metrics.averageMs = sum / metrics.arrivalDurations.length;
}

// Maps elapsed-time-on-this-trip → anger ∈ [0, 1].
//   elapsed ≤ avg                           → 0  (calm)
//   elapsed = avg + FULL_ANGRY_OVERSHOOT_MS → 1  (fully red, mad)
//   linear in between, clamped at 1
//   averageMs == null (no baseline yet)     → 0
export function computeAnger(elapsedMs, averageMs) {
  if (averageMs === null || averageMs === undefined) return 0;
  if (elapsedMs <= averageMs) return 0;
  const overshoot = elapsedMs - averageMs;
  return Math.min(1, overshoot / FULL_ANGRY_OVERSHOOT_MS);
}
