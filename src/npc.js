import {
  SHAFT_LEFT_X,
  SHAFT_WIDTH_UNITS,
  PLAYER_SPEED,
  PLAYER_X_MIN,
  PLAYER_X_MAX,
  FLOOR_COUNT,
} from './config.js';
import { getCurrentFloor, hallCall } from './elevator.js';

const NPC_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#22c0c0', '#f032e6', '#94d600', '#ffaa66',
  '#fabed4', '#469990', '#dcbeff', '#9a6324', '#fffac8',
];

const SHAFT_CENTER = SHAFT_LEFT_X + SHAFT_WIDTH_UNITS / 2;        // 5.0
const NPC_SPEED = PLAYER_SPEED * 0.7;
const NPC_BOARD_X_RANGE = 0.6;   // NPCs spread within +/- 0.3u of shaft center while in elevator

let nextId = 1;

export function createNpc(floor, destination) {
  const id = nextId++;
  return {
    id,
    color: NPC_COLORS[id % NPC_COLORS.length],
    floor,
    destination,
    xOffset: Math.random() < 0.5 ? PLAYER_X_MIN : PLAYER_X_MAX,
    targetXOffset: SHAFT_CENTER,            // walk to the elevator door
    state: 'WALKING_TO_ELEVATOR',           // | 'WAITING' | 'IN_ELEVATOR' | 'EXITING' | 'DESPAWNING'
  };
}

export function spawnRandomNpc() {
  const start = Math.floor(Math.random() * FLOOR_COUNT);
  let dest = Math.floor(Math.random() * FLOOR_COUNT);
  while (dest === start) dest = Math.floor(Math.random() * FLOOR_COUNT);
  return createNpc(start, dest);
}

export function updateNpc(npc, dt, elevator) {
  const dtSec = dt / 1000;
  const moveAmount = NPC_SPEED * dtSec;

  switch (npc.state) {
    case 'WALKING_TO_ELEVATOR':
      stepToward(npc, moveAmount);
      if (atTarget(npc)) {
        npc.state = 'WAITING';
        const direction = npc.destination > npc.floor ? 'UP' : 'DOWN';
        hallCall(elevator, npc.floor, direction);
      }
      break;

    case 'WAITING': {
      if (canBoard(npc, elevator)) {
        npc.state = 'IN_ELEVATOR';
        elevator.carCalls.add(npc.destination);
      } else {
        // Re-press hall call if it got cleared without us boarding
        // (e.g. opposite-direction stop during a turnaround).
        const direction = npc.destination > npc.floor ? 'UP' : 'DOWN';
        const set = direction === 'UP' ? elevator.upCalls : elevator.downCalls;
        if (!set.has(npc.floor)) hallCall(elevator, npc.floor, direction);
      }
      break;
    }

    case 'IN_ELEVATOR':
      if (getCurrentFloor(elevator) === npc.destination &&
          elevator.state === 'DOORS_OPEN' &&
          elevator.doorProgress >= 0.95) {
        npc.state = 'EXITING';
        npc.floor = npc.destination;
        npc.xOffset = SHAFT_CENTER;
        npc.targetXOffset = Math.random() < 0.5 ? PLAYER_X_MIN : PLAYER_X_MAX;
      }
      break;

    case 'EXITING':
      stepToward(npc, moveAmount);
      if (atTarget(npc)) npc.state = 'DESPAWNING';
      break;

    case 'DESPAWNING':
      // Removed by the main loop's filter
      break;
  }
}

// True iff the NPC sprite should be drawn this frame.
export function isNpcVisible(npc, elevator) {
  if (npc.state === 'DESPAWNING') return false;
  if (npc.state === 'IN_ELEVATOR') return elevator.doorProgress > 0;
  return true;
}

// Render position helpers — used by render.js to handle the in-elevator case.
export function npcRenderXUnits(npc, indexInElevator = 0) {
  if (npc.state === 'IN_ELEVATOR') {
    // Spread multiple riders within the shaft tile
    const offset = (indexInElevator - 0.5) * (NPC_BOARD_X_RANGE / 2);
    return SHAFT_CENTER + offset;
  }
  return npc.xOffset;
}

export function npcRenderFloor(npc, elevator) {
  if (npc.state === 'IN_ELEVATOR') return elevator.position;
  return npc.floor;
}

function stepToward(npc, amount) {
  const remaining = npc.targetXOffset - npc.xOffset;
  if (Math.abs(remaining) <= amount) {
    npc.xOffset = npc.targetXOffset;
  } else {
    npc.xOffset += Math.sign(remaining) * amount;
  }
}

function atTarget(npc) {
  return Math.abs(npc.targetXOffset - npc.xOffset) < 0.01;
}

function canBoard(npc, elevator) {
  if (elevator.state !== 'DOORS_OPEN') return false;
  if (getCurrentFloor(elevator) !== npc.floor) return false;
  if (elevator.doorProgress < 0.9) return false;
  const npcDir = npc.destination > npc.floor ? 'UP' : 'DOWN';
  return elevator.direction === 'NONE' || elevator.direction === npcDir;
}
