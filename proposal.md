# Elevator Simulator — Project Proposal

## 1. Vision

A '90s-aesthetic, click/tap-driven game where the player is an emoji inhabitant of a 12-floor tower. The **headline feature is the elevator itself** — aiming over time at faithful real-elevator behavior (queued collective-selective dispatching, door timing, acceleration curves, emergency stop). The tower and its floors are the stage; the elevator is the star.

**Mobile-first scope.** A 100-floor tower would be great on a desktop, but the target is something playable on a phone. That drives the fixed 12-floor scope and the modal-panel UX described below.

Calling it a "platformer" is slightly loose — there's no jumping. It's more a **point-and-tap tower sim** with elevator mechanics as the core loop. Hooks are in place for platformer-ish content on floors later (hazards, collectibles, NPCs).

## 2. Tech Stack (recommendation)

**HTML5 Canvas + TypeScript, no game framework.** Reasoning:

- Click/tap input is native in the browser; no input abstraction needed.
- Easy to render ASCII art (canvas text) and pixel art side-by-side.
- Zero build friction to start.
- Same code runs on desktop and mobile browsers — mobile-first is essentially free.
- Distributable as a static page or wrapped with Capacitor / Tauri later if a standalone app is wanted.
- TypeScript keeps the state machines honest.

**Alternatives:**
- **Phaser 3** — built-in scene manager, tweens, audio. Slight bloat vs. what we actually need.
- **Love2D (Lua)** — most authentic '90s feel, single-binary distribution, but no mobile-web story.
- **PixiJS** — if hardware-accelerated sprites become necessary.

Start vanilla Canvas; only pull in a framework if a concrete need appears.

## 3. Screen Flow (game states)

```
  ┌───────────┐         ┌──────────────┐
  │  TITLE    │────────▶│  GAMEPLAY    │
  │ (ASCII)   │         │ (tower +     │
  │           │         │  elevator)   │
  └───────────┘         └──────────────┘
       ▲                       │
       └──── pause / quit ─────┘
```

**Scenes:**
1. **Title** — ASCII art of an elevator control panel; "PRESS ANY KEY / TAP TO START"; blinking cursor or floor-indicator animation.
2. **Gameplay** — the main screen (below).
3. **Pause / Menu** — overlay, not a full scene.
4. **Modal keypad** — overlay summoned from the gameplay screen (see §4).

A tower-setup screen is dropped for now. The 12-floor layout is fixed, so there's nothing to configure. If options return later (theme, seed, difficulty) a setup screen slots in between Title and Gameplay.

## 4. Gameplay Screen Layout

**Vertical split: 1u floor-indicator strip at top, tower view in the middle, bottom 1/3 of total height for the two graphics + action buttons.**

```
┌────────────────────────────────────────────────────┐
│              ▲   L         (floor indicator)       │ ← 1u HUD strip
├────────────────────────────────────────────────────┤
│ ░│                                              │░ │ ╲
│ ░│        TOWER VIEW                            │░ │  │
│ ░│  (player as bathroom-sign sprite)            │░ │  │ tower
│ ▓│                                              │▓ │  │ viewport
│ ▓│  (dirt below ground line)                    │▓ │  │ (≈ 2/3 - 1u)
│ ▓│                                              │▓ │ ╱
├──────────────────────────┬─────────────────────────┤
│                          │                         │ ╲
│   ELEVATOR DOORS         │   CONTROL PANEL         │  │
│   (graphic, visual       │   (graphic; tap to      │  │ bottom
│    door state)           │    open keypad modal)   │  │ 1/3
│                          │                         │  │
│   [O/C]  [IN/OUT]        │                         │  │
│   1u×1u  1u×1u           │                         │ ╱
└──────────────────────────┴─────────────────────────┘
```

**Floor indicator (HUD, top 1u strip):** a thin full-width strip showing the elevator's current floor label (`SB`, `B`, `L`, `2`–`10`) and a direction arrow (`▲` / `▼` / none). The number **ticks as the car crosses floor thresholds** during travel, so the player has live feedback while the doors are closed and they can't see anything else. Visible at all times during gameplay.

`[O/C]` = open/close door button. `[IN/OUT]` = get in/out toggle. Both are **1 unit × 1 unit** (where "unit" is the same 1×1 square as the elevator shaft tile — see Unit system below).

### Tower geometry (fixed)

