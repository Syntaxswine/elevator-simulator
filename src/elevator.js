import {
  LOBBY_INDEX,
  FLOOR_COUNT,
  ELEVATOR_SPEED,
  DOOR_TRANSITION_MS,
  DOOR_DWELL_MS,
  ARRIVAL_EPSILON,
} from './config.js';

// Full state machine + collective-selective dispatcher.
//
// States: IDLE | MOVING_UP | MOVING_DOWN | DOORS_OPENING | DOORS_OPEN | DOORS_CLOSING
// Direction: UP | DOWN | NONE
// position: continuous y in tower-units, 0 = bottom of SB, 11 = bottom of "10"
// doorProgress: 0 = closed, 1 = fully open
//
// Collective-selective: when traveling UP, service all calls in ascending
// floor order before reversing; same for DOWN in descending order.

export function createElevator() {
  return {
    state: 'IDLE',
    position: LOBBY_INDEX,
    direction: 'NONE',
    target: null,
    carCalls: new Set(),
    doorProgress: 0,
    dwellRemainingMs: 0,
  };
}

// Floor whose y-band the elevator's bottom currently sits in (0..11).
export function getCurrentFloor(elevator) {
  return clamp(Math.floor(elevator.position + 1e-9), 0, FLOOR_COUNT - 1);
}

// Whether a floor button should be lit (queued or about-to-be-serviced).
export function isFloorCalled(elevator, floorIndex) {
  return elevator.carCalls.has(floorIndex) || elevator.target === floorIndex;
}

// Player taps the Open/Close button. Toggles between opening and closing
// based on current state. Real elevators let you reverse mid-animation.
// No-op while moving.
export function toggleDoor(elevator) {
  switch (elevator.state) {
    case 'IDLE':
      transitionTo(elevator, 'DOORS_OPENING');
      break;
    case 'DOORS_OPEN':
      transitionTo(elevator, 'DOORS_CLOSING');
      break;
    case 'DOORS_OPENING':
      elevator.state = 'DOORS_CLOSING';
      break;
    case 'DOORS_CLOSING':
      elevator.state = 'DOORS_OPENING';
      break;
    case 'MOVING_UP':
    case 'MOVING_DOWN':
      // Cannot open doors while moving
      break;
  }
}

// Player presses a floor button.
export function processCall(elevator, floorIndex) {
  if (floorIndex < 0 || floorIndex >= FLOOR_COUNT) return;

  // If we're stopped at exactly that floor and idle, just open the doors.
  if (elevator.state === 'IDLE' &&
      Math.abs(elevator.position - floorIndex) < ARRIVAL_EPSILON) {
    elevator.position = floorIndex;
    transitionTo(elevator, 'DOORS_OPENING');
    return;
  }
  // Already at this floor with doors opening / open → reset dwell so it stays open.
  if ((elevator.state === 'DOORS_OPEN' || elevator.state === 'DOORS_OPENING') &&
      getCurrentFloor(elevator) === floorIndex) {
    elevator.dwellRemainingMs = DOOR_DWELL_MS;
    return;
  }
  elevator.carCalls.add(floorIndex);
}

function pickNextTarget(elevator) {
  const calls = [...elevator.carCalls];
  if (calls.length === 0) return null;
  const above = calls.filter(c => c > elevator.position + ARRIVAL_EPSILON).sort((a, b) => a - b);
  const below = calls.filter(c => c < elevator.position - ARRIVAL_EPSILON).sort((a, b) => b - a);

  if (elevator.direction === 'UP') {
    if (above.length > 0) return above[0];
    if (below.length > 0) { elevator.direction = 'DOWN'; return below[0]; }
  } else if (elevator.direction === 'DOWN') {
    if (below.length > 0) return below[0];
    if (above.length > 0) { elevator.direction = 'UP'; return above[0]; }
  } else {
    // NONE: pick the closest pending call and choose direction to match.
    const closest = [...calls].sort(
      (a, b) => Math.abs(a - elevator.position) - Math.abs(b - elevator.position)
    )[0];
    elevator.direction = closest > elevator.position ? 'UP' : 'DOWN';
    return closest;
  }
  return null;
}

function transitionTo(elevator, state) {
  elevator.state = state;
  if (state === 'DOORS_OPENING') {
    // doorProgress keeps its current value; the update tick advances toward 1
  } else if (state === 'DOORS_CLOSING') {
    // doorProgress keeps its current value; the update tick advances toward 0
  } else if (state === 'DOORS_OPEN') {
    elevator.doorProgress = 1;
    elevator.dwellRemainingMs = DOOR_DWELL_MS;
  } else if (state === 'IDLE') {
    elevator.direction = 'NONE';
    elevator.doorProgress = 0;
    elevator.target = null;
  }
}

export function updateElevator(elevator, dt) {
  const dtSec = dt / 1000;

  switch (elevator.state) {
    case 'IDLE': {
      const target = pickNextTarget(elevator);
      if (target !== null) {
        elevator.target = target;
        elevator.state = target > elevator.position ? 'MOVING_UP' : 'MOVING_DOWN';
      }
      break;
    }

    case 'MOVING_UP':
    case 'MOVING_DOWN': {
      // Don't blindly re-pick target each tick — that breaks the final
      // approach (pickNextTarget filters with `c > position`, so as
      // position closes in on target, the target falls out of the
      // "ahead-of-us" set and gets skipped). Instead: keep the current
      // target, and only swap it for an *intervening* same-direction
      // call that's closer than the current target.
      if (elevator.target === null) {
        const t = pickNextTarget(elevator);
        if (t === null) { transitionTo(elevator, 'IDLE'); break; }
        elevator.target = t;
      }

      const moveDir = elevator.state === 'MOVING_UP' ? 1 : -1;
      // Collective-selective mid-trip: closer same-direction call wins.
      for (const c of elevator.carCalls) {
        if (moveDir > 0 && c > elevator.position && c < elevator.target) {
          elevator.target = c;
        } else if (moveDir < 0 && c < elevator.position && c > elevator.target) {
          elevator.target = c;
        }
      }

      const remaining = elevator.target - elevator.position;
      const moveAmount = ELEVATOR_SPEED * dtSec;
      if (moveAmount >= Math.abs(remaining)) {
        elevator.position = elevator.target;
        elevator.carCalls.delete(elevator.target);
        elevator.target = null;
        transitionTo(elevator, 'DOORS_OPENING');
      } else {
        elevator.position += moveDir * moveAmount;
      }
      break;
    }

    case 'DOORS_OPENING': {
      elevator.doorProgress += (dt / DOOR_TRANSITION_MS);
      if (elevator.doorProgress >= 1) {
        elevator.doorProgress = 1;
        transitionTo(elevator, 'DOORS_OPEN');
      }
      break;
    }

    case 'DOORS_OPEN': {
      elevator.dwellRemainingMs -= dt;
      if (elevator.dwellRemainingMs <= 0) {
        transitionTo(elevator, 'DOORS_CLOSING');
      }
      break;
    }

    case 'DOORS_CLOSING': {
      elevator.doorProgress -= (dt / DOOR_TRANSITION_MS);
      if (elevator.doorProgress <= 0) {
        elevator.doorProgress = 0;
        const target = pickNextTarget(elevator);
        if (target !== null) {
          elevator.target = target;
          elevator.state = target > elevator.position ? 'MOVING_UP' : 'MOVING_DOWN';
        } else {
          transitionTo(elevator, 'IDLE');
        }
      }
      break;
    }
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
