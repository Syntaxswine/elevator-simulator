import {
  LOBBY_INDEX,
  CORRIDOR_WIDTH_UNITS,
  WALL_WIDTH_UNITS,
  SHAFT_LEFT_X,
  SHAFT_WIDTH_UNITS,
  PLAYER_SPEED,
  PLAYER_X_MIN,
  PLAYER_X_MAX,
  HELL_VARIANT,
} from './config.js';
import { getCurrentFloor } from './elevator.js';

export function createPlayer() {
  return {
    floor: LOBBY_INDEX,
    xOffset: WALL_WIDTH_UNITS + CORRIDOR_WIDTH_UNITS / 2,  // middle of left corridor
    targetXOffset: WALL_WIDTH_UNITS + CORRIDOR_WIDTH_UNITS / 2,
    state: 'IDLE',  // 'IDLE' | 'SLIDING' | 'IN_ELEVATOR'
    hellExposed: false,
  };
}

// Hidden when IN_ELEVATOR with closed doors. doorProgress > 0 means
// the doors are at least partially open and the figure is visible.
export function isPlayerVisible(player, elevator) {
  if (player.state !== 'IN_ELEVATOR') return true;
  return elevator.doorProgress > 0;
}

// Tap-to-walk: set a horizontal target on the player's current floor.
// No-op if player is in the elevator.
export function setWalkTarget(player, x) {
  if (player.state === 'IN_ELEVATOR') return;
  player.targetXOffset = clamp(x, PLAYER_X_MIN, PLAYER_X_MAX);
  player.state = 'SLIDING';
}

// Toggle player into / out of the elevator. Requires the elevator stopped
// at a floor with doors open. Entering: must be on the same floor.
// Exiting: emerges at the shaft position on whatever floor the car is at.
export function toggleInOut(player, elevator) {
  if (elevator.state !== 'DOORS_OPEN') return;
  const elevFloor = getCurrentFloor(elevator);

  if (player.state === 'IN_ELEVATOR') {
    player.state = 'IDLE';
    player.floor = elevFloor;
    player.xOffset = SHAFT_LEFT_X + SHAFT_WIDTH_UNITS / 2;
    player.targetXOffset = player.xOffset;
  } else {
    if (player.floor !== elevFloor) return;
    player.state = 'IN_ELEVATOR';
  }
}

export function updatePlayer(player, dt, elevator = null, tower = null) {
  // Hell exposure: same rule as NPCs — sticky red when standing on
  // the hell floor or seeing it through open elevator doors.
  if (!player.hellExposed && tower?.floors?.[0]?.tileVariant === HELL_VARIANT) {
    if (player.state === 'IN_ELEVATOR') {
      if (elevator && Math.floor(elevator.position) === 0 && elevator.doorProgress > 0) {
        player.hellExposed = true;
      }
    } else if (player.floor === 0) {
      player.hellExposed = true;
    }
  }

  if (player.state !== 'SLIDING') return;
  const dtSec = dt / 1000;
  const moveAmount = PLAYER_SPEED * dtSec;
  const remaining = player.targetXOffset - player.xOffset;
  if (Math.abs(remaining) <= moveAmount) {
    player.xOffset = player.targetXOffset;
    player.state = 'IDLE';
  } else {
    player.xOffset += Math.sign(remaining) * moveAmount;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
