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

```
┌────────────────────────────────────────────────────┐
│ ░│                                              │░ │
│ ░│        TOP: TOWER VIEW                       │░ │  ← sky above ground
│ ░│  (10 floors visible: L through 10)           │░ │
│ ▓│                                              │▓ │
│ ▓│  (2 floors below ground: B, SB)              │▓ │  ← dirt below ground
│ ▓│                                              │▓ │
├──────────────────────────┬─────────────────────────┤
│                          │                         │
│   BOTTOM-LEFT:           │   BOTTOM-RIGHT:         │
│   ELEVATOR PICTURE       │   PANEL PICTURE         │
│   (tap = toggle doors)   │   (tap = open keypad    │
│   ┌────┐ ┌────┐          │    modal)               │
│   │ENTR│ │EXIT│          │                         │
│   └────┘ └────┘          │                         │
└──────────────────────────┴─────────────────────────┘
```

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

### Viewport / camera

12 floors should fit in the top region without scrolling on most viewports. Verify when we scaffold. If portrait-mobile is too tight, the camera follows the elevator car.

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

Buttons sized for thumb taps. Tapping any button **dismisses the modal and acts**:
- Floor button → triggers the auto-dispatch sequence (see §5.3).
- ▲ / ▼ → request directional service (see §5.4 design note).
- STOP → emergency stop.

Door open/close is **not** in the modal — that's handled by tapping the elevator picture directly.

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

**B. Dispatcher — staged in two phases:**

**Phase 1 (M2): Auto-dispatch.** One floor request at a time. Pressing a floor button:
1. (if doors open) `DOORS_CLOSING → IDLE`
2. `MOVING_*` toward target, `DECELERATING` near it
3. `ARRIVED → DOORS_OPENING → DOORS_OPEN`
That's the full trip. No queue; if the player taps another floor button mid-trip we either ignore it, override, or queue it (decide — leaning *override* for the simplest UX in M2).

**Phase 2 (M3+): Collective-selective queue (the ideal).** Real elevators service all requests in the **current direction of travel** before reversing.
- `upCalls: Set<floor>` — external up requests
- `downCalls: Set<floor>` — external down requests
- `carCalls: Set<floor>` — inside-car requests
- Direction: `UP | DOWN | NONE`
- Next stop = nearest pending request in current direction; if none, flip direction.

Phase 2 unlocks the real "realistic elevator" claim. It's also what makes NPC traffic interesting (NPCs calling the car while you're riding).

**Physics / timing (all tunable):**
- `accel` (floors/s²)
- `maxSpeed` (floors/s)
- `doorOpenDuration` (ms)
- `doorDwellTime` (ms before auto-close — Phase 2 only)
- `doorCloseCancelable` (door-open button interrupts closing — realism)
- `floorChime` (audio hook)

**Emergency stop:** halts immediately regardless of state, clears no pending calls, requires explicit reset.

### 5.4 Input System

Hit-test dispatcher mapping screen taps to events:

| Region | Tap action |
|---|---|
| Tower view, player's current floor | walk target — player glides horizontally |
| Tower view, other floors (Phase 2) | optional: queue a hall call |
| Elevator picture (lower-left) | toggle doors (open if closed, close if open) — only valid while car is `IDLE` |
| ENTR sub-button (under elevator pic) | walk emoji into car, if car is at player's floor with doors open |
| EXIT sub-button (under elevator pic) | walk emoji out of car, if doors are open |
| Panel picture (lower-right) | open modal keypad |
| Modal: floor button | dismiss modal + trigger auto-dispatch |
| Modal: ▲ / ▼ | dismiss modal + register directional call |
| Modal: STOP | dismiss modal + emergency stop |
| Modal: close button | dismiss modal, no action |

**▲/▼ semantics.** Real elevators put up/down on each floor (hall-call buttons), not in the car. Treating them as "hall call from the player's current floor with this preferred direction" is the reading I'd default to. Mostly only matters in Phase 2 (queue) — in Phase 1 they could be redundant with the floor buttons.

