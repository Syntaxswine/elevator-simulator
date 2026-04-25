import { LOBBY_INDEX, SHAFT_LEFT_X, CORRIDOR_WIDTH_UNITS, WALL_WIDTH_UNITS } from './config.js';

export function createPlayer() {
  return {
    floor: LOBBY_INDEX,
    // Default position: middle of the left corridor
    xOffset: WALL_WIDTH_UNITS + CORRIDOR_WIDTH_UNITS / 2,  // 2.5 units from tower-left
    state: 'IDLE',  // 'IDLE' | 'SLIDING' | 'IN_ELEVATOR'
  };
}

// True if the player should be drawn this frame.
// Hidden when IN_ELEVATOR with closed doors.
export function isPlayerVisible(player, elevator) {
  if (player.state !== 'IN_ELEVATOR') return true;
  return elevator.doorState === 'OPEN' || elevator.doorState === 'OPENING' || elevator.doorState === 'CLOSING';
}
