// layout.test.mjs — coordinate math and camera anchor.
//
// These are pure functions of canvas size + camera Y. They're easy
// targets for unit tests because no DOM is involved. Bugs here
// usually manifest as taps registering on the wrong floor or sprites
// drawn at the wrong position — subtle and hard to spot in screenshots.

import { describe, test, assertEquals, assertNear } from './runner.mjs';
import {
  computeLayout,
  towerYToScreenY,
  screenYToTowerY,
  towerXToScreenX,
  screenXToTowerX,
  getCameraY,
} from '../src/layout.js';

describe('layout', () => {
  test('unit_size_px = canvas_width / 10', () => {
    assertEquals(computeLayout(400, 800).unitSizePx, 40);
    assertEquals(computeLayout(375, 812).unitSizePx, 37.5);
  });

  test('top region is 1u tall', () => {
    const L = computeLayout(400, 800);
    assertEquals(L.indicator.h, L.unitSizePx);
  });

  test('bottom region is 5u tall (two 5x5 tiles)', () => {
    const L = computeLayout(400, 800);
    assertEquals(L.bottom.h, L.unitSizePx * 5);
  });

  test('regions vertically partition the canvas', () => {
    const L = computeLayout(400, 800);
    assertNear(L.indicator.h + L.tower.h + L.bottom.h, 800);
  });

  test('towerY ↔ screenY round-trips', () => {
    const L = computeLayout(400, 800);
    const cameraY = 5;
    for (const ty of [0, 1, 5.5, 7.25, 11]) {
      const sy = towerYToScreenY(ty, L, cameraY);
      assertNear(screenYToTowerY(sy, L, cameraY), ty);
    }
  });

  test('towerX ↔ screenX round-trips', () => {
    const L = computeLayout(400, 800);
    for (const tx of [0, 0.5, 5, 9.5, 10]) {
      const sx = towerXToScreenX(tx, L);
      assertNear(screenXToTowerX(sx, L), tx);
    }
  });

  test('camera follows player floor when not in elevator', () => {
    const player = { state: 'IDLE', floor: 5 };
    const elevator = { position: 8.4 };
    assertEquals(getCameraY(player, elevator), 5.5);
  });

  test('camera follows elevator when player is IN_ELEVATOR', () => {
    const player = { state: 'IN_ELEVATOR', floor: 5 };
    const elevator = { position: 8.4 };
    assertEquals(getCameraY(player, elevator), 8.9);
  });
});
