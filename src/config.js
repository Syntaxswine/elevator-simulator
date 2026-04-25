// Geometry — all in units (1u = 1×1 elevator-shaft tile, screen_width / 10 in pixels)
export const TOWER_WIDTH_UNITS = 10;
export const WALL_WIDTH_UNITS = 0.5;
export const CORRIDOR_WIDTH_UNITS = 4;
export const SHAFT_WIDTH_UNITS = 1;
export const FLOOR_HEIGHT_UNITS = 1;

// Derived: x-coordinates in tower-units, measured from tower's left edge
export const LEFT_WALL_X = 0;
export const LEFT_CORRIDOR_X = WALL_WIDTH_UNITS;                                  // 0.5
export const SHAFT_LEFT_X = LEFT_CORRIDOR_X + CORRIDOR_WIDTH_UNITS;               // 4.5
export const SHAFT_RIGHT_X = SHAFT_LEFT_X + SHAFT_WIDTH_UNITS;                    // 5.5
export const RIGHT_CORRIDOR_X = SHAFT_RIGHT_X;                                    // 5.5
export const RIGHT_WALL_X = RIGHT_CORRIDOR_X + CORRIDOR_WIDTH_UNITS;              // 9.5

// Floors — bottom-up (index 0 = SB, ground floor at index 2 = "L")
export const FLOOR_LABELS = ['SB', 'B', 'L', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const FLOOR_COUNT = FLOOR_LABELS.length;
export const UNDERGROUND_FLOOR_LABELS = new Set(['SB', 'B']);
export const LOBBY_INDEX = FLOOR_LABELS.indexOf('L');
export const GROUND_LINE_Y = LOBBY_INDEX;  // bottom of L = top of B

// Layout
export const INDICATOR_HEIGHT_UNITS = 1;
export const BOTTOM_REGION_RATIO = 1 / 3;

// Tile-variant pools
export const OFFICE_VARIANTS = ['office-1', 'office-2', 'office-3'];
export const BASEMENT_VARIANT = 'basement';
export const LOBBY_VARIANT = 'lobby-floor';

// Default tower seed
export const DEFAULT_SEED = 1337;

// Elevator physics & timing
export const ELEVATOR_SPEED = 2.0;             // floors per second (cruise)
export const DOOR_TRANSITION_MS = 800;          // open / close animation duration
export const DOOR_DWELL_MS = 2500;              // doors stay open before auto-close
export const ARRIVAL_EPSILON = 0.001;           // floors

// Player movement
export const PLAYER_SPEED = 4.0;                // units per second (horizontal slide)
export const PLAYER_X_MIN = WALL_WIDTH_UNITS + 0.2;
export const PLAYER_X_MAX = TOWER_WIDTH_UNITS - WALL_WIDTH_UNITS - 0.2;
