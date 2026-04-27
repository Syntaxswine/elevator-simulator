// spider.js — wandering spiders on the spider floor.
//
// Spiders are simple entities: an x-position on the spider floor (no
// vertical motion, no elevator interaction). They wander between random
// targets at a slow pace. Any rider whose horizontal position falls
// within SPIDER_TOUCH_RADIUS of a spider on the same floor moves at
// SPIDER_SLOW_FACTOR speed.
//
// Drawn as black "*" glyphs in the renderer — no sprite asset needed.

import {
  PLAYER_X_MIN,
  PLAYER_X_MAX,
  SPIDER_COUNT,
  SPIDER_SPEED,
  SPIDER_TOUCH_RADIUS,
  SPIDER_SLOW_FACTOR,
  SPIDER_FLOOR_INDEX,
} from './config.js';

let nextId = 1;

export function createSpider(x) {
  return {
    id: nextId++,
    x,
    targetX: x,
    nextPickMs: 0,           // time until a fresh wandering target is picked
  };
}

export function spawnSpiders(count = SPIDER_COUNT) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = PLAYER_X_MIN + Math.random() * (PLAYER_X_MAX - PLAYER_X_MIN);
    out.push(createSpider(x));
  }
  return out;
}

export function updateSpider(spider, dt) {
  spider.nextPickMs -= dt;
  if (spider.nextPickMs <= 0 || Math.abs(spider.targetX - spider.x) < 0.01) {
    spider.targetX = PLAYER_X_MIN + Math.random() * (PLAYER_X_MAX - PLAYER_X_MIN);
    spider.nextPickMs = 1500 + Math.random() * 4000;   // 1.5 - 5.5s before next reroll
  }
  const dtSec = dt / 1000;
  const moveAmount = SPIDER_SPEED * dtSec;
  const remaining = spider.targetX - spider.x;
  if (Math.abs(remaining) <= moveAmount) {
    spider.x = spider.targetX;
  } else {
    spider.x += Math.sign(remaining) * moveAmount;
  }
}

// True iff (floor, x) is within touch radius of any spider — and the
// floor is actually the spider floor (spiders only live there).
export function isTouchedBySpider(spiders, floor, x) {
  if (!spiders || spiders.length === 0) return false;
  if (floor !== SPIDER_FLOOR_INDEX) return false;
  for (const s of spiders) {
    if (Math.abs(s.x - x) < SPIDER_TOUCH_RADIUS) return true;
  }
  return false;
}

// Multiplier to apply to a movement step when a rider/player is at
// (floor, x). 1 = unaffected, < 1 = slowed.
export function spiderSlowFactor(spiders, floor, x) {
  return isTouchedBySpider(spiders, floor, x) ? SPIDER_SLOW_FACTOR : 1;
}
