// spider.test.mjs — wandering spiders + slow-on-touch.

import { describe, test, assertEquals, assertTrue, assertNear } from './runner.mjs';
import {
  createSpider,
  spawnSpiders,
  updateSpider,
  isTouchedBySpider,
  spiderSlowFactor,
} from '../src/spider.js';
import {
  SPIDER_FLOOR_INDEX,
  SPIDER_TOUCH_RADIUS,
  SPIDER_SLOW_FACTOR,
} from '../src/config.js';

describe('spider: wander', () => {
  test('updateSpider eventually picks a new target', () => {
    const s = createSpider(5);
    s.targetX = 5;          // already at target
    s.nextPickMs = 0;
    updateSpider(s, 16);
    assertTrue(s.nextPickMs > 0, 'should have picked a new target with non-zero wait');
  });

  test('updateSpider moves toward target without overshooting', () => {
    const s = createSpider(2);
    s.targetX = 8;
    s.nextPickMs = 100_000;  // don't reroll mid-test
    // After a bunch of ticks, x should creep toward 8 but never past it
    for (let i = 0; i < 200; i++) {
      const before = s.x;
      updateSpider(s, 16);
      assertTrue(s.x >= before - 1e-9, 'x should not retreat');
      assertTrue(s.x <= 8 + 1e-9, 'x should not overshoot target');
    }
  });

  test('spawnSpiders returns N positioned spiders', () => {
    const ss = spawnSpiders(7);
    assertEquals(ss.length, 7);
    for (const s of ss) {
      assertTrue(typeof s.x === 'number');
      assertTrue(s.x >= 0 && s.x <= 10, `x ${s.x} out of tower range`);
    }
  });
});

describe('spider: touch detection + slow', () => {
  test('not touched if not on the spider floor', () => {
    const ss = [createSpider(5)];
    assertTrue(!isTouchedBySpider(ss, /*floor*/ 5, /*x*/ 5));
    assertEquals(spiderSlowFactor(ss, 5, 5), 1);
  });

  test('touched if on the spider floor and within radius', () => {
    const ss = [createSpider(5)];
    assertTrue(isTouchedBySpider(ss, SPIDER_FLOOR_INDEX, 5));                       // exact
    assertTrue(isTouchedBySpider(ss, SPIDER_FLOOR_INDEX, 5 + SPIDER_TOUCH_RADIUS * 0.9));
  });

  test('not touched if beyond radius', () => {
    const ss = [createSpider(5)];
    assertTrue(!isTouchedBySpider(ss, SPIDER_FLOOR_INDEX, 5 + SPIDER_TOUCH_RADIUS + 0.1));
  });

  test('slow factor matches the touch result', () => {
    const ss = [createSpider(5)];
    assertEquals(spiderSlowFactor(ss, SPIDER_FLOOR_INDEX, 5), SPIDER_SLOW_FACTOR);
    assertEquals(spiderSlowFactor(ss, SPIDER_FLOOR_INDEX, 9), 1);
  });

  test('empty spider list is never a touch', () => {
    assertEquals(spiderSlowFactor([], SPIDER_FLOOR_INDEX, 5), 1);
    assertEquals(spiderSlowFactor(null, SPIDER_FLOOR_INDEX, 5), 1);
  });
});
