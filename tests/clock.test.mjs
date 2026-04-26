// clock.test.mjs — day/night cycle math.
//
// Pure functions: a wrap-around time advancer and a smooth cosine
// curve from 0 (day) to 1 (night). Verifying them in isolation
// means the renderer's job is just "draw night-sky with this alpha"
// — no sun-position math anywhere visual.

import { describe, test, assertEquals, assertNear, assertTrue } from './runner.mjs';
import { computeNightness, advanceTime, DAY_LENGTH_MS } from '../src/clock.js';

describe('clock: nightness curve', () => {
  test('noon is fully day (nightness 0)', () => {
    assertNear(computeNightness(0.5), 0);
  });

  test('midnight is fully night (nightness 1)', () => {
    assertNear(computeNightness(0), 1);
  });

  test('the curve wraps cleanly at 0 and 1', () => {
    assertNear(computeNightness(0), computeNightness(1));
  });

  test('dawn and dusk both sit at the curve midpoint', () => {
    assertNear(computeNightness(0.25), 0.5, 1e-6, 'dawn (0.25)');
    assertNear(computeNightness(0.75), 0.5, 1e-6, 'dusk (0.75)');
  });

  test('curve is symmetric around noon', () => {
    for (const off of [0.1, 0.2, 0.3]) {
      assertNear(computeNightness(0.5 - off), computeNightness(0.5 + off));
    }
  });
});

describe('clock: time advance', () => {
  test('forward by less than a day', () => {
    const t = advanceTime(0.1, DAY_LENGTH_MS / 4);   // a quarter day
    assertNear(t, 0.35);
  });

  test('wraps past 1.0 back into [0, 1)', () => {
    const t = advanceTime(0.9, DAY_LENGTH_MS * 0.5);  // half a day past 0.9
    assertNear(t, 0.4);
  });

  test('returns a value in [0, 1) regardless of dt', () => {
    for (const dt of [0, 1, 1000, 100_000_000]) {
      const t = advanceTime(0.5, dt);
      assertTrue(t >= 0 && t < 1, `t=${t} for dt=${dt}`);
    }
  });

  test('custom day length scales the advance', () => {
    // With a 10 000 ms day, dt 5 000 = half a day → 0.0 → 0.5
    assertNear(advanceTime(0, 5000, 10000), 0.5);
  });
});
