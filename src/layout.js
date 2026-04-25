import {
  TOWER_WIDTH_UNITS,
  INDICATOR_HEIGHT_UNITS,
  BOTTOM_REGION_HEIGHT_UNITS,
} from './config.js';

// Compute pixel rectangles for each region, given canvas pixel dimensions.
// All "units" elsewhere in the code multiply against `unitSizePx`.
export function computeLayout(canvasWidth, canvasHeight) {
  const unitSizePx = canvasWidth / TOWER_WIDTH_UNITS;
  const indicatorH = INDICATOR_HEIGHT_UNITS * unitSizePx;
  // Bottom region is exactly two 5×5u tiles (5u tall, full width).
  const bottomH = BOTTOM_REGION_HEIGHT_UNITS * unitSizePx;
  const towerH = canvasHeight - indicatorH - bottomH;

  return {
    canvasWidth,
    canvasHeight,
    unitSizePx,
    indicator: { x: 0, y: 0, w: canvasWidth, h: indicatorH },
    tower:     { x: 0, y: indicatorH, w: canvasWidth, h: towerH },
    bottom:    { x: 0, y: indicatorH + towerH, w: canvasWidth, h: bottomH },
    bottomLeft:  { x: 0, y: indicatorH + towerH, w: canvasWidth / 2, h: bottomH },
    bottomRight: { x: canvasWidth / 2, y: indicatorH + towerH, w: canvasWidth / 2, h: bottomH },
  };
}

// Convert a tower-coordinate (units, y increasing upward, 0 = bottom of tower)
// to a screen-y pixel value, given the camera's tower-y center.
export function towerYToScreenY(towerY, layout, cameraY) {
  const centerScreenY = layout.tower.y + layout.tower.h / 2;
  return centerScreenY - (towerY - cameraY) * layout.unitSizePx;
}

// X is simpler — tower x=0 maps to screen x=0; whole tower fits the canvas width.
export function towerXToScreenX(towerX, layout) {
  return layout.tower.x + towerX * layout.unitSizePx;
}

// Inverse of towerYToScreenY — pixel y → tower y (units).
export function screenYToTowerY(screenY, layout, cameraY) {
  const centerScreenY = layout.tower.y + layout.tower.h / 2;
  return cameraY - (screenY - centerScreenY) / layout.unitSizePx;
}

// Inverse of towerXToScreenX — pixel x → tower x (units).
export function screenXToTowerX(screenX, layout) {
  return (screenX - layout.tower.x) / layout.unitSizePx;
}

// Camera anchor: follow the player. While riding, that's the elevator;
// otherwise it's whatever floor the player is standing on. This keeps the
// player's floor visible even when NPC traffic drags the car elsewhere.
export function getCameraY(player, elevator) {
  if (player.state === 'IN_ELEVATOR') return elevator.position + 0.5;
  return player.floor + 0.5;
}
