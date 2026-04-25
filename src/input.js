import { computeLayout, screenYToTowerY, screenXToTowerX } from './layout.js';
import {
  computeKeypadModalArea,
  computeKeypadButtons,
  computeActionButtonRects,
} from './render.js';
import { processCall, toggleDoor } from './elevator.js';
import { setWalkTarget, toggleInOut } from './player.js';

// Pointer hit-tester. Hit regions can be larger than visual regions per the
// proposal; small 1u buttons get a thumb-friendly tap-pad expansion.
export function attachInput(canvas, gameState) {
  function pointFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const cssX = (ev.clientX ?? (ev.touches && ev.touches[0]?.clientX) ?? 0) - rect.left;
    const cssY = (ev.clientY ?? (ev.touches && ev.touches[0]?.clientY) ?? 0) - rect.top;
    return { x: cssX, y: cssY };
  }

  function handleTap(ev) {
    ev.preventDefault();
    const layout = computeLayout(window.innerWidth, window.innerHeight);
    const p = pointFromEvent(ev);
    const tapPad = layout.unitSizePx * 0.25;

    // Title screen: any tap starts the game.
    if (gameState.scene === 'TITLE') {
      gameState.scene = 'GAMEPLAY';
      return;
    }

    // Modal open: floor button (queue + stay open) or anywhere else (close).
    if (gameState.modal === 'KEYPAD') {
      const modalArea = computeKeypadModalArea(layout);
      const buttons = computeKeypadButtons(modalArea);
      const hit = buttons.find(b => insideRect(p, expandRect(b.rect, tapPad)));
      if (hit) {
        processCall(gameState.elevator, hit.floorIndex);
        return;
      }
      gameState.modal = null;
      return;
    }

    // Action buttons (bottom-left)
    const action = computeActionButtonRects(layout);
    if (insideRect(p, expandRect(action.openClose, tapPad))) {
      toggleDoor(gameState.elevator);
      return;
    }
    if (insideRect(p, expandRect(action.inOut, tapPad))) {
      toggleInOut(gameState.player, gameState.elevator);
      return;
    }

    // Bottom-right panel face → open keypad modal
    if (insideRect(p, layout.bottomRight)) {
      gameState.modal = 'KEYPAD';
      return;
    }

    // Tower-view tap on the player's current floor → walk to that x.
    if (insideRect(p, layout.tower) && gameState.player.state !== 'IN_ELEVATOR') {
      const cameraY = gameState.elevator.position + 0.5;
      const towerY = screenYToTowerY(p.y, layout, cameraY);
      const tappedFloor = Math.floor(towerY);
      if (tappedFloor === gameState.player.floor) {
        const towerX = screenXToTowerX(p.x, layout);
        setWalkTarget(gameState.player, towerX);
      }
      return;
    }
  }

  canvas.addEventListener('pointerdown', handleTap, { passive: false });
}

function insideRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function expandRect(r, padding) {
  return { x: r.x - padding, y: r.y - padding, w: r.w + padding * 2, h: r.h + padding * 2 };
}
