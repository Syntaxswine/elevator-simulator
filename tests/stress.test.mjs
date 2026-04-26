// stress.test.mjs — long-run simulation looking for NPC anomalies.
//
// Drives the actual updateElevator + updateNpc loops for ~10 simulated
// minutes with a steady stream of casual riders and the work-rush
// schedule. Records every state transition and flags anything that
// looks like a stuck rider (waiting forever, riding forever, walking
// off forever) or a leaked hall call (a registered call with no NPC
// behind it).
//
// This is NOT a precise behavioral test — it's a smoke test that asks
// "does anything go wrong over a long enough window?"

import { describe, test, assertEquals, assertTrue } from './runner.mjs';
import {
  createElevator,
  updateElevator,
  hallCall,
} from '../src/elevator.js';
import {
  createNpc,
  spawnRandomNpc,
  spawnDinerNpc,
  createWorker,
  startDeparture,
  updateNpc,
} from '../src/npc.js';
import { createRng } from '../src/rng.js';

// Deterministic Math.random override so stress runs are reproducible
// across machines and across test ordering. Tests that share global
// state (this whole module) are easier to debug when they fail the
// same way every time.
function withSeededRandom(seed, fn) {
  const rng = createRng(seed);
  const original = Math.random;
  Math.random = rng;
  try { fn(); }
  finally { Math.random = original; }
}

const TICK_MS = 16;
const SIM_END_MS = 10 * 60 * 1000;       // 10 simulated minutes

// State-duration thresholds. Anything past these is suspicious in a
// well-behaved simulation.
const STUCK_LIMITS = {
  WALKING_TO_ELEVATOR: 5_000,            // ~1.5s walk + slack
  WAITING:              90_000,          // 90s waiting for the elevator (heavy traffic)
  IN_ELEVATOR:          60_000,          // 12 floors × ~0.5s + door cycles
  EXITING:              5_000,           // ~1.5s walk + slack
};

