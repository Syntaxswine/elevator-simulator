// npc.test.mjs — NPC AI: casual riders and the worker cycle.
//
// NPCs are state machines that interact with the elevator state
// machine. The right way to test them is to interleave both update
// loops on every tick — same as the real game. The cooperative-tick
// helper below drives both forward at 16ms increments.

import { describe, test, assertEquals, assertTrue } from './runner.mjs';
import { createElevator, updateElevator } from '../src/elevator.js';
import {
  createNpc,
  createWorker,
  startDeparture,
  updateNpc,
  isNpcVisible,
  npcRenderXUnits,
  npcRenderFloor,
  spawnDinerNpc,
  spawnRandomNpc,
} from '../src/npc.js';
import { createMetrics, recordArrival } from '../src/metrics.js';

const TICK_MS = 16;
const TIMEOUT_MS = 60_000;

function tickWorld(elevator, npcs, ms) {
  while (ms > 0) {
    const dt = Math.min(TICK_MS, ms);
    updateElevator(elevator, dt);
    for (const n of npcs) updateNpc(n, dt, elevator);
    ms -= dt;
  }
}

function runWorldUntil(elevator, npcs, predicate, label) {
  let elapsed = 0;
  while (elapsed < TIMEOUT_MS) {
    updateElevator(elevator, TICK_MS);
    for (const n of npcs) updateNpc(n, TICK_MS, elevator);
    elapsed += TICK_MS;
    if (predicate(elevator, npcs)) return elapsed;
  }
  throw new Error(`Timed out after ${elapsed}ms waiting for: ${label}`);
}

// ----- casual NPC lifecycle ------------------------------------------

describe('npc: casual riders', () => {
  test('spawns walking toward the shaft', () => {
    const n = createNpc(/*floor*/3, /*destination*/7);
    assertEquals(n.type, 'casual');
    assertEquals(n.state, 'WALKING_TO_ELEVATOR');
    assertEquals(n.targetXOffset, 5);  // SHAFT_LEFT_X (4.5) + SHAFT_WIDTH/2 (0.5)
  });

  test('reaches WAITING and presses a hall call', () => {
    const e = createElevator();
    const n = createNpc(2, 7);  // lobby → floor 5
    n.xOffset = 0.7;            // start at left edge
    runWorldUntil(e, [n], (_, [n]) => n.state === 'WAITING', 'reach WAITING');
    assertTrue(e.upCalls.has(2), 'upCall at floor 2 should be registered');
  });

  test('full cycle: walk → board → ride → exit → despawn', () => {
    const e = createElevator();
    const n = createNpc(2, 7);
    runWorldUntil(e, [n], (_, [n]) => n.state === 'DESPAWNING',
      'casual rider despawns');
    assertEquals(n.floor, 7, 'should end on destination floor');
  });
});

// ----- worker cycle --------------------------------------------------

