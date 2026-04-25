import { loadAssets } from './assets.js';
import { computeLayout } from './layout.js';
import { buildTower } from './tower.js';
import { createElevator, updateElevator } from './elevator.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnRandomNpc, updateNpc } from './npc.js';
import { render } from './render.js';
import { attachInput } from './input.js';
import { DEFAULT_SEED } from './config.js';

const NPC_SPAWN_MIN_MS = 6000;
const NPC_SPAWN_MAX_MS = 14000;
const NPC_MAX_LIVE = 6;

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
    },
    assets,
  };
  let nextSpawnMs = 4000;

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
      for (const npc of gameState.npcs) updateNpc(npc, dt, gameState.elevator);
      gameState.npcs = gameState.npcs.filter(n => n.state !== 'DESPAWNING');

      // NPC spawning (skipped when other riders are turned off in options)
      nextSpawnMs -= dt;
      if (nextSpawnMs <= 0 &&
          gameState.options.npcsEnabled &&
          gameState.npcs.length < NPC_MAX_LIVE) {
        gameState.npcs.push(spawnRandomNpc());
        nextSpawnMs = NPC_SPAWN_MIN_MS + Math.random() * (NPC_SPAWN_MAX_MS - NPC_SPAWN_MIN_MS);
      }
    }
    const layout = computeLayout(window.innerWidth, window.innerHeight);
    render(ctx, layout, gameState);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
