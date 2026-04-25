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

// Background tile size (in units). Sky/dirt tiles are large hi-res images;
// rendering one tile per 4u feels closer to their authored scale than 1u.
const BG_TILE_UNITS = 4;

export function render(ctx, layout, gameState) {
  const { canvasWidth, canvasHeight } = layout;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  renderTowerView(ctx, layout, gameState);
  renderIndicator(ctx, layout, gameState);
  renderBottomRegion(ctx, layout, gameState);
}

// ---------- Top: floor indicator HUD ----------

function renderIndicator(ctx, layout, gameState) {
  const { indicator } = layout;
  ctx.save();
  // Background bar
  ctx.fillStyle = '#111';
  ctx.fillRect(indicator.x, indicator.y, indicator.w, indicator.h);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(indicator.x, indicator.y, indicator.w, indicator.h);

  // Direction arrow + floor label, centered
  const { elevator } = gameState;
  const label = FLOOR_LABELS[elevator.currentFloor] ?? '?';
  const arrow = elevator.direction === 'UP' ? '▲' : elevator.direction === 'DOWN' ? '▼' : ' ';
  const text = `${arrow}   ${label}`;

  ctx.fillStyle = '#ff7733';  // amber 90s seven-segment vibe
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = Math.floor(indicator.h * 0.6);
  ctx.font = `bold ${fontPx}px monospace`;
  ctx.fillText(text, indicator.x + indicator.w / 2, indicator.y + indicator.h / 2);
  ctx.restore();
}

// ---------- Middle: tower view ----------

function renderTowerView(ctx, layout, gameState) {
  const { tower: rect, unitSizePx } = layout;
  const { tower: towerModel, elevator, player, assets } = gameState;
  const cameraY = elevator.position + 0.5;  // center on car middle (floor + 0.5)

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  // 1) Sky / dirt backgrounds (full clip area, split at ground line)
  drawSkyAndDirt(ctx, layout, cameraY, assets);

  // 2) Floors: corridors (left + right) and shaft facade (elevator-bank at every floor).
  // No solid walls — the 0.5u air strips on each side of the corridors stay sky/dirt.
  drawFloors(ctx, layout, cameraY, towerModel, assets);

  // 3) Player sprite if visible
  if (isPlayerVisible(player, elevator)) {
    drawPlayer(ctx, layout, cameraY, player, elevator, assets);
  }

  ctx.restore();
}

function drawSkyAndDirt(ctx, layout, cameraY, assets) {
  const { tower: rect, unitSizePx } = layout;
  const groundScreenY = towerYToScreenY(GROUND_LINE_Y, layout, cameraY);

  // Each region: build a pattern, scaled so the source image fills BG_TILE_UNITS units.
  drawTiledRegion(ctx, assets.sky,
    rect.x, rect.y,
    rect.w, Math.max(0, groundScreenY - rect.y),
    unitSizePx * BG_TILE_UNITS);

  drawTiledRegion(ctx, assets.dirt,
    rect.x, Math.max(rect.y, groundScreenY),
    rect.w, Math.max(0, (rect.y + rect.h) - groundScreenY),
    unitSizePx * BG_TILE_UNITS);
}

// Tiles `image` to fill the rect, at the requested tile pixel size.
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
  // Scale: pattern source pixel → tileSizePx / image.width screen pixels
  const scale = tileSizePx / image.width;
  // Use setTransform if supported; otherwise fall back to manual transform on ctx.
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

function drawFloors(ctx, layout, cameraY, towerModel, assets) {
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

  for (let i = minFloor; i <= maxFloor; i++) {
    const floor = towerModel.floors[i];
    const corridorTile = assets[floor.tileVariant];

    const yTop = towerYToScreenY(i + 1, layout, cameraY);
    const yBottom = towerYToScreenY(i, layout, cameraY);
    const h = yBottom - yTop;

    // Left corridor
    if (corridorTile) {
      ctx.drawImage(corridorTile, leftX, yTop, corridorW, h);
      // Right corridor: same tile, mirrored
      ctx.save();
      ctx.translate(rightX + corridorW, yTop);
      ctx.scale(-1, 1);
      ctx.drawImage(corridorTile, 0, 0, corridorW, h);
      ctx.restore();
    }

    // Shaft facade — same elevator-bank tile at every floor (double-use asset)
    if (shaftTile) {
      ctx.drawImage(shaftTile, shaftX, yTop, shaftW, h);
    }
  }
}

