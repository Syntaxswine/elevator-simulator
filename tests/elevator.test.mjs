// elevator.test.mjs — state machine + collective-selective dispatcher.
//
// This is the most important file. The elevator's logic is what
// players notice first when something feels wrong. Every dispatcher
// bug we've shipped + later caught lives here as a regression test
// — see the `regression:` blocks below.
//
// HOW WE TEST TIME-DRIVEN LOGIC
// -----------------------------
// updateElevator(state, dt) is called by the game loop every frame
// with a delta in milliseconds. We can drive the state machine
// deterministically by calling it ourselves with whatever dt we want.
// The `tick()` helper steps in 16ms increments (matching ~60fps) so
// behavior matches what the player sees. `runUntil()` keeps ticking
// until a predicate is true (or we time out), which is the workhorse
// for "how does this scenario eventually resolve" tests.

import {
  describe, test, assertEquals, assertNear, assertTrue, assertSetEquals,
} from './runner.mjs';
import {
  createElevator,
  updateElevator,
  processCall,
  hallCall,
  toggleDoor,
  toggleEmergencyStop,
  getCurrentFloor,
  isFloorCalled,
} from '../src/elevator.js';

const TICK_MS = 16;
const TIMEOUT_MS = 60_000;

function tick(elevator, ms) {
  while (ms > 0) {
    const dt = Math.min(TICK_MS, ms);
    updateElevator(elevator, dt);
    ms -= dt;
  }
}

function runUntil(elevator, predicate, label = 'predicate') {
  let elapsed = 0;
  while (elapsed < TIMEOUT_MS) {
    updateElevator(elevator, TICK_MS);
    elapsed += TICK_MS;
    if (predicate(elevator)) return elapsed;
  }
  throw new Error(`Timed out after ${elapsed}ms waiting for: ${label}`);
}

// ----- basic dispatch -------------------------------------------------

describe('elevator: basic dispatch', () => {
  test('idle elevator picks closest pending call and starts moving', () => {
    const e = createElevator();
    e.position = 5;
    processCall(e, 8);
    tick(e, TICK_MS);
    assertEquals(e.state, 'MOVING_UP');
    assertEquals(e.target, 8);
    assertEquals(e.direction, 'UP');
  });

  test('idle car at the same floor as the call just opens its doors', () => {
    const e = createElevator();
    e.position = 5;
    processCall(e, 5);
    // Dispatcher takes one tick to react.
    tick(e, TICK_MS);
    assertTrue(['DOORS_OPENING', 'DOORS_OPEN'].includes(e.state),
      `expected door-opening sequence, got ${e.state}`);
  });

  test('hallCall up adds to upCalls; hallCall down adds to downCalls', () => {
    const e = createElevator();
    hallCall(e, 5, 'UP');
    hallCall(e, 7, 'DOWN');
    assertSetEquals(e.upCalls, [5]);
    assertSetEquals(e.downCalls, [7]);
  });

  test('isFloorCalled lights hall calls and player presses, not bare carCalls', () => {
    // The keypad button is for "who is asking for service." An NPC
    // riding inside the car (carCall but no hall call, no player press)
    // shouldn't light up its destination floor.
    const e = createElevator();
    e.carCalls.add(3);                 // bare carCall (e.g. an in-elevator NPC's destination)
    e.upCalls.add(5);
    e.downCalls.add(8);
    e.playerCalls.add(7);
    assertTrue(!isFloorCalled(e, 3), 'bare carCall should NOT light');
    assertTrue(isFloorCalled(e, 5),  'up hall call should light');
    assertTrue(isFloorCalled(e, 8),  'down hall call should light');
    assertTrue(isFloorCalled(e, 7),  'player call should light');
    assertTrue(!isFloorCalled(e, 1));
  });

  test('processCall adds to playerCalls so the keypad lights up', () => {
    const e = createElevator();
    e.position = 0;
    processCall(e, 7);
    assertTrue(e.playerCalls.has(7));
    assertTrue(isFloorCalled(e, 7));
  });

  test('arrival clears the playerCall along with the carCall', () => {
    const e = createElevator();
    e.position = 0;
    processCall(e, 5);
    runUntil(e, (e) => e.state === 'DOORS_OPEN' && Math.abs(e.position - 5) < 1e-6,
      'arrive at 5');
    assertTrue(!e.playerCalls.has(5), 'playerCall should be cleared on arrival');
    assertTrue(!isFloorCalled(e, 5));
  });
});

// ----- collective-selective ------------------------------------------

describe('elevator: collective-selective ordering', () => {
  test('multiple in-direction calls served in travel order (UP)', () => {
    const e = createElevator();
    e.position = 0;
    processCall(e, 5);
    processCall(e, 3);
    processCall(e, 8);
    const visits = [];
    runUntil(e, (e) => {
      // Record the floor each time the doors finish opening, then continue.
      if (e.state === 'DOORS_OPEN' && (visits.at(-1) ?? -1) !== e.position) {
        visits.push(e.position);
      }
      return e.carCalls.size === 0 && e.state === 'IDLE' && visits.length >= 3;
    }, 'all calls serviced');
    assertEquals(JSON.stringify(visits), JSON.stringify([3, 5, 8]),
      'expected ascending order');
  });

  test('mid-trip same-direction press becomes the new closer target', () => {
    const e = createElevator();
    e.position = 0;
    processCall(e, 9);
    // Wait until we're climbing and well below 5.
    runUntil(e, (e) => e.state === 'MOVING_UP' && e.position > 1);
    processCall(e, 5);  // closer same-direction
    runUntil(e, (e) => e.state === 'DOORS_OPEN', 'first arrival');
    assertEquals(e.position, 5, 'should stop at the inserted floor first');
  });
});

