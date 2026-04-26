// rng.test.mjs — confirms the seeded PRNG is deterministic and well-bounded.
//
// Why test the PRNG? It's the foundation of tower-variant assignment.
// If the same seed ever stops producing the same tower, players lose
// the only persistence the game offers (the building they remember).

import { describe, test, assertEquals, assertTrue } from './runner.mjs';
import { createRng, pickRandom } from '../src/rng.js';

describe('rng', () => {
  test('same seed produces same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) {
      assertEquals(a(), b(), `value ${i}`);
    }
  });

  test('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    let same = true;
    for (let i = 0; i < 10; i++) if (a() !== b()) { same = false; break; }
    assertTrue(!same, 'expected sequences to diverge');
  });

  test('output stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      assertTrue(v >= 0 && v < 1, `value ${v} out of [0, 1)`);
    }
  });

  test('pickRandom returns an element of the array', () => {
    const r = createRng(1);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) assertTrue(arr.includes(pickRandom(r, arr)));
  });
});
