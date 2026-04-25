import {
  FLOOR_LABELS,
  UNDERGROUND_FLOOR_LABELS,
  OFFICE_VARIANTS,
  BASEMENT_VARIANT,
  LOBBY_VARIANT,
} from './config.js';
import { createRng, pickRandom } from './rng.js';

export function buildTower(seed) {
  const rng = createRng(seed);
  const floors = FLOOR_LABELS.map((label, index) => {
    const isUnderground = UNDERGROUND_FLOOR_LABELS.has(label);
    let tileVariant;
    if (label === 'L') tileVariant = LOBBY_VARIANT;
    else if (isUnderground) tileVariant = BASEMENT_VARIANT;
    else tileVariant = pickRandom(rng, OFFICE_VARIANTS);
    return { index, label, isUnderground, tileVariant, contents: [] };
  });
  return { floors, seed };
}
