// metrics.test.mjs — rolling worker-arrival average and the anger curve.
//
// Pure-function module, perfect for unit testing. No time mocking
// needed: durationMs is just a number we feed in.

import { describe, test, assertEquals, assertNear, assertTrue } from './runner.mjs';
import {
  createMetrics,
  recordArrival,
  computeAnger,
  FULL_ANGRY_OVERSHOOT_MS,
  PATIENCE_MULTIPLIER,
} from '../src/metrics.js';

describe('metrics: rolling average', () => {
  test('starts with no samples and null average', () => {
    const m = createMetrics();
    assertEquals(m.arrivalDurations.length, 0);
    assertEquals(m.averageMs, null);
  });

  test('first arrival sets the average to that duration', () => {
    const m = createMetrics();
    recordArrival(m, 12_000);
    assertEquals(m.averageMs, 12_000);
  });

  test('multiple arrivals average correctly', () => {
    const m = createMetrics();
    recordArrival(m, 10_000);
    recordArrival(m, 20_000);
    recordArrival(m, 30_000);
    assertNear(m.averageMs, 20_000);
  });

  test('rolling window caps at 20 samples', () => {
    const m = createMetrics();
    for (let i = 0; i < 25; i++) recordArrival(m, 100 * (i + 1));
    assertEquals(m.arrivalDurations.length, 20);
    // Should be the last 20 values: 100*6 .. 100*25
    assertEquals(m.arrivalDurations[0], 600);
    assertEquals(m.arrivalDurations[19], 2500);
  });
});

describe('metrics: anger curve', () => {
  test('null average → no anger (no baseline yet)', () => {
    assertEquals(computeAnger(60_000, null), 0);
  });

  test('elapsed at or below patient threshold (avg × PATIENCE) → calm', () => {
    const avg = 10_000;
    const threshold = avg * PATIENCE_MULTIPLIER;
    assertEquals(computeAnger(0, avg), 0);
    assertEquals(computeAnger(avg, avg), 0,        'one full average is still calm');
    assertEquals(computeAnger(threshold, avg), 0,  'right at threshold is calm');
  });

  test('5 seconds past the patient threshold → fully red', () => {
    const avg = 10_000;
    const threshold = avg * PATIENCE_MULTIPLIER;
    assertEquals(computeAnger(threshold + FULL_ANGRY_OVERSHOOT_MS, avg), 1);
  });

  test('linear ramp from threshold to threshold + 5s', () => {
    const avg = 10_000;
    const t = avg * PATIENCE_MULTIPLIER;
    assertNear(computeAnger(t + 1000, avg), 0.2);
    assertNear(computeAnger(t + 2500, avg), 0.5);
    assertNear(computeAnger(t + 4000, avg), 0.8);
  });

  test('anger clamps at 1 well past full-red threshold', () => {
    assertEquals(computeAnger(1_000_000, 10_000), 1);
  });
});
