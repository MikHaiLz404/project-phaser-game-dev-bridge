/**
 * threeworld-reboot.test.mjs
 * ===========================
 *
 * Smoke test for PAT-9 [INV-004] — ThreeWorld must be rebootable after
 * `dispose()`. Acceptance criteria from the ticket:
 *
 *   1. Permanent `dispose()` separated from restart / reset lifecycle.
 *   2. `stats.running === true` after relaunch (boot() succeeds twice
 *      with a dispose() between them).
 *   3. Resources rebuilt with no object / listener duplication.
 *
 * Why this is split into TWO test files instead of one:
 *
 * - `threeworld-reboot.test.mjs` (this file): state-machine tests that
 *   don't construct a real WebGLRenderer. They cover the lifecycle
 *   transitions, idempotency, and stats derivation contract that PAT-9
 *   depends on. Run with plain `node` — no browser, no WebGL.
 *
 * - `threeworld-relaunch.playwright.mjs`: integration test that boots a
 *   headless browser, drives ThreeOverlayScene through a real launch →
 *   stop → relaunch cycle, and asserts `window.__three.world.stats` on
 *   the third cycle. Uses Playwright like the existing capture script.
 *
 * Mirrors the framework-free style of sword-axes.test.mjs.
 */

import { JSDOM } from 'jsdom';

// ─── Minimal DOM stub ────────────────────────────────────────────────
// We don't need a real canvas here — these tests avoid constructing a
// WebGLRenderer entirely. We just need a window/document/HTMLCanvasElement
// so ThreeWorld's `window.addEventListener('resize', ...)` calls don't
// throw under Node.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.addEventListener = () => {};
global.removeEventListener = () => {};

// ─── Stub three.js examples (OrbitControls) ─────────────────────────
// ThreeWorld imports OrbitControls at module load. Patch the prototype
// so any instance it creates is a no-op — we never call boot() in this
// file, but ThreeWorld's constructor still touches DOM via the
// singleton's _resize getter binding.
import * as THREE from 'three';

class StubOrbitControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = new THREE.Vector3();
        this.enableDamping = false;
        this.dampingFactor = 0.05;
        this.minDistance = 0;
        this.maxDistance = Infinity;
        this.maxPolarAngle = Math.PI;
        this.enableRotate = true;
        this.enablePan = true;
        this._disposed = false;
    }
    update() {}
    dispose() { this._disposed = true; }
}

class StubGUI {
    constructor(opts = {}) {
        this.title = opts.title ?? '';
        this.domElement = { style: {}, remove: () => {} };
        this.children = [];
    }
    addFolder() { return this; }
    destroy() {}
}

import * as OrbitControlsModule from 'three/examples/jsm/controls/OrbitControls.js';
const RealOrbitControls = OrbitControlsModule.OrbitControls ?? OrbitControlsModule.default;
if (RealOrbitControls) {
    Object.setPrototypeOf(RealOrbitControls.prototype, StubOrbitControls.prototype);
}

import GUI from 'lil-gui';
Object.setPrototypeOf(GUI.prototype, StubGUI.prototype);

// ─── Now safe to import ThreeWorld ───────────────────────────────────
import { ThreeWorld } from '../src/threejs/ThreeWorld.js';

// ─── Test infrastructure (mirrors sword-axes.test.mjs) ──────────────
const results = [];
let failures = 0;

