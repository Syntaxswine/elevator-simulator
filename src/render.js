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
import { towerYToScreenY, towerXToScreenX, getCameraY } from './layout.js';
import { isPlayerVisible } from './player.js';
import { getCurrentFloor, isFloorCalled } from './elevator.js';
import { isNpcVisible, npcRenderFloor, npcRenderXUnits } from './npc.js';
import { computeAnger } from './metrics.js';

// Background tile size (in units). Sky/dirt are large tileable images.
const BG_TILE_UNITS = 4;

export function render(ctx, layout, gameState) {
  const { canvasWidth, canvasHeight } = layout;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (gameState.scene === 'TITLE') {
    renderTitleScreen(ctx, layout, gameState);
    return;
  }
  if (gameState.scene === 'OPTIONS') {
    renderOptionsScreen(ctx, layout, gameState);
    return;
  }

  renderTowerView(ctx, layout, gameState);
  renderIndicator(ctx, layout, gameState);
  renderBottomRegion(ctx, layout, gameState);

  if (gameState.modal === 'KEYPAD') {
    renderKeypadModal(ctx, layout, gameState);
  }
}

// ---------- Title screen ----------

const TITLE_PANEL_LINES = [
  '╔═══════════════╗',
  '║ ┌───────────┐ ║',
  '║ │     L     │ ║',
  '║ └───────────┘ ║',
  '║               ║',
  '║ ┌──┬──┬──┐    ║',
  '║ │ 8│ 9│10│    ║',
  '║ ├──┼──┼──┤    ║',
  '║ │ 5│ 6│ 7│    ║',
  '║ ├──┼──┼──┤    ║',
  '║ │ 2│ 3│ 4│    ║',
  '║ ├──┼──┼──┤    ║',
  '║ │SB│ B│ L│    ║',
  '║ └──┴──┴──┘    ║',
  '║               ║',
  '║  [<] [>] [X]  ║',
  '╚═══════════════╝',
];

