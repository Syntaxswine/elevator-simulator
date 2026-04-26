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
    carCalls: new Set(),    // every pending stop the dispatcher must visit
    playerCalls: new Set(), // subset of carCalls added by the player via the
                            //   keypad / shaft tap. Used for lit-button display
                            //   so an in-elevator NPC's destination doesn't
                            //   light the keypad with no visible waiter.
    upCalls: new Set(),
    downCalls: new Set(),
    doorProgress: 0,
    dwellRemainingMs: 0,
    emergencyStopped: false,
  };
}

// Latched emergency stop. Freezes the entire car — motion, doors, dwell timer
// — until released. Calls keep accumulating; the dispatcher resumes from
// wherever it was when released.
export function toggleEmergencyStop(elevator) {
  elevator.emergencyStopped = !elevator.emergencyStopped;
}

// External hall call from a floor (NPCs press these — the player presses
// the modal which uses carCalls).
export function hallCall(elevator, floorIndex, direction) {
  if (floorIndex < 0 || floorIndex >= FLOOR_COUNT) return;
  if (direction === 'UP') elevator.upCalls.add(floorIndex);
  else if (direction === 'DOWN') elevator.downCalls.add(floorIndex);
}

// Floor whose y-band the elevator's bottom currently sits in (0..11).
export function getCurrentFloor(elevator) {
  return clamp(Math.floor(elevator.position + 1e-9), 0, FLOOR_COUNT - 1);
}

// Whether a keypad floor button should be lit. Hall calls (someone on
// that floor pressing up/down) and player-pressed buttons both light;
// in-elevator NPCs' destinations stay dark so the panel reads as "who
// is asking for service" rather than "what stops are queued."
export function isFloorCalled(elevator, floorIndex) {
  return elevator.upCalls.has(floorIndex) ||
         elevator.downCalls.has(floorIndex) ||
         elevator.playerCalls.has(floorIndex);
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
    elevator.upCalls.delete(floorIndex);
    elevator.downCalls.delete(floorIndex);
    elevator.playerCalls.delete(floorIndex);
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
  elevator.playerCalls.add(floorIndex);     // lit on the keypad until serviced
}

function pickNextTarget(elevator) {
  if (elevator.carCalls.size === 0 &&
      elevator.upCalls.size === 0 &&
      elevator.downCalls.size === 0) {
    return null;
  }
  const pos = elevator.position;
  const eps = ARRIVAL_EPSILON;

  if (elevator.direction === 'UP') {
    // Same-direction service: carCalls + upCalls strictly above us
    const sameDir = [];
    for (const c of elevator.carCalls) if (c > pos + eps) sameDir.push(c);
    for (const c of elevator.upCalls) if (c > pos + eps) sameDir.push(c);
    if (sameDir.length > 0) return Math.min(...sameDir);

    // Turnaround: highest down-call still above us — go up to it then reverse
    const downAbove = [];
    for (const c of elevator.downCalls) if (c > pos + eps) downAbove.push(c);
    if (downAbove.length > 0) return Math.max(...downAbove);

    // Nothing left going up — flip direction and try the other side
    elevator.direction = 'DOWN';
    return pickNextTarget(elevator);
  }

  if (elevator.direction === 'DOWN') {
    const sameDir = [];
    for (const c of elevator.carCalls) if (c < pos - eps) sameDir.push(c);
    for (const c of elevator.downCalls) if (c < pos - eps) sameDir.push(c);
    if (sameDir.length > 0) return Math.max(...sameDir);

    const upBelow = [];
    for (const c of elevator.upCalls) if (c < pos - eps) upBelow.push(c);
    if (upBelow.length > 0) return Math.min(...upBelow);

    elevator.direction = 'UP';
    return pickNextTarget(elevator);
  }

  // NONE: prefer a call whose direction matches the trip we'd take to
  // reach it. Otherwise we pick e.g. an upCall below us, head DOWN to
  // it, and find ourselves stopped at a floor where the rider can't
  // board because we're committed to the wrong direction. (Reported
  // by playtest.)
  let bestTarget = null, bestDist = Infinity, bestDir = null;
  function consider(floor, dir) {
    const dist = Math.abs(floor - pos);
    if (dist < bestDist) { bestDist = dist; bestTarget = floor; bestDir = dir; }
  }
  // 1. Calls at the current floor — open doors here, no trip needed.
  for (const c of elevator.carCalls)  if (Math.abs(c - pos) < eps) return c;
  for (const c of elevator.upCalls)   if (Math.abs(c - pos) < eps) return c;
  for (const c of elevator.downCalls) if (Math.abs(c - pos) < eps) return c;
  // 2. Naturally-served calls (call's direction matches the trip direction):
  //    going UP serves carCalls + upCalls above us;
  //    going DOWN serves carCalls + downCalls below us.
  for (const c of elevator.carCalls)  { if (c > pos + eps) consider(c, 'UP'); else if (c < pos - eps) consider(c, 'DOWN'); }
  for (const c of elevator.upCalls)   if (c > pos + eps) consider(c, 'UP');
  for (const c of elevator.downCalls) if (c < pos - eps) consider(c, 'DOWN');
  if (bestTarget !== null) { elevator.direction = bestDir; return bestTarget; }
  // 3. Only turnaround targets remain — go to the closest one and serve
  //    it as the apex of the trip, then flip on arrival.
  for (const c of elevator.downCalls) if (c > pos + eps) consider(c, 'UP');
  for (const c of elevator.upCalls)   if (c < pos - eps) consider(c, 'DOWN');
  if (bestTarget !== null) { elevator.direction = bestDir; return bestTarget; }
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
  if (elevator.emergencyStopped) return;
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
        elevator.upCalls.delete(elevator.target);
        elevator.downCalls.delete(elevator.target);
        elevator.playerCalls.delete(elevator.target);
        elevator.target = null;

        // Turnaround at apex / nadir: if nothing remains in the current
        // direction (no carCalls or same-direction hall-calls strictly past
        // us), set direction = NONE so riders of EITHER direction can board
        // this stop. The next pickNextTarget after doors close picks the
        // new trip direction from whatever's left. Note: outright FLIPPING
        // here was wrong — it lets opposite-direction riders board (good)
        // but blocks same-direction riders who'd been waiting for this very
        // call (bad). NONE serves both.
        const wasUp = elevator.state === 'MOVING_UP';
        const sameDirHallCalls = wasUp ? elevator.upCalls : elevator.downCalls;
        const past = (c) => wasUp ? c > elevator.position + ARRIVAL_EPSILON
                                  : c < elevator.position - ARRIVAL_EPSILON;
        let hasMoreSameDir = false;
        for (const c of elevator.carCalls)     if (past(c)) { hasMoreSameDir = true; break; }
        if (!hasMoreSameDir) {
          for (const c of sameDirHallCalls)    if (past(c)) { hasMoreSameDir = true; break; }
        }
        if (!hasMoreSameDir) {
          elevator.direction = 'NONE';
        }

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
