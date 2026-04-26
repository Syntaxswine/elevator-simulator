// Test entry point. Imports each test file (their top-level test()
// calls register tests with the runner), then executes them.
//
// Add new test files here. Order doesn't affect correctness but
// roughly mirrors the dependency stack: pure utilities first,
// then state machines that build on them.

import './rng.test.mjs';
import './tower.test.mjs';
import './layout.test.mjs';
import './clock.test.mjs';
import './metrics.test.mjs';
import './elevator.test.mjs';
import './npc.test.mjs';
import './stress.test.mjs';

import { runAll } from './runner.mjs';
runAll();
