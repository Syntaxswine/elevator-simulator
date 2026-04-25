import {
  TOWER_WIDTH_UNITS,
  INDICATOR_HEIGHT_UNITS,
  BOTTOM_REGION_RATIO,
} from './config.js';

// Compute pixel rectangles for each region, given canvas pixel dimensions.
// All "units" elsewhere in the code multiply against `unitSizePx`.
export function computeLayout(canvasWidth, canvasHeight) {
  const unitSizePx = canvasWidth / TOWER_WIDTH_UNITS;
  const indicatorH = INDICATOR_HEIGHT_UNITS * unitSizePx;
  const bottomH = canvasHeight * BOTTOM_REGION_RATIO;
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
