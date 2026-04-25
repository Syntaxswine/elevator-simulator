# Elevator Simulator — Project Proposal

## 1. Vision

A '90s-aesthetic, click-driven game where the player is an emoji inhabitant of a procedurally-sized tower. The **headline feature is the elevator itself** — faithful to real elevator behavior (collective-selective dispatching, door timing, acceleration curves, emergency stop). The tower and its floors are the stage; the elevator is the star.

Calling it a "platformer" is slightly loose — there's no jumping. It's more a **point-and-click tower sim** with elevator mechanics as the core loop. Worth confirming if you want platformer elements layered on later (hazards, collectibles, NPCs on floors).

## 2. Tech Stack (recommendation)

**HTML5 Canvas + TypeScript, no game framework.** Reasoning:

- Click-based input is native in the browser; no input abstraction needed.
- Easy to render ASCII art (canvas text) and pixel art side-by-side.
- Zero build friction to start.
- Distributable as a static page or packaged with Electron/Tauri later if a standalone `.exe` is wanted.
- TypeScript keeps the state machines honest.

**Alternatives:**
- **Phaser 3** — built-in scene manager, tweens, audio. Slight bloat vs. what we actually need.
- **Love2D (Lua)** — most authentic '90s feel, single-binary distribution, but worse iteration loop.
- **PixiJS** — if hardware-accelerated sprites become necessary.

Start vanilla Canvas; only pull in a framework if a concrete need appears.

## 3. Screen Flow (game states)

```
  ┌───────────┐       ┌──────────────┐       ┌──────────────┐
  │  TITLE    │──────▶│  TOWER SETUP │──────▶│  GAMEPLAY    │
  │ (ASCII)   │       │ (sliders /   │       │ (tower +     │
  │           │       │  number in)  │       │  elevator)   │
  └───────────┘       └──────────────┘       └──────────────┘
       ▲                                            │
       └────────────── pause / quit ────────────────┘
```

**Scenes:**
1. **Title** — ASCII art of an elevator control panel, "PRESS ANY KEY / CLICK TO START," maybe a blinking cursor or floor-indicator animation.
2. **Tower Setup** — pick number of floors (1–100), optionally name the tower, preview the silhouette.
3. **Gameplay** — the main screen (below).
4. **Pause / Menu** — overlay, not a full scene.

## 4. Gameplay Screen Layout

Three regions:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│                  TOP: TOWER VIEW                     │
│         (floors + elevator shaft + player)           │
│                                                      │
│                                                      │
├──────────────────────────────┬───────────────────────┤
│                              │                       │
│    BOTTOM-LEFT:              │   BOTTOM-RIGHT:       │
│    ELEVATOR CAR INTERIOR     │   CONTROL PANEL       │
│    (close-up, shows emoji    │   (floor buttons +    │
│     when inside)             │    ▲ ▼ ◀▶ ◁▷ STOP)    │
└──────────────────────────────┴───────────────────────┘
```

### Tower geometry

- Upper floors: `4w` corridor each side of shaft → **9 units wide** total.
- Lower floors: `8w` corridor each side → **17 units wide** total.
- Elevator shaft: `1×1` per floor.
- **Open question:** where does the tower widen? Fixed lower-floor count, or a proportion of tower height?

The widening at the base gives a ziggurat/art-deco silhouette — good '90s pixel look.

### Viewport / camera

100 floors won't fit vertically. The top region needs a scrolling camera that follows the elevator (and the player when walking a floor). Smooth scroll during elevator travel is an important "feel" detail.

## 5. Core Systems

### 5.1 Scene Manager
Simple state machine: `TITLE | SETUP | GAMEPLAY | PAUSED`. One active scene owns update/render/input. Clean transition API.

### 5.2 Tower Model
```
Tower {
  floorCount: int (1..100)
  floors: Floor[]
  lowerFloorCount: int        // determines widening point
  shaftX: int                 // x-coord of shaft in tower units
}