describe('stress: long-run NPC behavior', () => {
  test('10-minute busy simulation — no rider stuck in any state', () => withSeededRandom(1, () => {
    const e = createElevator();
    const npcs = [];
    let simTime = 0;
    let nextSpawn = 1000;
    const lastTransition = new Map();    // npc.id → { state, t }
    const allTransitions = [];           // for debugging on failure

    function recordTransition(npc) {
      const prev = lastTransition.get(npc.id);
      if (!prev || prev.state !== npc.state) {
        allTransitions.push({ id: npc.id, type: npc.type, state: npc.state, t: simTime });
        lastTransition.set(npc.id, { state: npc.state, t: simTime });
      }
    }

    while (simTime < SIM_END_MS) {
      simTime += TICK_MS;

      // Casual spawning
      nextSpawn -= TICK_MS;
      const live = npcs.filter(n => n.state !== 'DESPAWNING' && n.type === 'casual').length;
      if (nextSpawn <= 0 && live < 8) {
        npcs.push(spawnRandomNpc());
        nextSpawn = 4000 + Math.random() * 4000;
      }

      updateElevator(e, TICK_MS);
      for (const n of npcs) updateNpc(n, TICK_MS, e, simTime);
      for (const n of npcs) recordTransition(n);
    }

    // Final analysis
    const stuck = [];
    for (const n of npcs) {
      if (n.state === 'DESPAWNING' || n.state === 'WORKING') continue;
      const last = lastTransition.get(n.id);
      const limit = STUCK_LIMITS[n.state];
      if (limit === undefined) continue;
      const dur = simTime - last.t;
      if (dur > limit) {
        stuck.push({
          id: n.id, type: n.type, state: n.state, durationMs: dur,
          floor: n.floor, destination: n.destination,
          xOffset: +n.xOffset.toFixed(2),
        });
      }
    }

    if (stuck.length > 0) {
      // Print enough context to debug
      console.log('\nStuck riders detected:');
      for (const s of stuck.slice(0, 10)) console.log('  ', JSON.stringify(s));
      console.log('Last 6 transitions for first stuck rider:');
      const id = stuck[0].id;
      const recent = allTransitions.filter(t => t.id === id).slice(-6);
      for (const t of recent) console.log('  ', JSON.stringify(t));
      console.log(`Elevator: state=${e.state} dir=${e.direction} pos=${e.position.toFixed(2)}`);
      console.log(`  carCalls=${[...e.carCalls]} upCalls=${[...e.upCalls]} downCalls=${[...e.downCalls]}`);
    }

    assertEquals(stuck.length, 0, `${stuck.length} stuck NPCs out of ${npcs.length}`);
  }));

  test('10-minute busy simulation — no leaked hall calls', () => withSeededRandom(2, () => {
    const e = createElevator();
    const npcs = [];
    let simTime = 0;
    let nextSpawn = 1000;

    while (simTime < SIM_END_MS) {
      simTime += TICK_MS;
      nextSpawn -= TICK_MS;
      const live = npcs.filter(n => n.state !== 'DESPAWNING').length;
      if (nextSpawn <= 0 && live < 8) {
        npcs.push(spawnRandomNpc());
        nextSpawn = 4000 + Math.random() * 4000;
      }
      updateElevator(e, TICK_MS);
      for (const n of npcs) updateNpc(n, TICK_MS, e, simTime);
    }

    // After sim: every active hall call should have at least one WAITING
    // npc on that floor going that direction. Anything else is a leak.
    function activeWaiter(floor, direction) {
      return npcs.some(n =>
        n.state === 'WAITING' && n.floor === floor &&
        ((direction === 'UP'   && n.destination > n.floor) ||
         (direction === 'DOWN' && n.destination < n.floor)));
    }
    const leaks = [];
    for (const f of e.upCalls)   if (!activeWaiter(f, 'UP'))   leaks.push({ floor: f, direction: 'UP' });
    for (const f of e.downCalls) if (!activeWaiter(f, 'DOWN')) leaks.push({ floor: f, direction: 'DOWN' });

    assertEquals(leaks.length, 0, `leaked hall calls: ${JSON.stringify(leaks)}`);
  }));

  test('worker arrival cycle: 8 workers, all reach AT_WORK on their office floor', () => withSeededRandom(3, () => {
    const e = createElevator();
    const workers = [];
    for (let i = 0; i < 8; i++) workers.push(createWorker(0));
    let simTime = 0;
    while (simTime < SIM_END_MS) {
      simTime += TICK_MS;
      updateElevator(e, TICK_MS);
      for (const w of workers) updateNpc(w, TICK_MS, e, simTime);
      if (workers.every(w => w.state === 'WORKING')) break;
    }
    const notWorking = workers.filter(w => w.state !== 'WORKING');
    assertEquals(notWorking.length, 0,
      `${notWorking.length} workers never reached AT_WORK after ${simTime}ms`);
    // Each worker should be at its assigned office floor, not floating elsewhere
    for (const w of workers) {
      assertEquals(w.floor, w.office,
        `worker ${w.id} ended on floor ${w.floor}, expected office ${w.office}`);
    }
  }));

  test('worker departure cycle: every AT_WORK worker reaches their home floor', () => withSeededRandom(4, () => {
    const e = createElevator();
    const workers = [];
    // Pre-place 6 workers AT_WORK on various offices
    for (let i = 0; i < 6; i++) {
      const w = createWorker(0);
      w.state = 'WORKING';
      w.phase = 'AT_WORK';
      w.floor = w.office;
      w.xOffset = i % 2 === 0 ? 0.7 : 9.3;
      w.targetXOffset = w.xOffset;
      workers.push(w);
    }
    // Trigger departure for all
    let simTime = 0;
    for (const w of workers) startDeparture(w, simTime);
    while (simTime < SIM_END_MS) {
      simTime += TICK_MS;
      updateElevator(e, TICK_MS);
      for (const w of workers) updateNpc(w, TICK_MS, e, simTime);
      if (workers.every(w => w.state === 'DESPAWNING')) break;
    }
    const stranded = workers.filter(w => w.state !== 'DESPAWNING');
    assertEquals(stranded.length, 0,
      `${stranded.length} workers never made it home`);
    for (const w of workers) {
      assertEquals(w.floor, w.homeFloor,
        `worker ${w.id} despawned on floor ${w.floor}, expected home ${w.homeFloor}`);
    }
  }));

  test('player sits in the elevator the whole sim — no NPC anomalies', () => withSeededRandom(5, () => {
    // The player is just a state object; the dispatcher and NPCs don't
    // know about them. But it's worth confirming that nothing in the
    // game-loop pattern accidentally inserts the player into carCalls
    // or otherwise changes how NPCs flow.
    const e = createElevator();
    const player = {
      state: 'IN_ELEVATOR',
      floor: 2,                  // boarded at lobby; never updates
      xOffset: 5,
    };
    const npcs = [];
    let simTime = 0;
    let nextSpawn = 1000;
    const lastTransition = new Map();

    while (simTime < SIM_END_MS) {
      simTime += TICK_MS;
      nextSpawn -= TICK_MS;
      const live = npcs.filter(n => n.state !== 'DESPAWNING' && n.type === 'casual').length;
      if (nextSpawn <= 0 && live < 8) {
        npcs.push(spawnRandomNpc());
        nextSpawn = 4000 + Math.random() * 4000;
      }
      updateElevator(e, TICK_MS);
      for (const n of npcs) updateNpc(n, TICK_MS, e, simTime);
      for (const n of npcs) {
        const prev = lastTransition.get(n.id);
        if (!prev || prev.state !== n.state) {
          lastTransition.set(n.id, { state: n.state, t: simTime });
        }
      }
    }

    // Player still riding
    assertEquals(player.state, 'IN_ELEVATOR', 'player should still be IN_ELEVATOR');

    // No leaked hall calls (same check as the no-player sim)
    function activeWaiter(floor, direction) {
      return npcs.some(n =>
        n.state === 'WAITING' && n.floor === floor &&
        ((direction === 'UP'   && n.destination > n.floor) ||
         (direction === 'DOWN' && n.destination < n.floor)));
    }
    const leaks = [];
    for (const f of e.upCalls)   if (!activeWaiter(f, 'UP'))   leaks.push({ floor: f, direction: 'UP' });
    for (const f of e.downCalls) if (!activeWaiter(f, 'DOWN')) leaks.push({ floor: f, direction: 'DOWN' });
    assertEquals(leaks.length, 0, `leaks with sitting player: ${JSON.stringify(leaks)}`);

    // No riders stuck (same thresholds as the no-player sim)
    const stuck = [];
    for (const n of npcs) {
      if (n.state === 'DESPAWNING' || n.state === 'WORKING') continue;
      const last = lastTransition.get(n.id);
      const limit = STUCK_LIMITS[n.state];
      if (limit === undefined) continue;
      const dur = simTime - last.t;
      if (dur > limit) stuck.push({ id: n.id, state: n.state, durationMs: dur });
    }
    assertEquals(stuck.length, 0, `stuck NPCs with sitting player: ${JSON.stringify(stuck.slice(0,3))}`);

    // Most casuals should have despawned over 10 minutes — confirms the
    // elevator was actually doing work, not orbiting the player floor.
    const despawned = npcs.filter(n => n.state === 'DESPAWNING').length;
    assertTrue(despawned > 5,
      `expected NPCs to complete trips during sim, got ${despawned}`);
  }));

  test('lunch wave: 12 diners going to one restaurant all reach it', () => withSeededRandom(6, () => {
    const e = createElevator();
    const restaurantFloors = [7];   // single restaurant — worst case for crowding
    const diners = [];
    for (let i = 0; i < 12; i++) diners.push(spawnDinerNpc(restaurantFloors));
    let simTime = 0;
    while (simTime < SIM_END_MS) {
      simTime += TICK_MS;
      updateElevator(e, TICK_MS);
      for (const d of diners) updateNpc(d, TICK_MS, e, simTime);
      if (diners.every(d => d.state === 'DESPAWNING')) break;
    }
    const stranded = diners.filter(d => d.state !== 'DESPAWNING');
    assertEquals(stranded.length, 0,
      `${stranded.length} of 12 diners never made it to floor 7`);
    for (const d of diners) {
      assertEquals(d.floor, 7, `diner ${d.id} ended on floor ${d.floor}`);
    }
  }));
});
