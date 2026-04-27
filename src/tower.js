import {
  FLOOR_LABELS,
  UNDERGROUND_FLOOR_LABELS,
  OFFICE_VARIANTS,
  RESTAURANT_VARIANTS,
  RESTAURANT_COUNT_CHOICES,
  BASEMENT_VARIANT,
  LOBBY_VARIANT,
  HELL_VARIANT,
  HELL_LABEL,
  SPIDER_VARIANT,
} from './config.js';
import { createRng, pickRandom } from './rng.js';

// buildTower(seed, options)
//   options.includeRestaurants — when true, the tower places 0, 2, or 4
//     unique restaurant tiles on randomly chosen above-ground non-lobby
//     floors. Count and placement are seeded so the same seed produces
//     the same building.
//   options.includeHell — when true, the SB sub-basement floor is
//     replaced by a hellscape (different tile + label "HELL"). Future
//     home of enemy spawns.
//   options.includeSpiders — when true, the B basement floor becomes
//     the spider basement (tile change only; label stays "B"). Spiders
//     spawn there and slow anyone they touch.
export function buildTower(seed, options = {}) {
  const includeRestaurants = !!options.includeRestaurants;
  const includeHell = !!options.includeHell;
  const includeSpiders = !!options.includeSpiders;
  const rng = createRng(seed);

  // Above-ground non-lobby floor indices — the slots that vary
  const officeFloorIndices = [];
  FLOOR_LABELS.forEach((label, index) => {
    if (label !== 'L' && !UNDERGROUND_FLOOR_LABELS.has(label)) {
      officeFloorIndices.push(index);
    }
  });

  // Pre-place restaurants if enabled
  const restaurantPlacements = new Map();   // floorIndex → variant name
  if (includeRestaurants) {
    const count = pickRandom(rng, RESTAURANT_COUNT_CHOICES);
    if (count > 0) {
      const restaurants = takeRandom(rng, RESTAURANT_VARIANTS, count);
      const floors = takeRandom(rng, officeFloorIndices, count);
      for (let i = 0; i < count; i++) {
        restaurantPlacements.set(floors[i], restaurants[i]);
      }
    }
  }

  const floors = FLOOR_LABELS.map((label, index) => {
    const isUnderground = UNDERGROUND_FLOOR_LABELS.has(label);
    let tileVariant;
    let displayLabel = label;
    if (label === 'SB' && includeHell) {
      tileVariant = HELL_VARIANT;
      displayLabel = HELL_LABEL;
    }
    else if (label === 'B' && includeSpiders) tileVariant = SPIDER_VARIANT;
    else if (label === 'L') tileVariant = LOBBY_VARIANT;
    else if (isUnderground) tileVariant = BASEMENT_VARIANT;
    else if (restaurantPlacements.has(index)) tileVariant = restaurantPlacements.get(index);
    else tileVariant = pickRandom(rng, OFFICE_VARIANTS);
    return { index, label: displayLabel, isUnderground, tileVariant, contents: [] };
  });
  return { floors, seed };
}

// Returns `n` unique items drawn from `arr` using the seeded rng.
// Partial Fisher-Yates: shuffle the last n positions and slice them off.
function takeRandom(rng, arr, n) {
  const a = [...arr];
  const result = [];
  for (let i = 0; i < n && a.length > 0; i++) {
    const j = Math.floor(rng() * a.length);
    result.push(a.splice(j, 1)[0]);
  }
  return result;
}