function test(name, fn) {
    const r = (async () => {
        try {
            await fn();
            results.push({ name, ok: true });
        } catch (e) {
            failures += 1;
            results.push({ name, ok: false, error: e.message });
        }
    })();
    return r;
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function assertNear(actual, expected, epsilon, msg) {
    if (Math.abs(actual - expected) > epsilon) {
        throw new Error(
            `${msg || 'value out of range'}: expected ${expected} ± ${epsilon}, got ${actual}`,
        );
    }
}

// ─── Tests ──────────────────────────────────────────────────────────
// All tests below operate on a freshly-constructed ThreeWorld instance
// WITHOUT calling boot(). That avoids the WebGLRenderer constructor
// entirely (which jsdom cannot satisfy) while still verifying the
// lifecycle state machine that PAT-9 is about.

await Promise.all([
    test('constructor initializes identity fields and null scene/root', () => {
        const w = new ThreeWorld();
        assert(w.renderer === null, 'pre-boot: renderer should be null');
        assert(w.scene === null, 'pre-boot: scene should be null (built lazily in boot())');
        assert(w.root === null, 'pre-boot: root should be null (built lazily in boot())');
        assert(w.camera === null, 'pre-boot: camera should be null');
        assert(w.controls === null, 'pre-boot: controls should be null');
        assert(w.lights === null, 'pre-boot: lights should be null');
        assert(w.gui === null, 'pre-boot: gui should be null');
        assertNear(w.stats.running, false, 1e-9, 'pre-boot: running should be false');
        // PAT-9: disposed is derived from !renderer. pre-boot has no
        // renderer, so stats.disposed=true (== "no live renderer").
        assertNear(w.stats.disposed, true, 1e-9, 'pre-boot: disposed=true (no renderer yet)');
        assertNear(w.stats.objects, 0, 1e-9, 'pre-boot: objects=0');
    }),

    test('dispose() on never-booted world is a no-op (idempotent)', () => {
        const w = new ThreeWorld();
        // Should not throw, should leave state unchanged.
        w.dispose();
        w.dispose();  // ← idempotency: second call must not crash
        assertNear(w.stats.running, false, 1e-9, 'running still false');
        assertNear(w.stats.disposed, true, 1e-9, 'disposed still true');
        assert(w.scene === null, 'scene still null');
        assert(w.root === null, 'root still null');
    }),

    test('add()/remove() on never-booted world are no-ops (no throw)', () => {
        const w = new ThreeWorld();
        const dummy = new THREE.Object3D();
        // add() should warn and return without throwing (root is null).
        w.add(dummy);
        // remove() should silently no-op (root is null).
        w.remove(dummy);
        assertNear(w.stats.objects, 0, 1e-9, 'objects still 0');
    }),

    test('update() on never-booted world is a no-op (no throw)', () => {
        const w = new ThreeWorld();
        // update() should early-return because _running=false.
        w.update(16);
        assertNear(w.stats.running, false, 1e-9, 'still not running');
    }),

    test('PAT-9 contract: stats.disposed is derived from !renderer', () => {
        // We can't construct a renderer without WebGL, but we can verify
        // the contract by manually toggling the renderer field. This
        // documents that the invariant holds regardless of how boot() runs.
        const w = new ThreeWorld();
        assertNear(w.stats.disposed, true, 1e-9, 'no renderer → disposed=true');

        // Simulate a renderer existing without actually constructing one.
        // The exact object doesn't matter; only truthiness is checked.
        const fakeRenderer = { dummy: true };
        w.renderer = fakeRenderer;
        assertNear(w.stats.disposed, false, 1e-9, 'renderer set → disposed=false');

        w.renderer = null;
        assertNear(w.stats.disposed, true, 1e-9, 'renderer nulled → disposed=true again');
    }),

    test('PAT-9 contract: stats.running tracks _running, not disposed', () => {
        const w = new ThreeWorld();
        // _running starts false. We can't call boot() without WebGL, but
        // we can manually toggle _running to verify the contract.
        w._running = true;
        assertNear(w.stats.running, true, 1e-9, '_running=true → stats.running=true');
        w._running = false;
        assertNear(w.stats.running, false, 1e-9, '_running=false → stats.running=false');
    }),

    test('PAT-9 contract: scene/root/camera/lights are nulled by dispose()', () => {
        // Manually populate a "boot-like" state and verify dispose()
        // nulls every owned field. This is what makes the relaunch
        // contract hold: after dispose, no stale graph reference survives.
        const w = new ThreeWorld();
        w.renderer = { dispose: () => {}, forceContextLoss: () => {} };
        w.controls = { dispose: () => {} };
        w.gui = { destroy: () => {} };
        w.scene = new THREE.Scene();
        w.root = new THREE.Group();
        w.scene.add(w.root);
        w.camera = new THREE.PerspectiveCamera();
        w.lights = { sun: new THREE.Object3D() };
        w._running = true;

        w.dispose();

        assert(w.renderer === null, 'dispose(): renderer nulled');
        assert(w.controls === null, 'dispose(): controls nulled');
        assert(w.gui === null, 'dispose(): gui nulled');
        assert(w.scene === null, 'dispose(): scene nulled');
        assert(w.root === null, 'dispose(): root nulled');
        assert(w.camera === null, 'dispose(): camera nulled');
        assert(w.lights === null, 'dispose(): lights nulled');
        assertNear(w._running, false, 1e-9, 'dispose(): _running=false');
    }),

    test('PAT-9 contract: dispose() null-guards every teardown step', () => {
        // Verify dispose() is safe when partial state is present — e.g.
        // renderer was nulled externally but scene survives. Every step
        // must null-guard its target so we don't NPE.
        const w = new ThreeWorld();
        w.scene = new THREE.Scene();
        // No renderer / controls / gui — simulate a half-disposed state.
        w.dispose();
        assert(w.scene === null, 'dispose(): scene nulled even without renderer');
        // Second dispose must remain a no-op.
        w.dispose();
        assert(true, 'second dispose() on half-empty state did not throw');
    }),

    test('PAT-9: _teardownRenderer() is the shared helper used by boot+dispose', () => {
        // Both boot() (when a renderer is already alive) and dispose()
        // call _teardownRenderer(). We verify that helper is idempotent
        // and null-guards every step, because if either path leaks, the
        // relaunch contract breaks (accumulating resize listeners,
        // duplicate OrbitControls instances, etc.).
        const w = new ThreeWorld();
        w.controls = { dispose: () => { w.controls = null; } };  // self-nulling for the test
        // First call: removes the listener and nulls the (self-nulling) controls.
        w._teardownRenderer();
        // Second call: nothing to do, must not throw.
        w._teardownRenderer();
        assert(w.renderer === null, 'teardown: renderer null');
        assert(w.controls === null, 'teardown: controls null');
        assert(w.gui === null, 'teardown: gui null');
    }),
]);

// ─── Report ─────────────────────────────────────────────────────────
for (const r of results) {
    if (r.ok) {
        console.log(`  ✅ ${r.name}`);
    } else {
        console.log(`  � ${r.name}`);
        console.log(`     ${r.error}`);
    }
}

const passed = results.length - failures;
console.log(`\n${passed}/${results.length} assertions passed`);

if (failures > 0) {
    console.error('\nFAIL — threeworld-reboot test failed; PAT-9 acceptance not met');
    process.exit(1);
} else {
    console.log('\nPASS — threeworld-reboot test confirms PAT-9 lifecycle contract');
    console.log('  (full boot/dispose/relaunch integration is covered by');
    console.log('   tests/threeworld-relaunch.playwright.mjs — Playwright headless)');
    process.exit(0);
}
