// tower.test.mjs — verifies tower model + seeded variant assignment.
//
// The tower has fixed slots: SB and B always show as basement, L
// always shows as lobby-floor, and floors 2..10 (indices 3..11) draw
// from the office variant pool. The user-facing promise is that the
// same seed makes the same building. That's a regression worth
// pinning so a future refactor of the variant rules doesn't quietly
// break it.

import { describe, test, assertEquals, assertTrue } from './runner.mjs';
import { buildTower } from '../src/tower.js';

describe('tower', () => {
  test('same seed produces identical floor variants', () => {
    const a = buildTower(42);
    const b = buildTower(42);
    for (let i = 0; i < 12; i++) {
      assertEquals(a.floors[i].tileVariant, b.floors[i].tileVariant, `floor ${i}`);
    }
  });

  test('lobby is always lobby-floor regardless of seed', () => {
    for (const seed of [1, 42, 1000, 9999, -3]) {
      const t = buildTower(seed);
      assertEquals(t.floors[2].tileVariant, 'lobby-floor');
    }
  });

  test('basement floors (SB and B) are always basement', () => {
    for (const seed of [1, 42, 1000, 9999]) {
      const t = buildTower(seed);
      assertEquals(t.floors[0].tileVariant, 'basement');
      assertEquals(t.floors[1].tileVariant, 'basement');
    }
  });

  test('above-ground non-lobby floors draw from the mixed-use variant pool', () => {
    const t = buildTower(7);
    const allowed = new Set([
      'office-1', 'office-2', 'office-3',
      'fast-food', 'sandwich-shop', 'sushi-restaurant',
      'upscale-food1', 'upscale-food2',
    ]);
    for (let i = 3; i <= 11; i++) {
      assertTrue(allowed.has(t.floors[i].tileVariant), `floor ${i}: ${t.floors[i].tileVariant}`);
    }
  });

  test('different seeds produce at least some variant differences', () => {
    // 9 office floors × 3 variants — odds of full match between two
    // random seeds is (1/3)^9 ≈ 0.005%. Using fixed disparate seeds.
    const a = buildTower(1);
    const b = buildTower(99);
    let differences = 0;
    for (let i = 3; i <= 11; i++) {
      if (a.floors[i].tileVariant !== b.floors[i].tileVariant) differences++;
    }
    assertTrue(differences > 0, 'expected at least one office floor to differ');
  });

  test('floor labels match indices', () => {
    const expected = ['SB', 'B', 'L', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const t = buildTower(1);
    for (let i = 0; i < 12; i++) assertEquals(t.floors[i].label, expected[i]);
  });
});