function drawPlayer(ctx, layout, cameraY, player, elevator, assets) {
  const sprite = assets.player;
  if (!sprite) return;
  const { unitSizePx } = layout;

  let centerXUnits, baseYUnits, heightUnits;
  if (player.state === 'IN_ELEVATOR') {
    // Inside the shaft tile — shrunk to ~0.7u tall
    centerXUnits = SHAFT_LEFT_X + SHAFT_WIDTH_UNITS / 2;
    baseYUnits = elevator.position;
    heightUnits = 0.7;
  } else {
    centerXUnits = player.xOffset;
    baseYUnits = player.floor;
    heightUnits = 0.9;  // slightly less than 1u to leave headroom on the floor
  }

  // Maintain sprite aspect ratio (image is taller than wide)
  const aspect = sprite.width / sprite.height;
  const heightPx = heightUnits * unitSizePx;
  const widthPx = heightPx * aspect;

  const screenCenterX = towerXToScreenX(centerXUnits, layout);
  const screenBaseY = towerYToScreenY(baseYUnits, layout, cameraY);  // floor's bottom = sprite's feet
  ctx.drawImage(sprite, screenCenterX - widthPx / 2, screenBaseY - heightPx, widthPx, heightPx);
}

// ---------- Bottom: elevator close-up + control panel ----------

function renderBottomRegion(ctx, layout, gameState) {
  const { bottomLeft, bottomRight, unitSizePx } = layout;
  const { assets } = gameState;

  // Backdrop
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(layout.bottom.x, layout.bottom.y, layout.bottom.w, layout.bottom.h);

  // --- Bottom-left: elevator-bank close-up ---
  // Fit the elevator-bank image into the bottom-left region, leaving a 1u strip at the bottom for buttons
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

  // 1u Open/Close button + 1u In/Out button, side by side
  drawActionButton(ctx, {
    x: bottomLeft.x + bottomLeft.w / 2 - unitSizePx - unitSizePx * 0.25,
    y: closeupArea.y + closeupArea.h + (buttonStripH - unitSizePx) / 2,
    w: unitSizePx,
    h: unitSizePx,
  }, 'O/C');
  drawActionButton(ctx, {
    x: bottomLeft.x + bottomLeft.w / 2 + unitSizePx * 0.25,
    y: closeupArea.y + closeupArea.h + (buttonStripH - unitSizePx) / 2,
    w: unitSizePx,
    h: unitSizePx,
  }, 'IN/OUT');

  // --- Bottom-right: control-panel placeholder (canvas-drawn) ---
  drawPanelPlaceholder(ctx, bottomRight, unitSizePx);
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
  // Brushed-metal-ish background
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

function drawPanelPlaceholder(ctx, area, unitSizePx) {
  ctx.save();
  // Frame
  ctx.fillStyle = '#3a2722';
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.strokeStyle = '#a07050';
  ctx.lineWidth = 3;
  ctx.strokeRect(area.x + 6, area.y + 6, area.w - 12, area.h - 12);

  // Faux button grid (decorative — actual interaction will open the modal keypad)
  const cols = 3;
  const rows = 4;
  const padX = unitSizePx * 0.5;
  const padY = unitSizePx * 0.5;
  const gridX = area.x + padX;
  const gridY = area.y + padY;
  const gridW = area.w - padX * 2;
  const gridH = area.h - padY * 2;
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = gridX + c * cellW + cellW / 2;
      const cy = gridY + r * cellH + cellH / 2;
      const radius = Math.min(cellW, cellH) * 0.32;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#c9a574';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#5a3e22';
      ctx.stroke();
    }
  }

  // "TAP TO OPEN" hint (bottom)
  ctx.fillStyle = '#f0c894';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const hintFont = Math.max(10, Math.floor(unitSizePx * 0.25));
  ctx.font = `bold ${hintFont}px monospace`;
  ctx.fillText('TAP TO OPEN', area.x + area.w / 2, area.y + area.h - 6);
  ctx.restore();
}
