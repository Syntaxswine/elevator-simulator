// metrics.js — rolling average of worker arrival durations + anger curve.
//
// Tracks how long workers take to go from spawn to AT_WORK during a
// rush, and exposes a simple anger curve riders use to tint themselves
// red when they exceed that benchmark.

const MAX_SAMPLES = 20;
// Riders are patient: anger only kicks in once they've waited longer than
// the average TRIP scaled by this multiplier. 2.0 = "twice the typical
// trip time before anyone's annoyed."
export const PATIENCE_MULTIPLIER = 2.0;
export const FULL_ANGRY_OVERSHOOT_MS = 5000;   // 5s past the patient threshold = fully red

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
//   elapsed ≤ avg × PATIENCE                                      → 0  (calm)
//   elapsed = avg × PATIENCE + FULL_ANGRY_OVERSHOOT_MS             → 1  (fully red)
//   linear in between, clamped at 1
//   averageMs == null (no baseline yet)                            → 0
export function computeAnger(elapsedMs, averageMs) {
  if (averageMs === null || averageMs === undefined) return 0;
  const threshold = averageMs * PATIENCE_MULTIPLIER;
  if (elapsedMs <= threshold) return 0;
  const overshoot = elapsedMs - threshold;
  return Math.min(1, overshoot / FULL_ANGRY_OVERSHOOT_MS);
}