describe('npc: workers', () => {
  test('createWorker assigns a ground-floor home and an above-ground office', () => {
    const w = createWorker();
    assertTrue([0, 1, 2].includes(w.homeFloor), `bad homeFloor ${w.homeFloor}`);
    assertTrue(w.office >= 3 && w.office <= 11, `bad office ${w.office}`);
    assertEquals(w.type, 'worker');
    assertEquals(w.phase, 'ARRIVING');
  });

  test('worker arriving cycle: walks → rides → walks → AT_WORK', () => {
    const e = createElevator();
    const w = createWorker();
    // Pin floors so the test is deterministic regardless of RNG seed.
    w.floor = 0; w.homeFloor = 0; w.office = 5; w.destination = 5;
    runWorldUntil(e, [w], (_, [w]) => w.state === 'WORKING',
      'worker reaches WORKING state');
    assertEquals(w.phase, 'AT_WORK');
    assertEquals(w.floor, 5);
  });

  test('AT_WORK workers stay put across many ticks', () => {
    const e = createElevator();
    const w = createWorker();
    w.floor = 5; w.state = 'WORKING'; w.phase = 'AT_WORK';
    w.xOffset = 9.2; w.targetXOffset = 9.2;
    tickWorld(e, [w], 10_000);  // 10 seconds simulated
    assertEquals(w.state, 'WORKING');
    assertEquals(w.floor, 5);
    assertEquals(w.xOffset, 9.2, 'must not drift');
  });

  test('startDeparture sends an AT_WORK worker home', () => {
    const e = createElevator();
    const w = createWorker();
    w.floor = 5; w.state = 'WORKING'; w.phase = 'AT_WORK';
    w.homeFloor = 0; w.destination = 5; w.xOffset = 9.2;
    startDeparture(w);
    assertEquals(w.phase, 'DEPARTING');
    assertEquals(w.destination, 0);
    assertEquals(w.state, 'WALKING_TO_ELEVATOR');
  });

  test('full departure cycle: WORKING → walk → ride down → exit → DESPAWN', () => {
    const e = createElevator();
    const w = createWorker();
    w.floor = 5; w.state = 'WORKING'; w.phase = 'AT_WORK';
    w.homeFloor = 0; w.destination = 5; w.xOffset = 9.2; w.office = 5;
    startDeparture(w);
    runWorldUntil(e, [w], (_, [w]) => w.state === 'DESPAWNING',
      'worker despawns after going home');
    assertEquals(w.floor, 0, 'should end on home floor');
  });

  test('startDeparture is a no-op for a casual NPC or non-AT_WORK worker', () => {
    const casual = createNpc(2, 7);
    startDeparture(casual);
    assertEquals(casual.state, 'WALKING_TO_ELEVATOR'); // unchanged
    const w = createWorker();
    w.phase = 'ARRIVING';
    startDeparture(w);
    assertEquals(w.phase, 'ARRIVING');                  // unchanged
  });
});

// ----- diner spawning (lunch wave) -----------------------------------

describe('npc: lunch-wave diners', () => {
  test('diners go to one of the supplied restaurant floors', () => {
    const restaurantFloors = [4, 7, 10];
    for (let i = 0; i < 50; i++) {
      const n = spawnDinerNpc(restaurantFloors);
      assertTrue(restaurantFloors.includes(n.destination),
        `diner went to non-restaurant floor ${n.destination}`);
      assertEquals(n.type, 'casual');
    }
  });

  test('diners spawn on a ground floor (SB / B / L)', () => {
    const restaurantFloors = [5];
    for (let i = 0; i < 50; i++) {
      const n = spawnDinerNpc(restaurantFloors);
      assertTrue([0, 1, 2].includes(n.floor),
        `diner spawned at non-ground floor ${n.floor}`);
    }
  });

  test('diner never starts and ends on the same floor', () => {
    // Restaurant on lobby — diner should pick a different ground floor
    const restaurantFloors = [2];
    for (let i = 0; i < 30; i++) {
      const n = spawnDinerNpc(restaurantFloors);
      assertTrue(n.floor !== n.destination,
        `diner start ${n.floor} == dest ${n.destination}`);
    }
  });

  test('with no restaurants, falls back to a random destination', () => {
    const n = spawnDinerNpc([]);
    assertEquals(n.type, 'casual');
    // Just confirm it produced a valid NPC; destination is random
    assertTrue(typeof n.destination === 'number' && n.destination >= 0);
  });
});

// ----- arrival tracking (feeds the anger metric) ---------------------

