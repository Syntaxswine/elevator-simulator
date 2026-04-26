// clock.js — day/night cycle.
//
// Time is normalized: timeOfDay ∈ [0, 1)
//   0.0  midnight    (full night)
//   0.25 dawn        (mid-fade)
//   0.5  noon        (full day)
//   0.75 dusk        (mid-fade)
//   1.0  midnight    (wraps to 0)
//
// computeNightness returns the alpha to apply to the night-sky tile
// over the day-sky tile: 0 = pure day, 1 = pure night, smooth cosine
// in between. The cosine curve gives a natural lingering noon and
// long midnight with quick dawn / dusk transitions.

export const DAY_LENGTH_MS = 2 * 60 * 1000;   // a full day fits in 2 real minutes

export function computeNightness(timeOfDay) {
  const phase = (timeOfDay - 0.5) * 2 * Math.PI;
  return (1 - Math.cos(phase)) / 2;
}

export function advanceTime(timeOfDay, dt, dayLengthMs = DAY_LENGTH_MS) {
  const t = (timeOfDay + dt / dayLengthMs) % 1;
  return t < 0 ? t + 1 : t;
}
