import { loadAssets } from './assets.js';
import { computeLayout } from './layout.js';
import { buildTower } from './tower.js';
import { createElevator, updateElevator } from './elevator.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnRandomNpc, spawnDinerNpc, createWorker, startDeparture, updateNpc } from './npc.js';
import { createMetrics, recordArrival } from './metrics.js';
import { computeRushNightness } from './clock.js';
import { render } from './render.js';
import { attachInput } from './input.js';
import {
  DEFAULT_SEED,
  WORK_RUSH_INITIAL_DELAY_MS,
  WORK_RUSH_AT_WORK_DURATION_MS,
  WORK_RUSH_DEPARTURE_DURATION_MS,
  WORK_RUSH_WORKER_COUNT,
  WORK_RUSH_SPAWN_STAGGER_MS,
  LUNCH_DURATION_MS,
  LUNCH_INTERVAL_MS,
  RESTAURANT_VARIANTS,
} from './config.js';

const RESTAURANT_VARIANT_SET = new Set(RESTAURANT_VARIANTS);

function getRestaurantFloors(tower) {
  const out = [];
  for (const f of tower.floors) {
    if (RESTAURANT_VARIANT_SET.has(f.tileVariant)) out.push(f.index);
  }
  return out;
}

const NPC_SPAWN_MIN_MS = 6000;
const NPC_SPAWN_MAX_MS = 14000;
const NPC_MAX_LIVE = 6;

function casualNpcCount(npcs) {
  let n = 0;
  for (const x of npcs) if (x.type !== 'worker') n++;
  return n;
}

// Lunch cycle: alternates between IDLE (LUNCH_INTERVAL_MS) and ACTIVE
// (LUNCH_DURATION_MS). When the option flips off we snap back to IDLE so
// the wave doesn't just disappear mid-stream and come back later.
function updateLunchCycle(gameState, dt) {
  const lunch = gameState.lunch;
  if (!gameState.options.lunchEnabled) {
    lunch.active = false;
    lunch.timerMs = LUNCH_INTERVAL_MS;
    return;
  }
  lunch.timerMs -= dt;
  if (lunch.timerMs <= 0) {
    lunch.active = !lunch.active;
    lunch.timerMs = lunch.active ? LUNCH_DURATION_MS : LUNCH_INTERVAL_MS;
  }
}

// After evicting NPCs, sweep the dispatcher state so we don't leave stale
// calls sending the elevator to empty floors (the keypad would also light
// those buttons up). Hall calls were always NPC-originated; carCalls might
// include both player presses (keep) and in-elevator-NPC destinations
// (drop unless that NPC is still here).
function rebuildCallsAfterEviction(gameState) {
  const e = gameState.elevator;
  e.upCalls.clear();
  e.downCalls.clear();
  const next = new Set([...e.playerCalls]);
  for (const npc of gameState.npcs) {
    if (npc.state === 'IN_ELEVATOR') next.add(npc.destination);
  }
  e.carCalls = next;
}

