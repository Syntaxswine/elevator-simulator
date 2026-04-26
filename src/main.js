import { loadAssets } from './assets.js';
import { computeLayout } from './layout.js';
import { buildTower } from './tower.js';
import { createElevator, updateElevator } from './elevator.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnRandomNpc, createWorker, startDeparture, updateNpc } from './npc.js';
import { createMetrics, recordArrival } from './metrics.js';
import { render } from './render.js';
import { attachInput } from './input.js';
import {
  DEFAULT_SEED,
  WORK_RUSH_INITIAL_DELAY_MS,
  WORK_RUSH_PHASE_DURATION_MS,
  WORK_RUSH_WORKER_COUNT,
  WORK_RUSH_SPAWN_STAGGER_MS,
} from './config.js';

const NPC_SPAWN_MIN_MS = 6000;
const NPC_SPAWN_MAX_MS = 14000;
const NPC_MAX_LIVE = 6;

function casualNpcCount(npcs) {
  let n = 0;
  for (const x of npcs) if (x.type !== 'worker') n++;
  return n;
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
      r.timerMs = WORK_RUSH_PHASE_DURATION_MS;
    }
  }

  if (r.phase === 'AT_WORK' && r.timerMs <= 0) {
    for (const npc of gameState.npcs) startDeparture(npc);
    r.phase = 'DEPARTURE_RUSH';
    r.timerMs = WORK_RUSH_PHASE_DURATION_MS;
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
    tower: buildTower(DEFAULT_SEED),
    elevator: createElevator(),
    player: createPlayer(),
    npcs: [],
    modal: null,
    options: {
      npcsEnabled: true,
      workRushEnabled: false,
    },
    metrics: createMetrics(),
    rush: {
      // 'IDLE' | 'WAITING_FOR_ARRIVAL' | 'SPAWNING_ARRIVAL' | 'AT_WORK' | 'DEPARTURE_RUSH'
      phase: 'IDLE',
      timerMs: 0,           // countdown for the current phase
      spawnIndex: 0,        // workers spawned so far in the current arrival wave
      spawnTimerMs: 0,      // gap until the next worker in the wave
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
      updateElevator(gameState.elevator, dt);
      updatePlayer(gameState.player, dt);

      // NPC update + lifecycle
      for (const npc of gameState.npcs) updateNpc(npc, dt, gameState.elevator, now);
      // Pick up newly-arrived workers' durations into the rolling average
      for (const npc of gameState.npcs) {
        if (npc.type === 'worker' && npc.arrivedAt && !npc.metricRecorded) {
          recordArrival(gameState.metrics, npc.arrivedAt - npc.tripStartTime);
          npc.metricRecorded = true;
        }
      }
      gameState.npcs = gameState.npcs.filter(n => n.state !== 'DESPAWNING');

      // Casual NPC spawning (skipped when other riders are turned off)
      nextSpawnMs -= dt;
      if (nextSpawnMs <= 0 &&
          gameState.options.npcsEnabled &&
          casualNpcCount(gameState.npcs) < NPC_MAX_LIVE) {
        gameState.npcs.push(spawnRandomNpc());
        nextSpawnMs = NPC_SPAWN_MIN_MS + Math.random() * (NPC_SPAWN_MAX_MS - NPC_SPAWN_MIN_MS);
      }

      // Work-rush controller
      const rushOn = gameState.options.workRushEnabled;
      if (rushOn !== lastWorkRushEnabled) {
        if (rushOn) {
          gameState.rush.phase = 'WAITING_FOR_ARRIVAL';
          gameState.rush.timerMs = WORK_RUSH_INITIAL_DELAY_MS;
        } else {
          // Evict any workers, reset rush state
          gameState.npcs = gameState.npcs.filter(n => n.type !== 'worker');
          gameState.rush.phase = 'IDLE';
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
