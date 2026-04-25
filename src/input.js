import { computeLayout, screenYToTowerY, screenXToTowerX, getCameraY } from './layout.js';
import {
  computeKeypadModalArea,
  computeKeypadButtons,
  computeStopButtonRect,
  computeActionButtonRects,
} from './render.js';
import { processCall, toggleDoor, toggleEmergencyStop } from './elevator.js';
import { setWalkTarget, toggleInOut } from './player.js';
import { SHAFT_LEFT_X, SHAFT_RIGHT_X } from './config.js';

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

    // Modal open: floor button (queue + stay open), STOP toggle, or close.
    if (gameState.modal === 'KEYPAD') {
      const modalArea = computeKeypadModalArea(layout);
      const buttons = computeKeypadButtons(modalArea);
      const hit = buttons.find(b => insideRect(p, expandRect(b.rect, tapPad)));
      if (hit) {
        processCall(gameState.elevator, hit.floorIndex);
        return;
      }
      const stopRect = computeStopButtonRect(modalArea);
      if (insideRect(p, expandRect(stopRect, tapPad))) {
        toggleEmergencyStop(gameState.elevator);
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

    // Tower-view tap on the player's current floor:
    //  - tap the elevator door (shaft column) → call the elevator AND walk to it
    //  - tap the corridor → just walk
    if (insideRect(p, layout.tower) && gameState.player.state !== 'IN_ELEVATOR') {
      const cameraY = getCameraY(gameState.player, gameState.elevator);
      const towerY = screenYToTowerY(p.y, layout, cameraY);
      const tappedFloor = Math.floor(towerY);
      if (tappedFloor === gameState.player.floor) {
        const towerX = screenXToTowerX(p.x, layout);
        // Generous tap zone for the shaft column (~1.5u wide for thumb friendliness)
        const shaftPad = 0.25;
        const onShaftDoor = towerX >= SHAFT_LEFT_X - shaftPad &&
                            towerX <= SHAFT_RIGHT_X + shaftPad;
        setWalkTarget(gameState.player, towerX);
        if (onShaftDoor) {
          processCall(gameState.elevator, gameState.player.floor);
        }
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