// ----- regressions: bugs we've caught --------------------------------

describe('elevator: regression suite', () => {
  // FIXED in commit 9425ae6. The original pickNextTarget filtered with
  // `c > position`, so as position → target the target itself dropped
  // out of the "ahead-of-us" set and the dispatcher would re-target the
  // next floor up, blowing past the intended stop.
  test('regression: dispatcher does not skip target during final approach', () => {
    const e = createElevator();
    e.position = 0;
    processCall(e, 3);
    processCall(e, 9);
    let visited3 = false, visited9 = false;
    runUntil(e, (e) => {
      if (e.state === 'DOORS_OPEN') {
        if (Math.abs(e.position - 3) < 0.001) visited3 = true;
        if (Math.abs(e.position - 9) < 0.001) visited9 = true;
      }
      return visited3 && visited9 && e.carCalls.size === 0;
    }, 'visit both 3 and 9');
    assertTrue(visited3, 'expected to stop at 3');
    assertTrue(visited9, 'expected to stop at 9');
  });

  // FIXED in commit cc99546, refined later. When the elevator arrives at
  // a turnaround floor (highest pending request while going up), direction
  // stays UP until the next pickNextTarget call (after doors close). A
  // rider waiting at that floor for the OPPOSITE direction would fail
  // canBoard's direction check. The fix: at apex/nadir, set direction =
  // NONE so riders of EITHER direction can board this stop. (Previously
  // we FLIPPED, which broke same-direction riders — see the player-sim
  // stress test that surfaced that.)
  test('regression: apex sets direction NONE so any rider can board there', () => {
    const e = createElevator();
    e.position = 5;
    hallCall(e, 11, 'DOWN');           // turnaround request at the top
    runUntil(e, (e) => e.state === 'DOORS_OPEN' && Math.abs(e.position - 11) < 1e-6,
      'arrive at floor 11');
    assertEquals(e.direction, 'NONE',
      'direction should be NONE at apex so either-direction riders can board');
  });

  test('regression: nadir works the same way (DOWN trip then UP rider)', () => {
    const e = createElevator();
    e.position = 6;
    hallCall(e, 0, 'UP');              // turnaround at the bottom
    runUntil(e, (e) => e.state === 'DOORS_OPEN' && Math.abs(e.position - 0) < 1e-6,
      'arrive at floor 0');
    assertEquals(e.direction, 'NONE');
  });
});

// ----- doors and emergency stop --------------------------------------

describe('elevator: doors & emergency stop', () => {
  test('toggleDoor opens an idle car', () => {
    const e = createElevator();
    e.position = 2;
    toggleDoor(e);
    tick(e, TICK_MS);
    assertTrue(['DOORS_OPENING', 'DOORS_OPEN'].includes(e.state));
  });

  test('toggleDoor while opening reverses to closing', () => {
    const e = createElevator();
    e.position = 2;
    toggleDoor(e);                     // start opening
    tick(e, TICK_MS);
    assertEquals(e.state, 'DOORS_OPENING');
    toggleDoor(e);                     // mid-animation reverse
    assertEquals(e.state, 'DOORS_CLOSING');
  });

  test('emergency stop freezes position, state, and door progress', () => {
    const e = createElevator();
    e.position = 5;
    processCall(e, 9);
    tick(e, 100);                      // start moving up
    assertEquals(e.state, 'MOVING_UP');
    toggleEmergencyStop(e);
    const frozen = { pos: e.position, state: e.state, door: e.doorProgress };
    tick(e, 5000);                     // 5 seconds frozen
    assertEquals(e.position, frozen.pos);
    assertEquals(e.state, frozen.state);
    assertEquals(e.doorProgress, frozen.door);
  });

  test('release after emergency stop resumes the trip', () => {
    const e = createElevator();
    e.position = 5;
    processCall(e, 9);
    tick(e, 100);
    toggleEmergencyStop(e);
    tick(e, 1000);
    toggleEmergencyStop(e);            // release
    runUntil(e, (e) => Math.abs(e.position - 9) < 1e-6, 'arrive at 9');
    assertNear(e.position, 9);
  });
});

// ----- helpers --------------------------------------------------------

describe('elevator: helpers', () => {
  test('getCurrentFloor floors the position', () => {
    const e = createElevator();
    e.position = 5.3;  assertEquals(getCurrentFloor(e), 5);
    e.position = 5.0;  assertEquals(getCurrentFloor(e), 5);
    e.position = 5.999; assertEquals(getCurrentFloor(e), 5);
    e.position = 6.0;  assertEquals(getCurrentFloor(e), 6);
  });

  test('getCurrentFloor clamps to valid floor range', () => {
    const e = createElevator();
    e.position = -1; assertEquals(getCurrentFloor(e), 0);
    e.position = 99; assertEquals(getCurrentFloor(e), 11);
  });
});