- **12 floors total**, labeled bottom-up: `SB, B, L, 2, 3, 4, 5, 6, 7, 8, 9, 10`
- `SB` = sub-basement, `B` = basement (both **below ground**, drawn against dirt).
- `L` = lobby = ground floor (the "1" slot is intentionally skipped, hotel-style).
- `2`–`10` are above ground (drawn against sky).
- Every floor has the **same** geometry:
  - Left corridor: 1h × 4w
  - Elevator shaft: 1h × 1w (centered)
  - Right corridor: 1h × 4w
  - Total interior: 9w × 1h
- A `1h × 0.5w` exterior wall tile sits on either side of every floor.
- Outside the wall: **sky** above ground (L and up), **dirt** below ground (SB and B).
- Total tower outer width: `0.5 + 4 + 1 + 4 + 0.5 = 10` units.

The earlier "widen at the base" idea is dropped — uniform floors are simpler and read better at phone sizes. (One gap to flag: this loses some silhouette interest. If we want any vertical variety later, easiest add-back is decorative facade detail, not floor-width changes.)

### Unit system (load-bearing)

All in-game dimensions are expressed in **units**. **A unit is one 1×1 square — the same dimensions as the elevator shaft tile.** This is the canonical term used throughout the rest of this document and in code.

One unit is derived in pixels at runtime:

```
unit_size_px = screen_width_px / 10
```

The shaft tile is the **scale anchor**. Because it's square, it fixes the unit's horizontal *and* vertical size simultaneously — there is no separate vertical unit. Every other tile is a multiple:

| Tile | Width × Height (units) |
|---|---|
| Elevator shaft | 1 × 1 |
| Floor corridor | 4 × 1 |
| Exterior wall | 0.5 × 1 |
| Floor row (whole floor) | 9 × 1 (interior) / 10 × 1 (with walls) |

**Consequences (these shape the rendering architecture):**

1. **No fixed pixel layout.** The renderer reads canvas width, computes `unit_size_px`, and draws in unit coordinates. Resize the window or rotate the device → world re-scales smoothly. No breakpoints needed.
2. **Visible-floor count is *derived*, not configured.** `floors_visible_at_once ≈ tower_viewport_height_px / unit_size_px`. On a tall phone, more of the tower fits; on a wider/shorter window, less. The camera handles which floors are in frame (next subsection).
3. **Bottom region is exactly 1/3 of screen height** (not a fixed unit count). Its height in units therefore *varies with aspect ratio*: ~5–7 units tall on a portrait phone, ~2 units tall on a landscape window. The 1u×1u action buttons fit anywhere from ~2u tall and up; on very wide/short screens the bottom region gets cramped (flagged in §7 portrait/landscape question). The **top 1u** is the floor-indicator HUD. The tower viewport gets the remainder: `screen_height - 1u - (1/3 × screen_height)` ≈ `(2/3 × screen_height) - 1u`. Visible-floor count derives from that.
4. **Sprites must be authored at unit-multiples.** Pick a base sprite resolution (e.g. 64 px = 1 unit) and every asset is a clean multiple. The shaft tile is the canonical 1-unit reference; everything else is sized against it.

This is why the 10-unit width matters: it makes the unit-from-screen-width division clean, and the square shaft tile makes the unit consistent across both axes for free.

### Camera

- **Vertical:** the tower viewport is always centered vertically on the **elevator car**. When the elevator moves, the tower scrolls past it. How many floors are visible above and below the car is whatever fits at the current `unit_size_px` (see Unit system).
- **Horizontal:** no scroll, ever. The full 10-unit tower width *is* the screen width by construction.
- **Player rendering:** the player figure (bathroom-sign style — see §5.6) slides left/right within the on-screen 4-unit corridor; the world doesn't scroll horizontally, the figure just translates within the viewport.
- **Player + elevator co-location (M2 default):** while there's only one call active at a time and no NPCs, the elevator stays parked at the player's floor when they walk off, so the player is always at vertical center too. They diverge only in M4 when external calls drag the elevator away.
- **M4 edge case:** when NPC calls move the elevator off the player's floor, the player's floor scrolls off-center. They remain on that floor and need to call the car back. UX implication flagged in §7.

### Modal keypad (summoned from panel picture)

When the player taps the panel picture (lower-right), a modal overlay covers the gameplay screen with a large keypad:

```
┌──────────────────────────────────┐
│           [  ✕ close ]           │
│                                  │
│   [  10 ]  [   9 ]  [   8 ]      │
│   [   7 ]  [   6 ]  [   5 ]      │
│   [   4 ]  [   3 ]  [   2 ]      │
│   [   L ]  [   B ]  [  SB ]      │
│                                  │
│   [  ▲  ]  [  ▼  ]  [ STOP ]     │
└──────────────────────────────────┘
```

