import { LOBBY_INDEX, CORRIDOR_WIDTH_UNITS, WALL_WIDTH_UNITS } from './config.js';

export function createPlayer() {
  return {
    floor: LOBBY_INDEX,
    xOffset: WALL_WIDTH_UNITS + CORRIDOR_WIDTH_UNITS / 2,  // middle of left corridor
    state: 'IDLE',  // 'IDLE' | 'SLIDING' | 'IN_ELEVATOR'
  };
}

// Hidden when IN_ELEVATOR with closed doors. doorProgress > 0 means
// the doors are at least partially open and the figure is visible.
export function isPlayerVisible(player, elevator) {
  if (player.state !== 'IN_ELEVATOR') return true;
  return elevator.doorProgress > 0;
}
