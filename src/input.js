import { computeLayout, screenYToTowerY, screenXToTowerX, getCameraY } from './layout.js';
import {
  computeKeypadModalArea,
  computeKeypadButtons,
  computeStopButtonRect,
  computeActionButtonRects,
  computeTitleButtonRects,
  computeOptionToggleRects,
  computeOptionsBackRect,
} from './render.js';
import { processCall, toggleDoor, toggleEmergencyStop, getCurrentFloor } from './elevator.js';
import { setWalkTarget, toggleInOut } from './player.js';
import {
  SHAFT_LEFT_X,
  SHAFT_RIGHT_X,
  WALL_WIDTH_UNITS,
  TOWER_WIDTH_UNITS,
  LOBBY_INDEX,
} from './config.js';

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

    // Title screen: pick which button was tapped.
    if (gameState.scene === 'TITLE') {
      const btns = computeTitleButtonRects(layout);
      if (insideRect(p, btns.start)) {
        gameState.scene = 'GAMEPLAY';
        return;
      }
      if (insideRect(p, btns.options)) {
        gameState.scene = 'OPTIONS';
        return;
      }
      // Tap outside the buttons → ignore (no accidental starts).
      return;
    }

    // Options screen: toggle a row, or BACK.
    if (gameState.scene === 'OPTIONS') {
      const toggles = computeOptionToggleRects(layout);
      for (const key of Object.keys(toggles)) {
        if (insideRect(p, toggles[key])) {
          gameState.options[key] = !gameState.options[key];
          // When riders turn off, evict casual NPCs and sweep stale calls
          // out of the dispatcher so the keypad doesn't show floors lit
          // for nobody.
          if (key === 'npcsEnabled' && !gameState.options.npcsEnabled) {
            gameState.npcs = gameState.npcs.filter(n => n.type === 'worker');
            const e = gameState.elevator;
            e.upCalls.clear();
            e.downCalls.clear();
            const next = new Set([...e.playerCalls]);
            for (const n of gameState.npcs) if (n.state === 'IN_ELEVATOR') next.add(n.destination);
            e.carCalls = next;
          }
          return;
        }
      }
      const back = computeOptionsBackRect(layout);
      if (insideRect(p, back)) {
        gameState.scene = 'TITLE';
        return;
      }
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
      // If the car's already at this floor and a door is animating or
      // open, treat it as a manual door toggle. Otherwise, summon the
      // car to the player's floor (which also opens the doors when it
      // arrives).
      const e = gameState.elevator;
      const here = getCurrentFloor(e) === gameState.player.floor;
      const doorsActive = e.state === 'DOORS_OPENING' ||
                          e.state === 'DOORS_OPEN' ||
                          e.state === 'DOORS_CLOSING';
      if (here && doorsActive) {
        toggleDoor(e);
      } else {
        processCall(e, gameState.player.floor);
      }
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

    if (insideRect(p, layout.tower) && gameState.player.state !== 'IN_ELEVATOR') {
      const cameraY = getCameraY(gameState.player, gameState.elevator);
      const towerY = screenYToTowerY(p.y, layout, cameraY);
      const towerX = screenXToTowerX(p.x, layout);
      const tappedFloor = Math.floor(towerY);

      // Easter egg: tap the sky strip beside the lobby → back to title.
      if (tappedFloor === LOBBY_INDEX) {
        const onAir = towerX < WALL_WIDTH_UNITS ||
                      towerX > TOWER_WIDTH_UNITS - WALL_WIDTH_UNITS;
        if (onAir) {
          gameState.scene = 'TITLE';
          gameState.modal = null;
          return;
        }
      }

      // Tap on the player's current floor:
      //  - shaft column → call the elevator AND walk to it
      //  - corridor    → just walk
      if (tappedFloor === gameState.player.floor) {
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
