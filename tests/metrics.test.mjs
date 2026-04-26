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

  test('elapsed at or below average → calm (anger 0)', () => {
    assertEquals(computeAnger(0, 10_000), 0);
    assertEquals(computeAnger(5_000, 10_000), 0);
    assertEquals(computeAnger(10_000, 10_000), 0);
  });

  test('5 seconds over average → fully red (anger 1)', () => {
    assertEquals(computeAnger(10_000 + FULL_ANGRY_OVERSHOOT_MS, 10_000), 1);
  });

  test('linear ramp between average and average + 5s', () => {
    const avg = 10_000;
    assertNear(computeAnger(avg + 1000, avg), 0.2);
    assertNear(computeAnger(avg + 2500, avg), 0.5);
    assertNear(computeAnger(avg + 4000, avg), 0.8);
  });

  test('anger clamps at 1 well past full-red threshold', () => {
    assertEquals(computeAnger(60_000, 10_000), 1);
    assertEquals(computeAnger(1_000_000, 10_000), 1);
  });
});