Floor {
  index: int                  // 0 = ground (or 1; decide)
  leftCorridorWidth: int      // 4 or 8
  rightCorridorWidth: int     // 4 or 8
  contents: FloorEntity[]     // empty for now; hooks for later art/NPCs
}
```

### 5.3 Elevator Simulation — the most important subsystem

Two layers:

**A. Car state machine:**
```
IDLE → DOORS_OPENING → DOORS_OPEN → DOORS_CLOSING → IDLE
IDLE → MOVING_UP   ⇄ DECELERATING → ARRIVED → DOORS_OPENING
IDLE → MOVING_DOWN ⇄ DECELERATING → ARRIVED → DOORS_OPENING
ANY  → EMERGENCY_STOP → IDLE (after reset)
```

**B. Dispatcher (collective-selective):**
Real elevators queue requests and service them in the **current direction of travel** before reversing.
- `upCalls: Set<floor>` — external up requests
- `downCalls: Set<floor>` — external down requests
- `carCalls: Set<floor>` — inside-car requests
- Direction: `UP | DOWN | NONE`
- Next stop = nearest pending request in the current direction; if none, flip direction.

**Physics / timing (all tunable):**
- `accel` (floors/s²)
- `maxSpeed` (floors/s)
- `doorOpenDuration` (ms)
- `doorDwellTime` (ms before auto-close)
- `doorCloseCancelable` (door-open button interrupts closing — realism)
- `floorChime` (audio hook)

**Emergency stop:** halts immediately regardless of state, clears no pending calls, requires explicit reset.

### 5.4 Input System

All clicks route through a hit-test dispatcher that maps screen coordinates to one of:
- **Tower view click** on player's current floor → walk target (player glides horizontally).
- **Tower view click** on a different floor → ignored, or queues an external call at that floor (decide).
- **Control panel click** on a button → button-press event (floor / open / close / up / down / stop).
- **Elevator car click** → nothing, or emoji interaction (TBD).

**Design question:** the panel has `up` and `down` buttons. In a real elevator, up/down are *hall call* buttons on each floor, not inside the car. Options:
1. They're hall calls mirrored onto the panel for UI simplicity.
2. They're manual direction overrides (unrealistic).
3. They're "go up one / go down one floor" shortcuts.

Default: **(1)** — clicking panel `up` calls the car to the player's current floor requesting upward service.

### 5.5 Rendering

Single canvas, split into three sub-viewports each frame:
- `TowerRenderer` — floors, shaft, elevator car position, player, with camera offset.
- `ElevatorCarRenderer` — close-up interior (bottom-left).
- `PanelRenderer` — buttons, lit states, floor indicator, direction arrow.

Keep each renderer pure (state in, pixels out). That makes the '90s look easy to iterate on later.

### 5.6 Player Entity
```
Player {
  floor: int                  // which floor they're standing on
  xOffset: float              // horizontal position within that floor
  state: WALKING | IDLE | IN_ELEVATOR
  emoji: string               // default 🙂; configurable?
}
```

When the player walks to the shaft tile and the doors are open, they enter the elevator (state flips, player re-renders in the bottom-left car view, and moves with the car in the tower view too).

### 5.7 Assets
Visuals come later. The architecture assumes a sprite/tile pipeline where:
- Floors compose from tile sprites.
- Elevator car has a sprite (closed / open / mid-animation).
- Panel buttons are sprites with lit/unlit variants.
- An asset manifest (`assets.json`) maps logical names → files. Placeholder solid rectangles until real art lands.

## 6. Data Model Summary

```
GameState {
  scene: Scene
  tower: Tower
  elevator: Elevator
  player: Player
  camera: Camera
  input: InputState
  config: Config  // timings, dimensions, controls
}
```

Single top-level state tree, updated per tick. Easy to serialize for save/load later.

## 7. Open Design Questions

1. **Where does the tower widen?** Fixed lower-floor count, or proportion of tower height?
2. **What do `up`/`down` panel buttons mean?** (default guess in §5.4)
3. **Can the player click a different floor in the tower view?** Or only the elevator panel moves the car?
4. **Ground floor numbering** — 0-indexed, 1-indexed, include a "lobby" level?
5. **Goal loop.** What does the player *do* on floors? Sandbox, or objectives? ("Platformer" implies a gameplay verb beyond riding.)
6. **Multiple elevators?** Real '90s skyscrapers usually have banks. Single elevator is simpler; a bank-of-N is a significant dispatcher upgrade.
7. **Audio.** '90s elevator games live or die on the chimes. Worth scoping in even if art is later.
8. **Save/load** of tower configurations? Seeded randomization of floor contents later?

## 8. Proposed Milestones

**M0 — Scaffolding** (day 1–2)
Canvas, scene manager, game loop, empty title → setup → gameplay transitions.

**M1 — Static Tower + Elevator Rendering** (week 1)
Configurable floor count, tower silhouette with widening, elevator at a fixed floor, panel drawn with non-functional buttons.

**M2 — Elevator Simulation Core** (week 2)
Car state machine, dispatcher, full physics, panel button clicks work end-to-end. **No player yet** — this milestone proves "realistic elevator" is achieved.

**M3 — Player + Click Movement** (week 3)
Emoji player, walk-to-click on current floor, enter/exit elevator at open shaft, player rides in car view.

**M4 — Title Screen ASCII Polish + Setup Screen** (week 3–4)
ASCII control-panel title art, configurable tower setup UI.

**M5 — Art Swap** (when assets arrive)
Replace placeholders with real sprites; tune the '90s look.

**M6+ — Gameplay content**
Whatever "things on floors" turns out to be. Depends on open question #5.
