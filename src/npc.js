import {
  SHAFT_LEFT_X,
  SHAFT_WIDTH_UNITS,
  PLAYER_SPEED,
  PLAYER_X_MIN,
  PLAYER_X_MAX,
  FLOOR_COUNT,
  WORKER_COLOR,
} from './config.js';
import { getCurrentFloor, hallCall } from './elevator.js';

const NPC_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#22c0c0', '#f032e6', '#94d600', '#ffaa66',
  '#fabed4', '#469990', '#dcbeff', '#9a6324', '#fffac8',
];

const SHAFT_CENTER = SHAFT_LEFT_X + SHAFT_WIDTH_UNITS / 2;        // 5.0
const NPC_SPEED = PLAYER_SPEED * 0.7;
// In-elevator riders cluster in a 3-column grid; columns spaced so figures
// don't overlap (each figure is ~0.18u wide at half-size).
const NPC_BOARD_COLS = 3;
const NPC_BOARD_COL_SPACING = 0.25;

let nextId = 1;

export function createNpc(floor, destination, now = performance.now()) {
  const id = nextId++;
  return {
    id,
    color: NPC_COLORS[id % NPC_COLORS.length],
    floor,
    destination,
    xOffset: Math.random() < 0.5 ? PLAYER_X_MIN : PLAYER_X_MAX,
    targetXOffset: SHAFT_CENTER,
    state: 'WALKING_TO_ELEVATOR',     // | 'WAITING' | 'IN_ELEVATOR' | 'EXITING' | 'WORKING' | 'DESPAWNING'
    type: 'casual',                   // | 'worker'
    tripStartTime: now,               // for anger / arrival-time tracking
    arrivedAt: null,                  // set when worker reaches AT_WORK
    metricRecorded: false,
  };
}

export function spawnRandomNpc() {
  const start = Math.floor(Math.random() * FLOOR_COUNT);
  let dest = Math.floor(Math.random() * FLOOR_COUNT);
  while (dest === start) dest = Math.floor(Math.random() * FLOOR_COUNT);
  return createNpc(start, dest);
}

// Workers cycle: arrive from a ground floor (SB/B/L) → office → AT_WORK
// → depart back to a ground floor on the next departure rush.
const GROUND_FLOORS = [0, 1, 2];           // SB, B, L
const OFFICE_FLOORS = [3, 4, 5, 6, 7, 8, 9, 10, 11];   // labels "2"-"10"

export function createWorker(now = performance.now()) {
  const id = nextId++;
  const homeFloor = GROUND_FLOORS[Math.floor(Math.random() * GROUND_FLOORS.length)];
  const office = OFFICE_FLOORS[Math.floor(Math.random() * OFFICE_FLOORS.length)];
  return {
    id,
    color: WORKER_COLOR,
    floor: homeFloor,
    destination: office,
    xOffset: Math.random() < 0.5 ? PLAYER_X_MIN : PLAYER_X_MAX,
    targetXOffset: SHAFT_CENTER,
    state: 'WALKING_TO_ELEVATOR',
    type: 'worker',
    phase: 'ARRIVING',                // | 'AT_WORK' | 'DEPARTING'
    homeFloor,
    office,
    tripStartTime: now,               // resets on departure
    arrivedAt: null,
    metricRecorded: false,
  };
}

// Called at the start of a departure rush: every worker that's AT_WORK
// gets sent back home. Resets tripStartTime so anger is measured from
// the moment they leave their desk, not from their original arrival.
export function startDeparture(worker, now = performance.now()) {
  if (worker.type !== 'worker' || worker.phase !== 'AT_WORK') return;
  worker.phase = 'DEPARTING';
  worker.destination = worker.homeFloor;
  worker.state = 'WALKING_TO_ELEVATOR';
  worker.targetXOffset = SHAFT_CENTER;
  worker.tripStartTime = now;
  worker.arrivedAt = null;
}

export function updateNpc(npc, dt, elevator, now = performance.now()) {
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
      if (atTarget(npc)) {
        // Workers arriving at their office stick around as WORKING.
        // Departing workers and casual riders both despawn at the corridor end.
        if (npc.type === 'worker' && npc.phase === 'ARRIVING') {
          npc.state = 'WORKING';
          npc.phase = 'AT_WORK';
          npc.arrivedAt = now;       // for metrics; main.js picks this up
        } else {
          npc.state = 'DESPAWNING';
        }
      }
      break;

    case 'WORKING':
      // Idle at the office until a departure rush sends them home.
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
  return true;  // WALKING_TO_ELEVATOR, WAITING, EXITING, WORKING all visible
}

// Render position helpers — used by render.js to handle the in-elevator case.
export function npcRenderXUnits(npc, indexInElevator = 0) {
  if (npc.state === 'IN_ELEVATOR') {
    const col = indexInElevator % NPC_BOARD_COLS;
    const offset = (col - (NPC_BOARD_COLS - 1) / 2) * NPC_BOARD_COL_SPACING;
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
