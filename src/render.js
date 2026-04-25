import {
  FLOOR_COUNT,
  FLOOR_LABELS,
  GROUND_LINE_Y,
  LEFT_CORRIDOR_X,
  SHAFT_LEFT_X,
  RIGHT_CORRIDOR_X,
  CORRIDOR_WIDTH_UNITS,
  SHAFT_WIDTH_UNITS,
} from './config.js';
import { towerYToScreenY, towerXToScreenX } from './layout.js';
import { isPlayerVisible } from './player.js';
import { getCurrentFloor, isFloorCalled } from './elevator.js';

// Background tile size (in units). Sky/dirt are large tileable images.
const BG_TILE_UNITS = 4;

export function render(ctx, layout, gameState) {
  const { canvasWidth, canvasHeight } = layout;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  renderTowerView(ctx, layout, gameState);
  renderIndicator(ctx, layout, gameState);
  renderBottomRegion(ctx, layout, gameState);

  if (gameState.modal === 'KEYPAD') {
    renderKeypadModal(ctx, layout, gameState);
  }
}

// ---------- Top: floor indicator HUD ----------

function renderIndicator(ctx, layout, gameState) {
  const { indicator } = layout;
  const { assets, elevator } = gameState;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(indicator.x, indicator.y, indicator.w, indicator.h);

  const indicatorImg = assets['floor-indicator'];
  if (indicatorImg) {
    ctx.drawImage(indicatorImg, indicator.x, indicator.y, indicator.w, indicator.h);
  }

  // Live floor — derived from continuous position, ticks at thresholds.
  const label = FLOOR_LABELS[getCurrentFloor(elevator)] ?? '?';
  const arrow =
    elevator.direction === 'UP' ? '▲' :
    elevator.direction === 'DOWN' ? '▼' : '';
  const text = arrow ? `${arrow} ${label}` : label;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = Math.floor(indicator.h * 0.55);
  ctx.font = `bold ${fontPx}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillText(text, indicator.x + indicator.w / 2 + 2, indicator.y + indicator.h / 2 + 2);
  ctx.fillStyle = '#ffd060';
  ctx.fillText(text, indicator.x + indicator.w / 2, indicator.y + indicator.h / 2);
  ctx.restore();
}

// ---------- Middle: tower view ----------

function renderTowerView(ctx, layout, gameState) {
  const { tower: rect } = layout;
  const { tower: towerModel, elevator, player, assets } = gameState;
  const cameraY = elevator.position + 0.5;  // center on car middle

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  drawSkyAndDirt(ctx, layout, cameraY, assets);
  drawFloors(ctx, layout, cameraY, towerModel, elevator, assets);

  if (isPlayerVisible(player, elevator)) {
    drawPlayer(ctx, layout, cameraY, player, elevator, assets);
  }

  ctx.restore();
}

function drawSkyAndDirt(ctx, layout, cameraY, assets) {
  const { tower: rect, unitSizePx } = layout;
  const groundScreenY = towerYToScreenY(GROUND_LINE_Y, layout, cameraY);

  drawTiledRegion(ctx, assets.sky,
    rect.x, rect.y,
    rect.w, Math.max(0, groundScreenY - rect.y),
    unitSizePx * BG_TILE_UNITS);

  drawTiledRegion(ctx, assets.dirt,
    rect.x, Math.max(rect.y, groundScreenY),
    rect.w, Math.max(0, (rect.y + rect.h) - groundScreenY),
    unitSizePx * BG_TILE_UNITS);
}

function drawTiledRegion(ctx, image, x, y, w, h, tileSizePx) {
  if (w <= 0 || h <= 0) return;
  if (!image || image.width === 0) {
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
    return;
  }
  const pattern = ctx.createPattern(image, 'repeat');
  if (!pattern) {
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
    return;
  }
  const scale = tileSizePx / image.width;
  if (typeof DOMMatrix !== 'undefined' && pattern.setTransform) {
    pattern.setTransform(new DOMMatrix().translateSelf(x, y).scaleSelf(scale));
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w / scale, h / scale);
    ctx.restore();
  }
}

function drawFloors(ctx, layout, cameraY, towerModel, elevator, assets) {
  const { unitSizePx } = layout;
  const halfTowerHeightUnits = layout.tower.h / (2 * unitSizePx);
  const minFloor = Math.max(0, Math.floor(cameraY - halfTowerHeightUnits) - 1);
  const maxFloor = Math.min(FLOOR_COUNT - 1, Math.ceil(cameraY + halfTowerHeightUnits) + 1);

  const corridorW = CORRIDOR_WIDTH_UNITS * unitSizePx;
  const shaftW = SHAFT_WIDTH_UNITS * unitSizePx;
  const leftX = towerXToScreenX(LEFT_CORRIDOR_X, layout);
  const rightX = towerXToScreenX(RIGHT_CORRIDOR_X, layout);
  const shaftX = towerXToScreenX(SHAFT_LEFT_X, layout);
  const shaftTile = assets['elevator-bank'];
  const elevatorFloor = getCurrentFloor(elevator);

  for (let i = minFloor; i <= maxFloor; i++) {
    const floor = towerModel.floors[i];
    const corridorTile = assets[floor.tileVariant];

    const yTop = towerYToScreenY(i + 1, layout, cameraY);
    const yBottom = towerYToScreenY(i, layout, cameraY);
    const h = yBottom - yTop;

    if (corridorTile) {
      ctx.drawImage(corridorTile, leftX, yTop, corridorW, h);
      ctx.save();
      ctx.translate(rightX + corridorW, yTop);
      ctx.scale(-1, 1);
      ctx.drawImage(corridorTile, 0, 0, corridorW, h);
      ctx.restore();
    }

    if (shaftTile) {
      ctx.drawImage(shaftTile, shaftX, yTop, shaftW, h);

      // Doors-open visual: at the elevator's current floor, reveal the
      // interior image (centered horizontally) with width scaled by
      // doorProgress, simulating doors sliding apart from the middle.
      if (i === elevatorFloor && elevator.doorProgress > 0) {
        const interior = assets['elevator-current-floor'];
        const visibleW = shaftW * elevator.doorProgress;
        const cx = shaftX + shaftW / 2;
        const dx = cx - visibleW / 2;
        if (interior) {
          // Source-rect width matches doorProgress so the interior image
          // is unveiled from its center outward, not stretched.
          const srcW = interior.width * elevator.doorProgress;
          const srcX = (interior.width - srcW) / 2;
          ctx.drawImage(interior,
            srcX, 0, srcW, interior.height,
            dx, yTop, visibleW, h);
        } else {
          ctx.fillStyle = '#0d0d18';
          ctx.fillRect(dx, yTop, visibleW, h);
        }
      }
    }
  }
}

function drawPlayer(ctx, layout, cameraY, player, elevator, assets) {
  const sprite = assets.player;
  if (!sprite) return;
  const { unitSizePx } = layout;

  const ON_FLOOR_HEIGHT = 0.9;
  let centerXUnits, baseYUnits, heightUnits;
  if (player.state === 'IN_ELEVATOR') {
    centerXUnits = SHAFT_LEFT_X + SHAFT_WIDTH_UNITS / 2;
    baseYUnits = elevator.position;
    heightUnits = ON_FLOOR_HEIGHT * 0.5;   // half size in the elevator
  } else {
    centerXUnits = player.xOffset;
    baseYUnits = player.floor;
    heightUnits = ON_FLOOR_HEIGHT;
  }

  const aspect = sprite.width / sprite.height;
  const heightPx = heightUnits * unitSizePx;
  const widthPx = heightPx * aspect;

  const screenCenterX = towerXToScreenX(centerXUnits, layout);
  const screenBaseY = towerYToScreenY(baseYUnits, layout, cameraY);
  ctx.drawImage(sprite, screenCenterX - widthPx / 2, screenBaseY - heightPx, widthPx, heightPx);
}

// ---------- Bottom: elevator close-up + control panel ----------

// Returns the rects of the two 1u action buttons (Open/Close, In/Out)
// in the bottom-left region. Used by both render and input.
export function computeActionButtonRects(layout) {
  const { bottomLeft, unitSizePx } = layout;
  const buttonStripH = unitSizePx;
  const closeupAreaH = Math.max(0, bottomLeft.h - buttonStripH);
  const buttonY = bottomLeft.y + closeupAreaH + (buttonStripH - unitSizePx) / 2;
  const ocX = bottomLeft.x + bottomLeft.w / 2 - unitSizePx - unitSizePx * 0.25;
  const ioX = bottomLeft.x + bottomLeft.w / 2 + unitSizePx * 0.25;
  return {
    openClose: { x: ocX, y: buttonY, w: unitSizePx, h: unitSizePx },
    inOut:     { x: ioX, y: buttonY, w: unitSizePx, h: unitSizePx },
  };
}

function renderBottomRegion(ctx, layout, gameState) {
  const { bottomLeft, bottomRight, unitSizePx } = layout;
  const { assets } = gameState;

  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(layout.bottom.x, layout.bottom.y, layout.bottom.w, layout.bottom.h);

  // Bottom-left: elevator-bank close-up + 1u action buttons
  const buttonStripH = unitSizePx;
  const closeupArea = {
    x: bottomLeft.x,
    y: bottomLeft.y,
    w: bottomLeft.w,
    h: Math.max(0, bottomLeft.h - buttonStripH),
  };
  if (assets['elevator-bank']) {
    drawImageContain(ctx, assets['elevator-bank'], closeupArea);
  } else {
    ctx.fillStyle = '#222';
    ctx.fillRect(closeupArea.x, closeupArea.y, closeupArea.w, closeupArea.h);
  }
  const buttons = computeActionButtonRects(layout);
  drawActionButton(ctx, buttons.openClose, 'O/C');
  drawActionButton(ctx, buttons.inOut, 'IN/OUT');

  // Bottom-right: control-panel face (elevator-button.png contained)
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(bottomRight.x, bottomRight.y, bottomRight.w, bottomRight.h);
  if (assets['elevator-button']) {
    drawImageContain(ctx, assets['elevator-button'], bottomRight);
  }
}

function drawImageContain(ctx, img, area) {
  if (img.width === 0 || img.height === 0) return;
  const imgAspect = img.width / img.height;
  const areaAspect = area.w / area.h;
  let dw, dh;
  if (imgAspect > areaAspect) {
    dw = area.w;
    dh = area.w / imgAspect;
  } else {
    dh = area.h;
    dw = area.h * imgAspect;
  }
  const dx = area.x + (area.w - dw) / 2;
  const dy = area.y + (area.h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawActionButton(ctx, rect, label) {
  ctx.save();
  ctx.fillStyle = '#2a2e36';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.fillStyle = '#dcdce0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(rect.h * 0.28)}px sans-serif`;
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

// ---------- Modal: keypad ----------

// Returns the rectangle that the modal occupies on screen.
export function computeKeypadModalArea(layout) {
  const { canvasWidth, canvasHeight, unitSizePx } = layout;
  const margin = Math.min(canvasWidth, canvasHeight) * 0.06;
  return {
    x: margin,
    y: margin + unitSizePx,                        // leave room for the close hint at top
    w: canvasWidth - margin * 2,
    h: canvasHeight - margin * 2 - unitSizePx,
  };
}

// Returns an array of { position, floorIndex, label, rect } for the 4×3 grid.
// Layout: position 1 (SB) bottom-left → position 12 ("10") top-right.
export function computeKeypadButtons(modalArea) {
  const cols = 3;
  const rows = 4;
  const padX = modalArea.w * 0.08;
  const padY = modalArea.h * 0.08;
  const gridX = modalArea.x + padX;
  const gridY = modalArea.y + padY;
  const gridW = modalArea.w - padX * 2;
  const gridH = modalArea.h - padY * 2;
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  const buttons = [];
  for (let p = 1; p <= 12; p++) {
    const floorIndex = p - 1;
    const label = FLOOR_LABELS[floorIndex];
    const mathRow = Math.floor((p - 1) / 3);   // 0 = bottom row
    const col = (p - 1) % 3;
    const displayRow = (rows - 1) - mathRow;   // 0 = top of screen
    const rect = {
      x: gridX + col * cellW + cellW * 0.1,
      y: gridY + displayRow * cellH + cellH * 0.1,
      w: cellW * 0.8,
      h: cellH * 0.8,
    };
    buttons.push({ position: p, floorIndex, label, rect });
  }
  return buttons;
}

function renderKeypadModal(ctx, layout, gameState) {
  const { canvasWidth, canvasHeight, unitSizePx } = layout;
  const { elevator } = gameState;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const area = computeKeypadModalArea(layout);

  // Frame
  ctx.fillStyle = '#3a2722';
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.strokeStyle = '#a07050';
  ctx.lineWidth = 3;
  ctx.strokeRect(area.x + 6, area.y + 6, area.w - 12, area.h - 12);

  // Buttons
  const buttons = computeKeypadButtons(area);
  for (const btn of buttons) {
    drawKeypadButton(ctx, btn.rect, btn.label, isFloorCalled(elevator, btn.floorIndex));
  }

  // Close hint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const fontPx = Math.max(12, Math.floor(unitSizePx * 0.35));
  ctx.font = `bold ${fontPx}px monospace`;
  ctx.fillText('TAP OUTSIDE BUTTONS TO CLOSE', canvasWidth / 2, fontPx * 0.4);
  ctx.restore();
}

function drawKeypadButton(ctx, rect, label, lit) {
  ctx.save();
  // Recessed bezel
  ctx.fillStyle = '#2c1d12';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const inset = Math.min(rect.w, rect.h) * 0.10;
  const bx = rect.x + inset, by = rect.y + inset;
  const bw = rect.w - inset * 2, bh = rect.h - inset * 2;

  if (lit) {
    // Lemon-yellow glowing button
    ctx.save();
    ctx.shadowColor = '#fff44f';
    ctx.shadowBlur = Math.max(bw, bh) * 0.45;
    const grad = ctx.createRadialGradient(
      bx + bw / 2, by + bh / 2, 0,
      bx + bw / 2, by + bh / 2, Math.max(bw, bh) / 2
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#fff44f');   // lemon yellow
    grad.addColorStop(1, '#e8d100');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  } else {
    ctx.fillStyle = '#c9a574';
    ctx.fillRect(bx, by, bw, bh);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = lit ? '#fffacd' : '#5a3e22';
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = lit ? '#3a2a00' : '#3a2010';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = Math.floor(Math.min(bw, bh) * 0.45);
  ctx.font = `bold ${fontPx}px monospace`;
  ctx.fillText(label, bx + bw / 2, by + bh / 2);
  ctx.restore();
}
