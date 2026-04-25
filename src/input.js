import { computeLayout } from './layout.js';

// Pointer hit-tester. Reads canvas-relative pointer coords and dispatches
// to handlers based on which region was tapped. Hit regions can be larger
// than visual regions (per the proposal); the modal-open hit is the whole
// bottom-right region.
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

    // If the modal is open, any tap closes it.
    if (gameState.modal === 'KEYPAD') {
      gameState.modal = null;
      return;
    }

    // Tap in bottom-right region opens the modal.
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
