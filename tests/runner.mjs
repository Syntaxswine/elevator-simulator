// Tiny test runner. ~50 lines, no dependencies. Designed so other
// agents can read the whole thing in one screen instead of learning
// jest/mocha conventions.
//
// API:
//   describe(name, fn)        — group related tests under a heading
//   test(name, fn)            — register one test (sync or async)
//   assert(cond, msg)         — boolean assertion
//   assertEquals(a, b, msg)   — strict equality
//   assertNear(a, b, eps, m)  — float-tolerant equality
//   assertTrue(cond, msg)     — alias for assert
//   assertSetEquals(a, b, m)  — order-insensitive Set/array equality
//   runAll()                  — execute everything and exit non-zero on failure
//
// The runner imports test files as side-effect modules (each test()
// call appends to a module-scoped array), then executes them in
// registration order. Suites are just visual grouping.

import { performance } from 'node:perf_hooks';

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', RESET = '\x1b[0m';

let currentSuite = '(no suite)';
const tests = [];

export function describe(name, fn) {
  const prev = currentSuite;
  currentSuite = name;
  try { fn(); } finally { currentSuite = prev; }
}

export function test(name, fn) {
  tests.push({ suite: currentSuite, name, fn });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}
export const assertTrue = assert;

export function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEquals'}: expected ${fmt(expected)}, got ${fmt(actual)}`);
  }
}

export function assertNear(actual, expected, eps = 1e-6, message) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${message || 'assertNear'}: expected ${expected} ±${eps}, got ${actual}`);
  }
}

export function assertSetEquals(actual, expected, message) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || !a.every((v, i) => v === e[i])) {
    throw new Error(`${message || 'assertSetEquals'}: expected ${fmt(e)}, got ${fmt(a)}`);
  }
}

export async function runAll() {
  let passed = 0, failed = 0;
  let lastSuite = null;
  const start = performance.now();
  for (const { suite, name, fn } of tests) {
    if (suite !== lastSuite) {
      console.log(`\n${suite}`);
      lastSuite = suite;
    }
    try {
      await fn();
      console.log(`  ${GREEN}✓${RESET} ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ${RED}✗${RESET} ${name}`);
      console.log(`    ${RED}${e.message}${RESET}`);
      const stack = (e.stack || '').split('\n').slice(1, 3).join('\n');
      if (stack) console.log(`    ${DIM}${stack}${RESET}`);
      failed++;
    }
  }
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const fc = failed > 0 ? RED : '';
  console.log(`\n${passed} ${GREEN}passed${RESET}, ${fc}${failed} failed${RESET}, ${elapsed}s`);
  if (failed > 0) process.exit(1);
}

function fmt(v) {
  if (v instanceof Set) v = [...v];
  try { return JSON.stringify(v); } catch { return String(v); }
}
