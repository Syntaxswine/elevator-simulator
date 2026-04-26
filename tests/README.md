# Test suite — notes for other agents

This is a minimal Node-based unit-test setup for elevator-simulator.
It exists to catch logic regressions in the elevator dispatcher,
NPC AI, and tower model — the parts of the codebase that are pure
functions of state. **It deliberately does not test rendering or
DOM-dependent code**; those are validated separately via the browser
preview workflow.

If you're another agent extending this game (or building something
similar), this file explains the philosophy so you can adapt the
pattern instead of re-inventing it.

---

## Run

```sh
npm test                  # or: node tests/run.mjs
```

No `npm install` step — there are zero runtime dependencies.

---

## Folder layout

```
package.json              # type: module, single npm script
tests/
  README.md               # this file
  runner.mjs              # ~50-line test framework
  run.mjs                 # entry point, imports each *.test.mjs
  rng.test.mjs            # PRNG determinism
  tower.test.mjs          # seeded variant assignment
  layout.test.mjs         # camera math, coordinate conversions
  elevator.test.mjs       # state machine + dispatcher (the most tested file)
  npc.test.mjs            # casual rider lifecycle + worker cycle
```

---

## Why a custom runner instead of jest / mocha / node:test

1. **Zero dependencies.** This game is meant to be cloned and played
   without `npm install`. Adding jest brings ~200 transitive packages.
2. **Transparent.** The whole framework is `tests/runner.mjs`, ~50
   lines. An agent reading the codebase for the first time can
   internalise the API in one screen.
3. **Trivial to extend.** Need a new assertion? Add a function. No
   plugin system, no config file.
4. **Survives version churn.** Node's built-in `node:test` works and
   is the obvious alternative — but its API has been changing and
   examples online vary. A custom runner stays fixed.

If this project ever grows past a few hundred tests, swap it for
`node:test` (the runner exposes the same `test()` / `assert*` shape,
so most files port mechanically).

---

## What we test

The pure-logic modules — anything that takes inputs and returns
outputs without touching the DOM, canvas, or `window`:

| Module | What's tested | Why |
|---|---|---|
| `rng.js` | seed determinism, output range | foundation of tower seeding |
| `tower.js` | variant assignment per floor + per seed | the only persistence the game has |
| `layout.js` | unit derivation, coord round-trips, camera anchor | tap/draw correctness |
| `elevator.js` | state machine transitions, dispatcher ordering, doors, e-stop | the core mechanic |
| `npc.js` | casual rider + worker lifecycles | gameplay layer |

## What we don't test

- `render.js` — needs a `<canvas>` and `Image` objects.
- `input.js` — needs DOM `PointerEvent`s and the canvas bounding rect.
- `main.js` — wires everything together; tested implicitly through
  the modules it composes.

For these, the playtest workflow is: run `python -m http.server` (or
`npm test`'s sister target if you add one), open the page, drive it
with the Claude Code preview tools (`preview_eval`, `preview_screenshot`,
`preview_console_logs`). The `window.__gs` debug hook in `main.js`
lets eval scripts read live game state.

---

## Conventions

### Time-driven logic uses tick helpers

The elevator and NPC update functions take a `dt` (ms). To make
tests deterministic, every test file exports its own helpers:

```js
const TICK_MS = 16;        // ~60fps, matches the game loop
function tick(elevator, ms) {
  while (ms > 0) {
    const dt = Math.min(TICK_MS, ms);
    updateElevator(elevator, dt);
    ms -= dt;
  }
}
function runUntil(elevator, predicate, label) {
  // Keep ticking 16ms at a time until predicate(elevator) is true,
  // or throw after a generous timeout (default 60s simulated).
}
```

NPC tests use `tickWorld` and `runWorldUntil` that interleave
elevator + NPC updates on the same tick — exactly like the real
frame loop. **If your test relies on NPC ↔ elevator interaction,
update them together.** Updating only the elevator while NPCs sit
frozen produces nonsense scenarios that don't match the game.

### One regression test per fixed bug

The bottom of `elevator.test.mjs` has a `regression suite` block.
Each test there pins the fix for a specific shipped-and-caught bug,
with the fixing commit hash in the comment. Pattern:

```js
// FIXED in commit <hash>. <one-paragraph description of the bug>
test('regression: <symptom>', () => { ... });
```

Adopt this pattern when you fix bugs going forward — it turns each
incident into a test that future refactors can't quietly undo.

### Set assertions

`carCalls`, `upCalls`, `downCalls` are `Set`s. Use `assertSetEquals`
(order-insensitive) instead of asserting on the iteration order.

### Don't reach into render.js for layout values

If you need to test something that uses geometry (e.g. "the close-up
tile is 5×5u"), import the constant from `config.js` rather than
calling into `render.js`. Render is full of DOM APIs that fail in
Node.

---

## Adding a new test file

1. Create `tests/<thing>.test.mjs`.
2. Top-level structure:

   ```js
   import { describe, test, assertEquals, assertTrue } from './runner.mjs';
   import { ... } from '../src/<thing>.js';

   describe('<thing>: <subject>', () => {
     test('<expected behavior>', () => {
       // arrange
       // act
       // assert
     });
   });
   ```

3. Add the import to `tests/run.mjs`.

The runner discovers tests purely through side-effect imports — no
filesystem scan, no config. Forgetting to add the import means
your tests silently don't run, which is the only real footgun of
this setup.

---

## Caveats and known limitations

- **No mocking framework.** If your code imports something that
  needs to be replaced in tests, refactor it to take the dependency
  as a parameter (dependency injection) rather than reaching for
  `vi.mock` or similar. This codebase has none of that — it's all
  pure functions taking state objects — and tests stay simple as a
  result.
- **Float comparison.** Use `assertNear` (default eps 1e-6) for
  positions and animation progress. `assertEquals` will trip on
  the smallest accumulated drift.
- **No coverage tool.** If you want coverage, run with
  `node --experimental-test-coverage tests/run.mjs` (Node ≥20) or
  wrap with `c8`. Not wired by default.
- **The runner exits non-zero on failure.** Good for CI; remember
  to `set -e` or check `$?` in any script that wraps it.

---

## A note on cache during browser playtest

When you change `.js` files in `src/` and reload the preview, browsers
sometimes serve a cached copy of the module — especially with
`python -m http.server` which sets no cache headers. If your fix
"doesn't take effect" but Node tests pass, the disk has the fix,
the browser is lying. Force-reload, or fetch the file with
`{ cache: 'no-store' }` to confirm. (This is exactly how the
apex-flip fix was diagnosed — the unit test would have caught the
bug, but the eval-based playtest got fooled by the cache.)