Buttons sized for thumb taps. Tapping a floor button **adds it to the in-car queue** and lights up; the car services queued floors in travel order. ▲/▼ register a hall call (M4). STOP triggers emergency stop. Whether tapping a floor button auto-dismisses the modal or keeps it open for multi-press is open (§7 #2); the more elevator-like behavior is to keep it open until the player explicitly closes it.

Door open/close is **not** in the modal — that's the dedicated 1u Open/Close button next to the elevator graphic.

## 5. Core Systems

### 5.1 Scene Manager
Simple state machine: `TITLE | GAMEPLAY | PAUSED`. The keypad is a modal overlay on top of GAMEPLAY, not its own scene. One active scene owns update/render/input. Clean transition API.

### 5.2 Tower Model
```
Tower {
  floors: Floor[12]            // fixed
  shaftX: 4                    // shaft is 5th column (after 0.5 wall + 4 corridor)
}

Floor {
  index: int                   // 0..11, bottom-up
  label: "SB" | "B" | "L" | "2" | ... | "10"
  isUnderground: bool          // true for SB, B (drives sky vs dirt)
  contents: FloorEntity[]      // empty for now; hooks for later art/NPCs
}
```

A small lookup maps `label ↔ index` (e.g. `"L" ↔ 2`). The label is the user-facing identifier; the index is what the elevator state machine uses.

### 5.3 Elevator Simulation — the most important subsystem

Two layers:

**A. Car state machine (unchanged from v1):**
```
IDLE → DOORS_OPENING → DOORS_OPEN → DOORS_CLOSING → IDLE
IDLE → MOVING_UP   ⇄ DECELERATING → ARRIVED → DOORS_OPENING
IDLE → MOVING_DOWN ⇄ DECELERATING → ARRIVED → DOORS_OPENING
ANY  → EMERGENCY_STOP → IDLE (after reset)
```

**B. Dispatcher — collective-selective from the start, expanded in phases:**

The elevator behaves like a real one: when traveling **up** it services pending requests in **ascending floor order**; when traveling **down**, in **descending floor order**. Mid-trip presses for floors in the current direction get serviced en route. Opposite-direction or already-passed presses queue until the current direction's requests are exhausted, then the car reverses.

State:
- `carCalls: Set<floor>` — inside-car requests (M2)
- `upCalls: Set<floor>` — external up hall-calls (M4)
- `downCalls: Set<floor>` — external down hall-calls (M4)
- `direction: UP | DOWN | NONE`
- Next stop = nearest pending request in `direction`; if none, flip direction; if both empty, IDLE.

**Phase split:**
- **M2 — In-car queue.** Only `carCalls`. Player can tap several floor buttons; car services them in travel order. This already gives the realistic feel.
- **M4 — Hall calls + NPCs.** Add `upCalls`/`downCalls`, wire ▲/▼ to the player's current floor, introduce NPCs that generate external calls. Now the dispatcher's full collective-selective behavior earns its keep.

**Physics / timing (all tunable):**
- `accel` (floors/s²)
- `maxSpeed` (floors/s)
- `doorOpenDuration` (ms)
- `doorDwellTime` (ms before auto-close — relevant once there's a queue, i.e. from M2)
- `doorCloseCancelable` (door-open button interrupts closing — realism)
- `floorChime` (audio hook)

**Emergency stop:** halts immediately regardless of state, clears no pending calls, requires explicit reset.

### 5.4 Input System

**Hit regions are decoupled from visual regions.** A button's drawn sprite is sized to fit the world (e.g. 1u to look right next to the elevator graphic), but its tap target is sized to fit a thumb (≥ ~44 px / 1.2–1.5u). The renderer draws the 1u sprite; the hit-tester checks against a separate, larger rectangle centered on it. This is the canonical way to keep small visual elements thumb-tappable without bloating the art.

The same applies to floor-walk taps in the tower view — the player floor's tap region can extend slightly above and below the visible floor band so a sloppy tap still walks them.

Hit-test dispatcher mapping screen taps to events:

| Region | Tap action |
|---|---|
| Tower view, player's current floor | walk target — player slides horizontally |
| Tower view, other floors (M4) | optional: register a hall call |
| Elevator doors graphic (lower-left) | none — purely visual, shows door state |
| **Open/Close button** (1u×1u, near elevator graphic) | toggle doors (open if closed, close if open) — only valid while car is `IDLE` |
| **In/Out button** (1u×1u, near elevator graphic) | toggle player `IN_ELEVATOR` state when car is at their floor with doors open. No walking animation; player sprite scales (smaller in elevator, full size on floor) |
| Panel graphic (lower-right) | open modal keypad |
| Modal: floor button | add floor to in-car queue, light button (modal stay-or-dismiss per §7 #2) |
| Modal: ▲ / ▼ | register hall call from player's current floor (M4) |
| Modal: STOP | emergency stop, dismiss modal |
| Modal: close button | dismiss modal, no action |

**▲/▼ semantics.** Real elevators put up/down on each floor (hall-call buttons), not in the car. Treating them as "hall call from the player's current floor with this preferred direction" is the reading I'd default to. Mostly only matters in M4 — pre-M4 they're inert.

### 5.5 Rendering

Single canvas, split into regions each frame. **All renderers work in unit coordinates**; a single `unit_size_px` (computed from canvas width / 10) is multiplied in at draw time. State carries no pixel values.

- `FloorIndicatorRenderer` — top 1u HUD strip; reads `elevator.currentFloor` (or the floor it's currently crossing during travel) and `elevator.direction`. Updates discretely as the car crosses thresholds.
- `TowerRenderer` — floors, shaft, elevator car position, sky/dirt backgrounds, exterior walls, with camera offset. Renders the player sprite **only when visible** per §5.6 (full size on a floor, small inside the shaft tile if doors are open, hidden otherwise).
- `ElevatorGraphicRenderer` — close-up of the car doors (lower-left), purely visual based on door state.
- `ActionButtonRenderer` — the 1u Open/Close and 1u In/Out buttons.
- `PanelPictureRenderer` — schematic / sprite of the panel (lower-right).
- `KeypadModalRenderer` — drawn on top when modal is active; dims the rest of the screen.

Keep each renderer pure (state in, pixels out). Easy to swap pixel art when assets land.

### 5.6 Player Entity
```
Player {
  floor: int                  // index 0..11
  xOffset: float              // horizontal position within that floor (in units)
  state: SLIDING | IDLE | IN_ELEVATOR
  sprite: BathroomSignFigure  // see below
}
```

**Sprite**: a stylized figure in the style of a public-bathroom sign — geometric, head + torso + limbs, no faces or detail. Single static silhouette; no walk cycle. Movement is pure position interpolation — the figure **slides** through space.

**Visibility & scale (rendered in the tower view):**

| State | Doors | Render |
|---|---|---|
| On floor (`SLIDING` / `IDLE`) | open or closed | full size, on the floor in the corridor |
| `IN_ELEVATOR` | **open** | smaller, framed inside the 1u shaft tile (visible through the open doors) |
| `IN_ELEVATOR` | **closed** | **not rendered** — the closed doors hide the interior |

So when the elevator is traveling (doors closed by definition), the player simply isn't drawn. You see the elevator car shell move through the shaft. When it arrives and the doors open, the figure pops back into view inside the tile. This is also the only time scale changes: it's not really "the In/Out button shrinks the sprite," it's that **inside the elevator with doors open** is the only context where the sprite is drawn small.

There is no walking animation into or out of the car. The figure stays at the same on-screen horizontal position; entering/exiting is just a state flip plus a render-rule change.

Movement summary:
- On a floor: tap floor → player slides horizontally to the tap point.
- Tap In/Out (car at this floor + doors open + player on this floor) → `IN_ELEVATOR`. Sprite is now drawn smaller inside the shaft tile.
- Doors close, car travels, doors open: during travel the sprite is hidden; on arrival it reappears inside the new floor's shaft tile.
- Tap In/Out (doors open + player IN_ELEVATOR) → exit, sprite returns to full size on the current floor.

No auto-exit; the player explicitly toggles state.

### 5.7 Assets
Visuals come later. The architecture assumes a sprite/tile pipeline where:
- All sprites are authored at **unit-multiple resolutions** (e.g. base 64 px = 1 unit; the 1×1 shaft tile is 64×64, a 4×1 corridor is 256×64, a 0.5×1 wall is 32×64). Pick the base once, every asset follows.
- Floors compose from tile sprites; sky and dirt are tiled backgrounds.
- Elevator car has a sprite per door state (closed / opening / open / closing).
- The lower-left **elevator doors graphic** is a separate, larger close-up showing door state for visual feedback (its size in units is whatever fits in the bottom-left half of the bottom 1/3).
- Panel graphic and keypad button sprites with lit/unlit variants.
- **Player sprite**: a single bathroom-sign-style pictogram. Static silhouette; no animation frames. Just two render scales (on-floor full size, in-elevator shrunk to fit the shaft tile). One asset, one figure, all motion via position/scale interpolation.
- An asset manifest (`assets.json`) maps logical names → files. Placeholder solid rectangles until real art lands.

## 6. Data Model Summary

```
GameState {
  scene: Scene                   // TITLE | GAMEPLAY | PAUSED
  modal: Modal | null            // KEYPAD | null
  tower: Tower
  elevator: Elevator
  player: Player
  camera: Camera
  input: InputState
  config: Config                 // timings, dimensions, controls
}
```

Single top-level state tree, updated per tick. Easy to serialize later.

## 7. Open Design Questions

1. **▲/▼ panel button semantics.** Default: hall calls from the player's current floor. Activates in M4.
2. **Modal multi-press UX.** With the in-car queue (M2), the player will sometimes want to tap multiple floor buttons in one visit. Two options: (a) modal closes after each tap, player reopens to add more; (b) modal stays open until the player explicitly closes it, queued floors light up. (b) is more elevator-like; leaning that way.
3. **Player visibility during M4 (NPC calls).** When the elevator leaves the player's floor to serve another call, the player's floor scrolls off-center while the camera follows the elevator. Acceptable, or do we want a fallback (picture-in-picture of the player, indicator arrow, dual-anchor camera)?
4. **Goal loop.** What does the player *do* on floors? Sandbox, or objectives? ("Platformer" implies a gameplay verb beyond riding.)
5. **Multiple elevators.** Single car for now. A bank-of-N is a significant dispatcher upgrade — defer.
6. **Audio.** '90s elevator games live or die on the chimes. Worth scoping in early.
7. **Save/load.** Less relevant with the fixed tower; revisit when/if floor contents become persistent.
8. **Portrait vs landscape.** The bottom-1/3 layout works *better* the taller the screen is — portrait phones get 5–7 units of bottom region, landscape windows get ~2 units which gets tight for the elevator graphic + 1u buttons. Lock to portrait? Or design a fallback for short-and-wide?
9. ~~1u touch-target size on small phones.~~ **Resolved**: hit region is independent of visual region (§5.4). The 1u button *art* stays small to look right next to the elevator; the *tap target* is sized for a thumb. No tradeoff.

## 8. Proposed Milestones

**M0 — Scaffolding** (day 1–2)
Canvas, scene manager, game loop, title → gameplay transition, region splitting.

**M1 — Static Tower + Elevator Rendering** (week 1)
12 floors with sky/dirt backgrounds, shaft, elevator car at a fixed floor, elevator doors graphic + control panel graphic + 1u Open/Close + 1u In/Out buttons drawn (non-functional), keypad modal layout (non-functional), floor-indicator HUD strip rendered with the static current floor. Verify the layout (1u top + 2/3-1u tower + 1/3 bottom) renders correctly across portrait phone aspect ratios.

**M2 — Realistic Elevator + Modal Wired Up** (week 2)
Tap panel graphic → keypad opens → tap one or more floor buttons → car queues them and services in travel order (collective-selective for in-car requests). Lit-button visual state for queued floors. Open/Close button toggles doors. Emergency stop works. **Floor-indicator HUD ticks live** as the car crosses thresholds, plus shows direction arrow. **No player yet** — proves the elevator mechanics.

**M3 — Player + Enter/Exit + Floor Walking** (week 3)
Bathroom-sign player sprite, slide-to-tap on current floor, In/Out toggle button (sprite scales between full size on floor and shrunk in elevator), player rides with the car in the tower view. Camera follows the elevator vertically. Core loop complete.

**M4 — Hall Calls + NPC Traffic**
Add ▲/▼ hall-call mechanic from the player's current floor; introduce NPCs that generate external calls. The collective-selective dispatcher (already in place from M2) gets its full workout. Decide on player-visibility behavior when the car is dragged away (see §7 #3).

**M5 — Title Screen ASCII Polish**
ASCII control-panel title art, transitions, intro animation.

**M6 — Art Swap** (when assets arrive)
Replace placeholders with real sprites; tune the '90s look.

**M7+ — Gameplay content**
Whatever "things on floors" turns out to be. Depends on open question #3.
