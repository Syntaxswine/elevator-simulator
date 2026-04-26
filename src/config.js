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
export const BOTTOM_REGION_HEIGHT_UNITS = 5;   // 5u tall: two 5×5 tiles side-by-side

// Tile-variant pools.
// Office floors are the default for every above-ground non-lobby slot.
// Restaurants are opt-in via the OPTIONS screen — when enabled, the tower
// places 0, 2, or 4 unique restaurant tiles (count chosen by the seed).
export const OFFICE_VARIANTS = ['office-1', 'office-2', 'office-3'];
export const RESTAURANT_VARIANTS = [
  'fast-food', 'sandwich-shop', 'sushi-restaurant',
  'upscale-food1', 'upscale-food2',
];
export const RESTAURANT_COUNT_CHOICES = [0, 2, 4];
export const BASEMENT_VARIANT = 'basement';
export const LOBBY_VARIANT = 'lobby-floor';

// NPC limits
export const NPC_DEFAULT_COUNT = 6;
export const NPC_MAX_COUNT = 10;

// Lunch wave — when enabled, every LUNCH_INTERVAL_MS the spawner enters a
// LUNCH_DURATION_MS window during which new casuals are sent straight to
// restaurant floors instead of random destinations. First instance of the
// "tile-attracts-visitors" pattern; future visitor schedules will plug in
// the same way.
export const LUNCH_DURATION_MS = 3 * 60 * 1000;
export const LUNCH_INTERVAL_MS = 17 * 60 * 1000;

// Default tower seed
export const DEFAULT_SEED = 1337;

// Elevator physics & timing
export const ELEVATOR_SPEED = 2.0;             // floors per second (cruise)
export const DOOR_TRANSITION_MS = 800;          // open / close animation duration
export const DOOR_DWELL_MS = 4000;              // doors stay open before auto-close (long enough for multiple NPCs to board/exit)
export const ARRIVAL_EPSILON = 0.001;           // floors

// Player movement
export const PLAYER_SPEED = 4.0;                // units per second (horizontal slide)
export const PLAYER_X_MIN = WALL_WIDTH_UNITS + 0.2;
export const PLAYER_X_MAX = TOWER_WIDTH_UNITS - WALL_WIDTH_UNITS - 0.2;

// Work-rush feature
export const WORK_RUSH_INITIAL_DELAY_MS    = 3 * 60 * 1000;   // 3 min after game start
export const WORK_RUSH_AT_WORK_DURATION_MS = 15 * 60 * 1000;  // 15 min day at the office
export const WORK_RUSH_DEPARTURE_DURATION_MS = 5 * 60 * 1000; // 5 min for departure + night cycle
export const WORK_RUSH_WORKER_COUNT        = 8;               // workers per wave
export const WORK_RUSH_SPAWN_STAGGER_MS    = 1500;            // gap between worker spawns
export const WORKER_COLOR                  = '#505050';       // dark grey silhouette