describe('npc: arrival tracking', () => {
  test('createWorker stamps tripStartTime', () => {
    const w = createWorker(/*now*/ 1_000);
    assertEquals(w.tripStartTime, 1_000);
    assertEquals(w.arrivedAt, null);
    assertTrue(!w.metricRecorded);
  });

  test('startDeparture resets tripStartTime and boardedAt so anger restarts', () => {
    const w = createWorker(/*now*/ 1_000);
    w.state = 'WORKING'; w.phase = 'AT_WORK'; w.boardedAt = 5_000;
    startDeparture(w, /*now*/ 50_000);
    assertEquals(w.tripStartTime, 50_000);
    assertEquals(w.boardedAt, null);
    assertEquals(w.arrivedAt, null);
  });

  test('boardedAt is stamped on transition to IN_ELEVATOR (freezes anger)', () => {
    // Drive a casual NPC through to boarding and verify boardedAt was set.
    const e = createElevator();
    const n = createNpc(2, 7, /*now*/ 0);
    const npcs = [n];
    let now = 0;
    while (now < TIMEOUT_MS && n.state !== 'IN_ELEVATOR') {
      now += TICK_MS;
      updateElevator(e, TICK_MS);
      for (const x of npcs) updateNpc(x, TICK_MS, e, now);
    }
    assertEquals(n.state, 'IN_ELEVATOR');
    assertEquals(n.boardedAt, now,
      'boardedAt should equal the tick at which they boarded');
  });

  test('worker arrival fills tripStartTime → arrivedAt → metric average', () => {
    // Drive a real simulation and confirm the timing math reaches the
    // metrics module via the same path main.js uses.
    const e = createElevator();
    const m = createMetrics();
    const w = createWorker(/*now*/ 0);
    w.floor = 0; w.homeFloor = 0; w.office = 5; w.destination = 5;
    const npcs = [w];
    let now = 0;
    while (now < TIMEOUT_MS && w.state !== 'WORKING') {
      now += TICK_MS;
      updateElevator(e, TICK_MS);
      for (const n of npcs) updateNpc(n, TICK_MS, e, now);
    }
    assertEquals(w.state, 'WORKING');
    assertEquals(w.arrivedAt, now);
    // Simulate the polling loop main.js runs after every npc update tick.
    if (w.arrivedAt && !w.metricRecorded) {
      recordArrival(m, w.arrivedAt - w.tripStartTime);
      w.metricRecorded = true;
    }
    assertTrue(m.averageMs > 0, 'average should be recorded');
    assertEquals(m.averageMs, w.arrivedAt - w.tripStartTime);
  });

  test('casual rider also stamps arrivedAt on EXITING completion', () => {
    // Same as the worker test, but for a casual NPC. Confirms casuals
    // contribute to the same rolling average so anger has a baseline
    // even when the work-rush option is off.
    const e = createElevator();
    const n = createNpc(2, 7, /*now*/ 0);
    const npcs = [n];
    let now = 0;
    while (now < TIMEOUT_MS && n.state !== 'DESPAWNING') {
      now += TICK_MS;
      updateElevator(e, TICK_MS);
      for (const x of npcs) updateNpc(x, TICK_MS, e, now);
    }
    assertEquals(n.state, 'DESPAWNING');
    assertEquals(n.arrivedAt, now,
      'casual should set arrivedAt the moment EXITING completes');
  });
});

// ----- visibility & render helpers -----------------------------------

describe('npc: visibility & render helpers', () => {
  test('rider in elevator is hidden when doors are closed', () => {
    const w = createWorker();
    w.state = 'IN_ELEVATOR';
    const e = createElevator();
    e.doorProgress = 0;
    assertTrue(!isNpcVisible(w, e));
    e.doorProgress = 0.5;
    assertTrue(isNpcVisible(w, e));
  });

  test('on-floor NPC is always visible regardless of door state', () => {
    const w = createWorker();
    w.state = 'WALKING_TO_ELEVATOR';
    const e = createElevator();
    e.doorProgress = 0;
    assertTrue(isNpcVisible(w, e));
  });

  test('despawning NPC is invisible', () => {
    const n = createNpc(2, 7);
    n.state = 'DESPAWNING';
    assertTrue(!isNpcVisible(n, createElevator()));
  });

  test('npcRenderFloor uses elevator position when IN_ELEVATOR', () => {
    const n = createNpc(2, 7);
    n.state = 'IN_ELEVATOR';
    const e = createElevator(); e.position = 8.4;
    assertEquals(npcRenderFloor(n, e), 8.4);
  });

  test('npcRenderXUnits clusters in-elevator riders into shaft columns', () => {
    const n = createNpc(2, 7); n.state = 'IN_ELEVATOR';
    const x0 = npcRenderXUnits(n, 0);
    const x1 = npcRenderXUnits(n, 1);
    const x2 = npcRenderXUnits(n, 2);
    assertTrue(x0 !== x1, 'columns 0 and 1 should differ');
    assertTrue(x1 !== x2, 'columns 1 and 2 should differ');
    // All three should land inside the 1u shaft tile (x in [4.5, 5.5])
    for (const x of [x0, x1, x2]) {
      assertTrue(x >= 4.5 && x <= 5.5, `cluster x ${x} outside shaft`);
    }
  });
});
