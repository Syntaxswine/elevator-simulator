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

  test('without restaurants enabled, above-ground floors are all offices', () => {
    const offices = new Set(['office-1', 'office-2', 'office-3']);
    for (const seed of [1, 7, 42, 1337]) {
      const t = buildTower(seed);
      for (let i = 3; i <= 11; i++) {
        assertTrue(offices.has(t.floors[i].tileVariant),
          `seed ${seed} floor ${i}: ${t.floors[i].tileVariant}`);
      }
    }
  });

  test('with restaurants enabled, restaurant count is 0, 2, or 4', () => {
    const restaurants = new Set([
      'fast-food', 'sandwich-shop', 'sushi-restaurant',
      'upscale-food1', 'upscale-food2', 'coffee-shop',
    ]);
    for (const seed of [1, 7, 42, 1337, 99, 2025, 3, 11]) {
      const t = buildTower(seed, { includeRestaurants: true });
      let count = 0;
      for (let i = 3; i <= 11; i++) {
        if (restaurants.has(t.floors[i].tileVariant)) count++;
      }
      assertTrue([0, 2, 4].includes(count),
        `seed ${seed} produced ${count} restaurants`);
    }
  });

  test('restaurants are unique tiles (no duplicates)', () => {
    const restaurants = new Set([
      'fast-food', 'sandwich-shop', 'sushi-restaurant',
      'upscale-food1', 'upscale-food2', 'coffee-shop',
    ]);
    for (const seed of [1, 7, 42, 1337, 99]) {
      const t = buildTower(seed, { includeRestaurants: true });
      const placed = [];
      for (let i = 3; i <= 11; i++) {
        if (restaurants.has(t.floors[i].tileVariant)) {
          placed.push(t.floors[i].tileVariant);
        }
      }
      const unique = new Set(placed);
      assertEquals(unique.size, placed.length,
        `seed ${seed}: duplicate restaurants in ${JSON.stringify(placed)}`);
    }
  });

  test('same seed + restaurants flag is reproducible', () => {
    const a = buildTower(42, { includeRestaurants: true });
    const b = buildTower(42, { includeRestaurants: true });
    for (let i = 0; i < 12; i++) {
      assertEquals(a.floors[i].tileVariant, b.floors[i].tileVariant, `floor ${i}`);
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

  test('hell option replaces SB tile and label', () => {
    const t = buildTower(1, { includeHell: true });
    assertEquals(t.floors[0].label, 'HELL');
    assertEquals(t.floors[0].tileVariant, 'hell-floor');
    // B and the rest are unchanged
    assertEquals(t.floors[1].label, 'B');
    assertEquals(t.floors[1].tileVariant, 'basement');
    assertEquals(t.floors[2].label, 'L');
  });

  test('without hell option, SB is the normal basement', () => {
    const t = buildTower(1);
    assertEquals(t.floors[0].label, 'SB');
    assertEquals(t.floors[0].tileVariant, 'basement');
  });
});
