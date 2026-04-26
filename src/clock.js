// clock.js — sky cycle.
//
// The night cycle is tied to the work-rush schedule rather than a
// fixed real-time clock. Workers leaving = sunset; workers coming
// back = dawn. Outside of the departure window the sky stays at full
// daylight. This makes night feel meaningful (it's the "after-hours"
// quiet stretch) and lets us speed through it relative to the day.
//
// During the departure window (rush.phase === 'DEPARTURE_RUSH', which
// starts the moment workers begin leaving and ends right before the
// next arrival wave spawns), nightness traces a trapezoid:
//
//   progress       0%──────30%──────70%──────100%
//   nightness      0 ─sunset─ 1 ─night─ 1 ─dawn─ 0
//
// 30% sunset, 40% deep night, 30% dawn. The deep-night plateau is
// where the player gets a brief "the building is asleep" moment.

export const SUNSET_FRACTION = 0.30;
export const DAWN_FRACTION   = 0.30;

// Returns 0 (full day) → 1 (full night) given the current rush state
// and the configured DEPARTURE_RUSH duration.
export function computeRushNightness(rush, departureDurationMs) {
  if (!rush || rush.phase !== 'DEPARTURE_RUSH') return 0;
  if (departureDurationMs <= 0) return 0;
  const elapsed = departureDurationMs - rush.timerMs;
  const progress = Math.max(0, Math.min(1, elapsed / departureDurationMs));
  if (progress < SUNSET_FRACTION) return progress / SUNSET_FRACTION;
  if (progress < 1 - DAWN_FRACTION) return 1;
  return (1 - progress) / DAWN_FRACTION;
}