function renderTitleScreen(ctx, layout, gameState) {
  const { canvasWidth, canvasHeight } = layout;

  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title block
  const titleSize = Math.floor(canvasWidth * 0.07);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${titleSize}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('ELEVATOR', canvasWidth / 2 + 3, canvasHeight * 0.05 + 3);
  ctx.fillStyle = '#ffd060';
  ctx.fillText('ELEVATOR', canvasWidth / 2, canvasHeight * 0.05);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('SIMULATOR', canvasWidth / 2 + 3, canvasHeight * 0.05 + titleSize + 3);
  ctx.fillStyle = '#ffd060';
  ctx.fillText('SIMULATOR', canvasWidth / 2, canvasHeight * 0.05 + titleSize);

  // ASCII control-panel art
  const lineCount = TITLE_PANEL_LINES.length;
  const maxLineLen = Math.max(...TITLE_PANEL_LINES.map(l => l.length));
  const charW = (canvasWidth * 0.7) / maxLineLen;
  const lineH = Math.min(charW * 1.4, (canvasHeight * 0.45) / lineCount);
  const charPx = Math.floor(lineH);
  ctx.font = `${charPx}px "Courier New", monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const artStartY = canvasHeight * 0.24;
  ctx.fillStyle = '#52ff66';
  for (let i = 0; i < lineCount; i++) {
    ctx.fillText(TITLE_PANEL_LINES[i], canvasWidth / 2, artStartY + i * lineH);
  }

  // Two buttons: START and OPTIONS
  const btns = computeTitleButtonRects(layout);
  drawMenuButton(ctx, btns.start, 'START', /* primary */ true);
  drawMenuButton(ctx, btns.options, 'OPTIONS', false);
}

// Returns rects for the two main-menu buttons on the title screen.
export function computeTitleButtonRects(layout) {
  const { canvasWidth, canvasHeight } = layout;
  const buttonW = canvasWidth * 0.55;
  const buttonH = canvasHeight * 0.06;
  const gap = canvasHeight * 0.02;
  const totalH = buttonH * 2 + gap;
  const startY = canvasHeight * 0.93 - totalH;
  const x = (canvasWidth - buttonW) / 2;
  return {
    start:   { x, y: startY,                   w: buttonW, h: buttonH },
    options: { x, y: startY + buttonH + gap,    w: buttonW, h: buttonH },
  };
}

function drawMenuButton(ctx, rect, label, primary) {
  ctx.save();
  // Bezel
  ctx.fillStyle = '#070710';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const inset = Math.min(rect.w, rect.h) * 0.06;
  const bx = rect.x + inset, by = rect.y + inset;
  const bw = rect.w - inset * 2, bh = rect.h - inset * 2;

  if (primary) {
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, '#ffe680');
    grad.addColorStop(1, '#c69a14');
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, '#243038');
    grad.addColorStop(1, '#10161a');
    ctx.fillStyle = grad;
  }
  ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = primary ? '#fff4c0' : '#52ff66';
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = primary ? '#1a1000' : '#a8ffaa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = Math.floor(bh * 0.5);
  ctx.font = `bold ${fontPx}px "Courier New", monospace`;
  ctx.fillText(label, bx + bw / 2, by + bh / 2);
  ctx.restore();
}

// ---------- Options screen ----------

const OPTIONS_LIST = [
  { key: 'npcsEnabled',     label: 'OTHER RIDERS' },
  { key: 'workRushEnabled', label: 'WORK RUSH' },
];

function renderOptionsScreen(ctx, layout, gameState) {
  const { canvasWidth, canvasHeight } = layout;

  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title
  const titleSize = Math.floor(canvasWidth * 0.07);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${titleSize}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('OPTIONS', canvasWidth / 2 + 3, canvasHeight * 0.08 + 3);
  ctx.fillStyle = '#ffd060';
  ctx.fillText('OPTIONS', canvasWidth / 2, canvasHeight * 0.08);

  // Toggles
  const rects = computeOptionToggleRects(layout);
  for (const opt of OPTIONS_LIST) {
    const r = rects[opt.key];
    const value = !!gameState.options?.[opt.key];
    drawOptionToggle(ctx, r, opt.label, value);
  }

  // Back button
  const back = computeOptionsBackRect(layout);
  drawMenuButton(ctx, back, 'BACK', false);
}

export function computeOptionToggleRects(layout) {
  const { canvasWidth, canvasHeight } = layout;
  const rowW = canvasWidth * 0.78;
  const rowH = canvasHeight * 0.08;
  const gap = canvasHeight * 0.015;
  const startY = canvasHeight * 0.27;
  const x = (canvasWidth - rowW) / 2;
  const out = {};
  OPTIONS_LIST.forEach((opt, i) => {
    out[opt.key] = { x, y: startY + i * (rowH + gap), w: rowW, h: rowH };
  });
  return out;
}

export function computeOptionsBackRect(layout) {
  const { canvasWidth, canvasHeight } = layout;
  const buttonW = canvasWidth * 0.55;
  const buttonH = canvasHeight * 0.06;
  return {
    x: (canvasWidth - buttonW) / 2,
    y: canvasHeight * 0.86,
    w: buttonW,
    h: buttonH,
  };
}

function drawOptionToggle(ctx, rect, label, on) {
  ctx.save();
  // Row background
  ctx.fillStyle = '#10161a';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = '#52ff66';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);

  // Switch first so we know how much room the label has.
  const swH = rect.h * 0.55;
  const swW = swH * 1.7;
  const swPad = rect.h * 0.4;
  const sx = rect.x + rect.w - swPad - swW;
  const sy = rect.y + (rect.h - swH) / 2;

  // Label, sized to fit the remaining width.
  const labelX = rect.x + rect.h * 0.5;
  const labelMax = sx - labelX - rect.h * 0.3;
  let fontPx = Math.floor(rect.h * 0.4);
  ctx.font = `bold ${fontPx}px "Courier New", monospace`;
  if (ctx.measureText(label).width > labelMax) {
    fontPx = Math.floor(fontPx * labelMax / ctx.measureText(label).width);
    ctx.font = `bold ${fontPx}px "Courier New", monospace`;
  }
  ctx.fillStyle = '#a8ffaa';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, labelX, rect.y + rect.h / 2);

  // Switch box on the right
  ctx.fillStyle = on ? '#1a3a1a' : '#3a1a1a';
  ctx.fillRect(sx, sy, swW, swH);
  ctx.strokeStyle = on ? '#52ff66' : '#ff4040';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, swW, swH);

  ctx.fillStyle = on ? '#a8ffaa' : '#ffaaaa';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.floor(swH * 0.55)}px "Courier New", monospace`;
  ctx.fillText(on ? 'ON' : 'OFF', sx + swW / 2, sy + swH / 2);
  ctx.restore();
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

  const label = FLOOR_LABELS[getCurrentFloor(elevator)] ?? '?';
  const arrow =
    elevator.direction === 'UP' ? '▲' :
    elevator.direction === 'DOWN' ? '▼' : '';
  const text = elevator.emergencyStopped
    ? `⊘ STOP ${label}`
    : (arrow ? `${arrow} ${label}` : label);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = Math.floor(indicator.h * 0.55);
  ctx.font = `bold ${fontPx}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillText(text, indicator.x + indicator.w / 2 + 2, indicator.y + indicator.h / 2 + 2);
  ctx.fillStyle = elevator.emergencyStopped ? '#ff4040' : '#ffd060';
  ctx.fillText(text, indicator.x + indicator.w / 2, indicator.y + indicator.h / 2);
  ctx.restore();
}

// ---------- Middle: tower view ----------

function renderTowerView(ctx, layout, gameState) {
  const { tower: rect } = layout;
  const { tower: towerModel, elevator, player, assets } = gameState;
  const cameraY = getCameraY(player, elevator);
  const nightness = gameState.nightness ?? 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  drawSkyAndDirt(ctx, layout, cameraY, assets, nightness);
  drawFloors(ctx, layout, cameraY, towerModel, elevator, assets);

  drawNpcs(ctx, layout, cameraY, gameState.npcs ?? [], elevator, assets, gameState);

  if (isPlayerVisible(player, elevator)) {
    drawPlayer(ctx, layout, cameraY, player, elevator, assets);
  }

  ctx.restore();
}

function drawNpcs(ctx, layout, cameraY, npcs, elevator, assets, gameState) {
  let inElevatorIndex = 0;
  for (const npc of npcs) {
    if (!isNpcVisible(npc, elevator)) continue;
    const orderIndex = npc.state === 'IN_ELEVATOR' ? inElevatorIndex++ : 0;
    drawNpc(ctx, layout, cameraY, npc, elevator, assets, orderIndex, gameState);
  }
}

function drawNpc(ctx, layout, cameraY, npc, elevator, assets, indexInElevator, gameState) {
  const sprite = assets.player;
  if (!sprite) return;
  const { unitSizePx } = layout;

  const ON_FLOOR_HEIGHT = 0.9;
  const inElevator = npc.state === 'IN_ELEVATOR';
  const heightUnits = inElevator ? ON_FLOOR_HEIGHT * 0.5 : ON_FLOOR_HEIGHT;
  const centerXUnits = npcRenderXUnits(npc, indexInElevator);
  const baseYUnits = npcRenderFloor(npc, elevator);

  const aspect = sprite.width / sprite.height;
  const heightPx = heightUnits * unitSizePx;
  const widthPx = heightPx * aspect;
  const screenCenterX = towerXToScreenX(centerXUnits, layout);
  const screenBaseY = towerYToScreenY(baseYUnits, layout, cameraY);
  const dx = screenCenterX - widthPx / 2;
  const dy = screenBaseY - heightPx;

  const tinted = getTintedSprite(sprite, npcEffectiveColor(npc, gameState));
  ctx.drawImage(tinted, dx, dy, widthPx, heightPx);
}

// Blends an NPC's base color toward red based on how long they spent
// waiting for the elevator, relative to the rolling average trip time.
// Anger freezes the moment a rider boards — once they're inside the
// car they're moving, not waiting, so the color stays at whatever
// level they reached at boarding-time. Quantized to ~10 buckets so
// the tinted-sprite cache stays bounded.
function npcEffectiveColor(npc, gameState) {
  if (!gameState || !gameState.metrics) return npc.color;
  if (npc.state === 'WORKING' || npc.state === 'DESPAWNING') return npc.color;
  if (!npc.tripStartTime) return npc.color;
  const cutoff = npc.boardedAt ?? performance.now();
  const elapsed = cutoff - npc.tripStartTime;
  const anger = computeAnger(elapsed, gameState.metrics.averageMs);
  if (anger <= 0) return npc.color;
  const aq = Math.round(anger * 10) / 10;
  return lerpHex(npc.color, '#ff0000', aq);
}

function lerpHex(hex1, hex2, t) {
  const a = parseHex(hex1), b = parseHex(hex2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return '#' + h2(r) + h2(g) + h2(bl);
}
function parseHex(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2), 16), g: parseInt(h.slice(2,4), 16), b: parseInt(h.slice(4,6), 16) };
}
function h2(n) { return n.toString(16).padStart(2, '0'); }

// Cache of tinted offscreen canvases keyed by color. Built once per color.
const tintedSpriteCache = new Map();
function getTintedSprite(sprite, color) {
  const existing = tintedSpriteCache.get(color);
  if (existing && existing.sprite === sprite) return existing.canvas;

  const off = document.createElement('canvas');
  off.width = sprite.width;
  off.height = sprite.height;
  const octx = off.getContext('2d');
  octx.drawImage(sprite, 0, 0);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = color;
  octx.fillRect(0, 0, sprite.width, sprite.height);

  tintedSpriteCache.set(color, { canvas: off, sprite });
  return off;
}

function drawSkyAndDirt(ctx, layout, cameraY, assets, nightness = 0) {
  const { tower: rect, unitSizePx } = layout;
  const groundScreenY = towerYToScreenY(GROUND_LINE_Y, layout, cameraY);
  const skyHeight = Math.max(0, groundScreenY - rect.y);

  // Day sky always drawn (the night sky is overlaid on top with alpha).
  drawTiledRegion(ctx, assets.sky,
    rect.x, rect.y, rect.w, skyHeight,
    unitSizePx * BG_TILE_UNITS);

  // Night sky crossfade — 0 (full day) → 1 (full night).
  if (nightness > 0 && assets['night-sky']) {
    ctx.save();
    ctx.globalAlpha = nightness;
    drawTiledRegion(ctx, assets['night-sky'],
      rect.x, rect.y, rect.w, skyHeight,
      unitSizePx * BG_TILE_UNITS);
    ctx.restore();
  }

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
// overlapping the bottom of the elevator close-up tile. Used by both
// render and input.
export function computeActionButtonRects(layout) {
  const { bottomLeft, unitSizePx } = layout;
  const inset = unitSizePx * 0.25;        // 0.25u from the tile's bottom edge
  const buttonY = bottomLeft.y + bottomLeft.h - unitSizePx - inset;
  const ocX = bottomLeft.x + bottomLeft.w / 2 - unitSizePx - unitSizePx * 0.2;
  const ioX = bottomLeft.x + bottomLeft.w / 2 + unitSizePx * 0.2;
  return {
    openClose: { x: ocX, y: buttonY, w: unitSizePx, h: unitSizePx },
    inOut:     { x: ioX, y: buttonY, w: unitSizePx, h: unitSizePx },
  };
}

function renderBottomRegion(ctx, layout, gameState) {
  const { bottomLeft, bottomRight } = layout;
  const { assets, elevator } = gameState;

  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(layout.bottom.x, layout.bottom.y, layout.bottom.w, layout.bottom.h);

  // Bottom-left: elevator close-up tile (5u × 5u square).
  // Crossfades between the closed bank and the open interior with doorProgress.
  if (assets['elevator-bank']) {
    drawImageContain(ctx, assets['elevator-bank'], bottomLeft);
  } else {
    ctx.fillStyle = '#222';
    ctx.fillRect(bottomLeft.x, bottomLeft.y, bottomLeft.w, bottomLeft.h);
  }
  if (assets['elevator-current-floor'] && elevator.doorProgress > 0) {
    ctx.save();
    ctx.globalAlpha = elevator.doorProgress;
    drawImageContain(ctx, assets['elevator-current-floor'], bottomLeft);
    ctx.restore();
    // Anyone inside the elevator becomes visible against the open interior.
    drawCloseUpRiders(ctx, layout, gameState);
  }

  // 1u action buttons overlaid near the bottom of the elevator close-up.
  const buttons = computeActionButtonRects(layout);
  drawActionButton(ctx, buttons.openClose, 'O/C');
  drawActionButton(ctx, buttons.inOut, 'IN/OUT');

  // Bottom-right: control-panel face (elevator-button.png contained, 5u × 5u).
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(bottomRight.x, bottomRight.y, bottomRight.w, bottomRight.h);
  if (assets['elevator-button']) {
    drawImageContain(ctx, assets['elevator-button'], bottomRight);
  }
}

// Renders the player + NPCs that are IN_ELEVATOR onto the bottom-left
// close-up image. They stand on the carpet, spread horizontally inside
// the visible interior of the open elevator art.
function drawCloseUpRiders(ctx, layout, gameState) {
  const { bottomLeft } = layout;
  const { player, npcs, assets, elevator } = gameState;
  const sprite = assets.player;
  if (!sprite) return;

  // Collect everyone inside the car (NPC tints follow the anger blend)
  const riders = [];
  if (player.state === 'IN_ELEVATOR') riders.push({ tint: null });
  for (const npc of (npcs ?? [])) {
    if (npc.state === 'IN_ELEVATOR') riders.push({ tint: npcEffectiveColor(npc, gameState) });
  }
  if (riders.length === 0) return;

  // Carpet is roughly the lower 8% of the close-up image.
  const carpetY = bottomLeft.y + bottomLeft.h * 0.92;
  const figureH = bottomLeft.h * 0.42;
  const aspect = sprite.width / sprite.height;
  const figureW = figureH * aspect;

  // Spread within the central 55% of the tile width.
  const spreadW = bottomLeft.w * 0.55;
  const cx0 = bottomLeft.x + (bottomLeft.w - spreadW) / 2 + figureW / 2;
  const stepX = riders.length > 1 ? spreadW / (riders.length - 1) : 0;

  ctx.save();
  // Fade with doorProgress so figures don't pop in/out as doors animate.
  ctx.globalAlpha = elevator.doorProgress;
  for (let i = 0; i < riders.length; i++) {
    const cx = cx0 + (riders.length === 1 ? spreadW / 2 - figureW / 2 : i * stepX);
    const dx = cx - figureW / 2;
    const dy = carpetY - figureH;
    const img = riders[i].tint ? getTintedSprite(sprite, riders[i].tint) : sprite;
    ctx.drawImage(img, dx, dy, figureW, figureH);
  }
  ctx.restore();
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
// The grid occupies the upper 4/5 of the modal; STOP gets the bottom row.
export function computeKeypadButtons(modalArea) {
  const cols = 3;
  const rows = 4;
  const padX = modalArea.w * 0.08;
  const padY = modalArea.h * 0.08;
  const gridX = modalArea.x + padX;
  const gridY = modalArea.y + padY;
  const gridW = modalArea.w - padX * 2;
  const gridH = (modalArea.h - padY * 2) * (4 / 5);   // leaves 1/5 for STOP
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  const buttons = [];
  for (let p = 1; p <= 12; p++) {
    const floorIndex = p - 1;
    const label = FLOOR_LABELS[floorIndex];
    const mathRow = Math.floor((p - 1) / 3);
    const col = (p - 1) % 3;
    const displayRow = (rows - 1) - mathRow;
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

// Wide STOP button below the floor grid.
export function computeStopButtonRect(modalArea) {
  const padX = modalArea.w * 0.08;
  const padY = modalArea.h * 0.08;
  const gridH = (modalArea.h - padY * 2) * (4 / 5);
  const stopH = (modalArea.h - padY * 2) * (1 / 5);
  return {
    x: modalArea.x + padX,
    y: modalArea.y + padY + gridH,
    w: modalArea.w - padX * 2,
    h: stopH * 0.85,
  };
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

  // STOP button (wide, latched-red when active)
  const stopRect = computeStopButtonRect(area);
  drawStopButton(ctx, stopRect, elevator.emergencyStopped);

  // Close hint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const fontPx = Math.max(12, Math.floor(unitSizePx * 0.35));
  ctx.font = `bold ${fontPx}px monospace`;
  ctx.fillText('TAP OUTSIDE BUTTONS TO CLOSE', canvasWidth / 2, fontPx * 0.4);
  ctx.restore();
}

function drawStopButton(ctx, rect, active) {
  ctx.save();
  // Bezel
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const inset = Math.min(rect.w, rect.h) * 0.06;
  const bx = rect.x + inset, by = rect.y + inset;
  const bw = rect.w - inset * 2, bh = rect.h - inset * 2;

  if (active) {
    ctx.shadowColor = '#ff2030';
    ctx.shadowBlur = bh * 0.6;
    const grad = ctx.createRadialGradient(
      bx + bw / 2, by + bh / 2, 0,
      bx + bw / 2, by + bh / 2, Math.max(bw, bh) / 2
    );
    grad.addColorStop(0, '#ff8080');
    grad.addColorStop(0.6, '#e60010');
    grad.addColorStop(1, '#a00000');
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, '#a02020');
    grad.addColorStop(1, '#600000');
    ctx.fillStyle = grad;
  }
  ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? '#ffd0d0' : '#3a0a0a';
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#fff8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = active ? 'STOPPED' : 'STOP';
  // Size by width so the label always fits inside the button.
  const fontByWidth = bw / (text.length * 0.65);
  const fontByHeight = bh * 0.55;
  const fontPx = Math.max(10, Math.floor(Math.min(fontByWidth, fontByHeight)));
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.fillText(text, bx + bw / 2, by + bh / 2);
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