// Drives the rush cycle: 3-min initial wait → arrival wave (staggered
// spawns) → 15 min at work → departure rush (every AT_WORK worker
// transitions to DEPARTING) → 15 min cooldown → next arrival.
function updateRush(gameState, dt) {
  const r = gameState.rush;
  if (r.phase === 'IDLE') return;

  r.timerMs -= dt;

  if (r.phase === 'WAITING_FOR_ARRIVAL' && r.timerMs <= 0) {
    r.phase = 'SPAWNING_ARRIVAL';
    r.spawnIndex = 0;
    r.spawnTimerMs = 0;
  }

  if (r.phase === 'SPAWNING_ARRIVAL') {
    r.spawnTimerMs -= dt;
    if (r.spawnTimerMs <= 0 && r.spawnIndex < WORK_RUSH_WORKER_COUNT) {
      gameState.npcs.push(createWorker());
      r.spawnIndex++;
      r.spawnTimerMs = WORK_RUSH_SPAWN_STAGGER_MS;
    }
    if (r.spawnIndex >= WORK_RUSH_WORKER_COUNT) {
      r.phase = 'AT_WORK';
      r.timerMs = WORK_RUSH_AT_WORK_DURATION_MS;
    }
  }

  if (r.phase === 'AT_WORK' && r.timerMs <= 0) {
    for (const npc of gameState.npcs) startDeparture(npc);
    r.phase = 'DEPARTURE_RUSH';
    r.timerMs = WORK_RUSH_DEPARTURE_DURATION_MS;   // also drives the night cycle
  }

  if (r.phase === 'DEPARTURE_RUSH' && r.timerMs <= 0) {
    r.phase = 'SPAWNING_ARRIVAL';
    r.spawnIndex = 0;
    r.spawnTimerMs = 0;
  }
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function start() {
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  let assets;
  try {
    assets = await loadAssets();
  } catch (err) {
    console.error(err);
    ctx.fillStyle = '#400';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fdd';
    ctx.font = '20px monospace';
    ctx.fillText('asset load failed: ' + err.message, 20, 40);
    return;
  }

  const gameState = {
    scene: 'TITLE',
    tower: buildTower(DEFAULT_SEED, { includeRestaurants: false }),
    elevator: createElevator(),
    player: createPlayer(),
    npcs: [],
    modal: null,
    options: {
      npcCount: 6,                  // 0 = no casual riders; up to NPC_MAX_COUNT
      workRushEnabled: false,
      restaurantsEnabled: false,    // when true, tower has 0/2/4 unique restaurants
      lunchEnabled: false,          // when true, periodic 3-min "lunch hour" sends casuals to restaurants
    },
    metrics: createMetrics(),
    nightness: 0,                    // 0 = full day, 1 = full night; updated each frame

    rush: {
      // 'IDLE' | 'WAITING_FOR_ARRIVAL' | 'SPAWNING_ARRIVAL' | 'AT_WORK' | 'DEPARTURE_RUSH'
      phase: 'IDLE',
      timerMs: 0,           // countdown for the current phase
      spawnIndex: 0,        // workers spawned so far in the current arrival wave
      spawnTimerMs: 0,      // gap until the next worker in the wave
    },
    lunch: {
      // First instance of the schedule-driven spawning idea: when active,
      // new casual spawns get restaurant destinations instead of random ones.
      active: false,
      timerMs: LUNCH_INTERVAL_MS,
    },
    assets,
  };
  let nextSpawnMs = 4000;
  let lastWorkRushEnabled = false;

  attachInput(canvas, gameState);

  // Debug hook (harmless in production; lets the preview eval inspect state)
  window.__gs = gameState;

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - lastTime);
    lastTime = now;
    if (gameState.scene === 'GAMEPLAY') {
      // Sky cycle is driven by the rush schedule — sunset starts when
      // workers head home, dawn finishes before the next arrival wave.
      gameState.nightness = gameState.options.workRushEnabled
        ? computeRushNightness(gameState.rush, WORK_RUSH_DEPARTURE_DURATION_MS)
        : 0;
      updateElevator(gameState.elevator, dt);
      updatePlayer(gameState.player, dt);

      // NPC update + lifecycle
      for (const npc of gameState.npcs) updateNpc(npc, dt, gameState.elevator, now);
      // Pick up every newly-arrived rider's trip duration into the rolling
      // average — workers and casuals alike contribute (same units).
      for (const npc of gameState.npcs) {
        if (npc.arrivedAt && !npc.metricRecorded) {
          recordArrival(gameState.metrics, npc.arrivedAt - npc.tripStartTime);
          npc.metricRecorded = true;
        }
      }
      gameState.npcs = gameState.npcs.filter(n => n.state !== 'DESPAWNING');

      // Casual NPC spawning — capped by the player-chosen npcCount.
      // During an active lunch wave (and only if the tower has restaurants),
      // new casuals are routed to a random restaurant floor instead of an
      // arbitrary one. This is the schedule-driven destination bias.
      updateLunchCycle(gameState, dt);
      nextSpawnMs -= dt;
      if (nextSpawnMs <= 0 &&
          gameState.options.npcCount > 0 &&
          casualNpcCount(gameState.npcs) < gameState.options.npcCount) {
        const restaurantFloors = gameState.lunch.active
          ? getRestaurantFloors(gameState.tower)
          : null;
        const npc = (gameState.lunch.active && restaurantFloors && restaurantFloors.length > 0)
          ? spawnDinerNpc(restaurantFloors)
          : spawnRandomNpc();
        gameState.npcs.push(npc);
        nextSpawnMs = NPC_SPAWN_MIN_MS + Math.random() * (NPC_SPAWN_MAX_MS - NPC_SPAWN_MIN_MS);
      }

      // Work-rush controller
      const rushOn = gameState.options.workRushEnabled;
      if (rushOn !== lastWorkRushEnabled) {
        if (rushOn) {
          gameState.rush.phase = 'WAITING_FOR_ARRIVAL';
          gameState.rush.timerMs = WORK_RUSH_INITIAL_DELAY_MS;
        } else {
          gameState.npcs = gameState.npcs.filter(n => n.type !== 'worker');
          gameState.rush.phase = 'IDLE';
          rebuildCallsAfterEviction(gameState);
        }
        lastWorkRushEnabled = rushOn;
      }
      if (rushOn) updateRush(gameState, dt);
    }
    const layout = computeLayout(window.innerWidth, window.innerHeight);
    render(ctx, layout, gameState);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
