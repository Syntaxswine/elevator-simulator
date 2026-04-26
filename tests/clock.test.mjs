// clock.test.mjs — sky cycle tied to the work-rush schedule.
//
// computeRushNightness traces a trapezoid over the DEPARTURE_RUSH
// timer: 0 (full day) → 1 (full night) over the first 30%, holds at
// 1 through the middle 40%, then 1 → 0 over the final 30%. Outside
// of DEPARTURE_RUSH it's always 0 (full day).

import { describe, test, assertEquals, assertNear } from './runner.mjs';
import { computeRushNightness, SUNSET_FRACTION, DAWN_FRACTION } from '../src/clock.js';

const DURATION = 100_000;     // 100 s of "departure rush" for clean math

function rushAtProgress(progress) {
  return { phase: 'DEPARTURE_RUSH', timerMs: DURATION * (1 - progress) };
}

describe('clock: rush-based nightness', () => {
  test('returns 0 outside of DEPARTURE_RUSH', () => {
    for (const phase of ['IDLE', 'WAITING_FOR_ARRIVAL', 'SPAWNING_ARRIVAL', 'AT_WORK']) {
      assertEquals(computeRushNightness({ phase, timerMs: 1000 }, DURATION), 0,
        `nightness should be 0 in phase ${phase}`);
    }
  });

  test('returns 0 for a null/missing rush', () => {
    assertEquals(computeRushNightness(null, DURATION), 0);
    assertEquals(computeRushNightness(undefined, DURATION), 0);
  });

  test('full day at the start of departure (progress ≈ 0)', () => {
    assertEquals(computeRushNightness(rushAtProgress(0), DURATION), 0);
  });

  test('peaks at 1 across the night plateau', () => {
    // Anywhere between SUNSET_FRACTION and 1 - DAWN_FRACTION should be 1.
    for (const p of [SUNSET_FRACTION, 0.5, 1 - DAWN_FRACTION]) {
      assertNear(computeRushNightness(rushAtProgress(p), DURATION), 1, 1e-6,
        `progress ${p}`);
    }
  });

  test('linear ramp during sunset (0 → SUNSET_FRACTION)', () => {
    assertNear(computeRushNightness(rushAtProgress(SUNSET_FRACTION / 2), DURATION), 0.5);
  });

  test('linear ramp during dawn (1 - DAWN_FRACTION → 1)', () => {
    const midDawn = (1 - DAWN_FRACTION) + DAWN_FRACTION / 2;
    assertNear(computeRushNightness(rushAtProgress(midDawn), DURATION), 0.5);
  });

  test('returns to full day at the end (progress = 1)', () => {
    assertNear(computeRushNightness(rushAtProgress(1), DURATION), 0);
  });

  test('zero or negative duration is safe (returns 0)', () => {
    assertEquals(computeRushNightness({ phase: 'DEPARTURE_RUSH', timerMs: 0 }, 0), 0);
    assertEquals(computeRushNightness({ phase: 'DEPARTURE_RUSH', timerMs: 0 }, -1), 0);
  });
});
