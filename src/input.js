import { computeLayout } from './layout.js';
import { computeKeypadModalArea, computeKeypadButtons } from './render.js';
import { processCall } from './elevator.js';

// Pointer hit-tester. Reads canvas-relative pointer coords and dispatches
// to handlers based on which region was tapped. Hit regions are layout-aware
// and recomputed each tap (since the layout can change on resize).
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

    // Modal open: try buttons first, otherwise close.
    if (gameState.modal === 'KEYPAD') {
      const modalArea = computeKeypadModalArea(layout);
      const buttons = computeKeypadButtons(modalArea);
      const hit = buttons.find(b => insideRect(p, expandRect(b.rect, layout.unitSizePx * 0.15)));
      if (hit) {
        processCall(gameState.elevator, hit.floorIndex);
        // Keep the modal open for multi-press (per the proposal).
        return;
      }
      gameState.modal = null;
      return;
    }

    // No modal: tap the bottom-right panel face to open it.
    if (insideRect(p, layout.bottomRight)) {
      gameState.modal = 'KEYPAD';
      return;
    }
  }

  canvas.addEventListener('pointerdown', handleTap, { passive: false });
}

function insideRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Expand a rect outward by `padding` on all sides — used to give buttons
// a slightly larger tap target than their visual bounds (per the proposal's
// hit-region principle).
function expandRect(r, padding) {
  return { x: r.x - padding, y: r.y - padding, w: r.w + padding * 2, h: r.h + padding * 2 };
}