### 5.5 Rendering

Single canvas, split into regions each frame:
- `TowerRenderer` — floors, shaft, elevator car position, player, sky/dirt backgrounds, exterior walls, with camera offset.
- `ElevatorPictureRenderer` — close-up of the car (lower-left) showing emoji when inside; renders ENTR/EXIT sub-buttons.
- `PanelPictureRenderer` — schematic / sprite of the panel (lower-right).
- `KeypadModalRenderer` — drawn on top when modal is active; dims the rest of the screen.

Keep each renderer pure (state in, pixels out). Easy to swap pixel art when assets land.

### 5.6 Player Entity
```
Player {
  floor: int                  // index 0..11
  xOffset: float              // horizontal position within that floor's corridor
  state: WALKING | IDLE | IN_ELEVATOR
  emoji: string               // 🙂 default; configurable
}
```

Movement summary:
- On a floor: tap floor → player walks to the tap point.
- Tap ENTR sub-button (when car at this floor + doors open) → player walks into car, `state = IN_ELEVATOR`.
- While IN_ELEVATOR: emoji rides with the car in the tower view AND shows in the elevator picture.
- Tap EXIT sub-button (when doors open) → player walks out onto the current floor, `state = WALKING/IDLE`.

No auto-exit; the player explicitly chooses when to leave the car.

### 5.7 Assets
Visuals come later. The architecture assumes a sprite/tile pipeline where:
- Floors compose from tile sprites; sky and dirt are tiled backgrounds.
- Elevator car has a sprite per door state (closed / opening / open / closing).
- Panel picture and keypad button sprites with lit/unlit variants.
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

1. **▲/▼ panel button semantics.** Default: hall calls from the player's current floor. Mostly relevant in Phase 2.
2. **Mid-trip button presses (Phase 1).** Ignore, override, or queue?
3. **Goal loop.** What does the player *do* on floors? Sandbox, or objectives? ("Platformer" implies a gameplay verb beyond riding.)
4. **Multiple elevators.** Single car for now. A bank-of-N is a significant dispatcher upgrade — defer.
5. **Audio.** '90s elevator games live or die on the chimes. Worth scoping in early.
6. **Save/load.** Less relevant with the fixed tower; revisit when/if floor contents become persistent.
7. **Modal contents.** Door-open and door-close are intentionally **not** in the modal (door toggle is on the elevator picture). Confirm that's the intent — alternative is to put them in the modal too for accessibility / desktop play.
8. **Portrait vs landscape on phones.** The three-region layout assumes landscape-ish proportions. Worth deciding: lock orientation, or design a portrait variant.

## 8. Proposed Milestones

**M0 — Scaffolding** (day 1–2)
Canvas, scene manager, game loop, title → gameplay transition, region splitting.

**M1 — Static Tower + Elevator Rendering** (week 1)
12 floors with sky/dirt backgrounds, shaft, elevator car at a fixed floor, panel + elevator pictures drawn (non-functional), keypad modal layout (non-functional).

**M2 — Auto-Dispatch Elevator + Modal Wired Up** (week 2)
Tap panel → keypad opens → tap floor → modal closes, doors close, car travels, doors open. Door toggle on elevator picture works. Emergency stop works. **No player yet** — proves the elevator mechanics.

**M3 — Player + Enter/Exit + Floor Walking** (week 3)
Emoji player, walk-to-tap on current floor, ENTR/EXIT sub-buttons, player rides in car view. With M2's auto-dispatch, the core loop is now complete.

**M4 — Collective-Selective Queue (the "ideal" upgrade)**
Replace auto-dispatch with the queueing dispatcher. Lit-button visual states for pending calls. Hall-call mechanic for ▲/▼.

**M5 — Title Screen ASCII Polish**
ASCII control-panel title art, transitions, intro animation.

**M6 — Art Swap** (when assets arrive)
Replace placeholders with real sprites; tune the '90s look.

**M7+ — Gameplay content**
Whatever "things on floors" turns out to be. Depends on open question #3.
