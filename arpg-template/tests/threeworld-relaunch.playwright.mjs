/**
 * threeworld-relaunch.playwright.mjs
 * ===================================
 *
 * Browser regression test for PAT-9 [INV-004], including PR #2 review fixes:
 *
 * P1 — ThreeOverlayScene._onShutdown must dispose every child controller
 *      before ThreeWorld teardown, then clear scene-owned references.
 * P2 — ThreeWorld.boot() must not replace a still-live world; a consecutive
 *      boot() call is a safe no-op until the scene owner has disposed it.
 *
 * Run: npm run test:threeworld-relaunch
 * Needs: npm run dev on http://localhost:5173/ and Playwright Chromium.
 */

import { chromium } from 'playwright';

const TARGET_URL = process.env.RELAUNCH_URL ?? 'http://localhost:5173/';
const SCENE_KEY = 'ThreeOverlayScene';
const WAIT_BOOT_MS = 3000;
const WAIT_RELAUNCH_MS = 3000;
const CONTROLLER_FIELDS = ['_playerCtrl', '_npcs', '_wildlife', '_goblins'];

async function readWorldStats(page) {
    return page.evaluate(() => {
        const world = window.__three?.world;
        return world ? { ...world.stats } : null;
    });
}

async function readSceneState(page) {
    return page.evaluate((key) => {
        const game = window.__game;
        const scene = game?.scene?.getScene(key);
        if (!scene) return null;

        return {
            active: scene.scene.isActive(),
            paused: scene.scene.isPaused(),
            sleeping: scene.scene.isSleeping(),
            visible: scene.scene.isVisible(),
            controllers: {
                player: Boolean(scene._playerCtrl),
                npcs: Boolean(scene._npcs),
                wildlife: Boolean(scene._wildlife),
                goblins: Boolean(scene._goblins),
            },
        };
    }, SCENE_KEY);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=swiftshader', '--enable-webgl'],
    });

    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));

        const url = new URL(TARGET_URL);
        if (!url.searchParams.has('debug')) url.searchParams.set('debug', '1');
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('#three-canvas', { timeout: 15000 });
        await page.waitForTimeout(WAIT_BOOT_MS);

        // ─── Cycle 1: production boot ───────────────────────────────────
        const initial = await readWorldStats(page);
        const initialScene = await readSceneState(page);
        assert(initial, 'Cycle 1: window.__three.world.stats is unavailable');
        assert(initialScene, `Cycle 1: ${SCENE_KEY} is unavailable`);
        assert(initial.running === true, `Cycle 1: expected running=true, got ${initial.running}`);
        assert(initial.disposed === false, `Cycle 1: expected disposed=false, got ${initial.disposed}`);
        assert(initialScene.active === true, 'Cycle 1: ThreeOverlayScene should be active');
        console.log('[PASS] Cycle 1: active scene booted:', JSON.stringify({ initial, initialScene }));

        // ─── P2: consecutive boot is a no-op ────────────────────────────
        const consecutiveBoot = await page.evaluate(() => {
            const world = window.__three?.world;
            const canvas = document.getElementById('three-canvas');
            if (!world || !canvas) return { ok: false, reason: 'world or canvas missing' };

            const renderer = world.renderer;
            const scene = world.scene;
            const root = world.root;
            const camera = world.camera;
            world.boot(canvas);

            return {
                ok: true,
                sameRenderer: world.renderer === renderer,
                sameScene: world.scene === scene,
                sameRoot: world.root === root,
                sameCamera: world.camera === camera,
                stats: { ...world.stats },
            };
        });
        assert(consecutiveBoot.ok, `P2: ${consecutiveBoot.reason}`);
        assert(consecutiveBoot.sameRenderer, 'P2: active boot() replaced the live renderer');
        assert(consecutiveBoot.sameScene, 'P2: active boot() replaced the live scene');
        assert(consecutiveBoot.sameRoot, 'P2: active boot() replaced the live root');
        assert(consecutiveBoot.sameCamera, 'P2: active boot() replaced the live camera');
        assert(consecutiveBoot.stats.running === true, 'P2: active boot() stopped the world');
        console.log('[PASS] P2: consecutive boot() preserved live world identity');

        // ─── P1: production ThreeOverlayScene cleanup handler ───────────
        // Phaser has internal SHUTDOWN listeners that make direct event emission
        // unsuitable in this headless path. Call the exact production handler
        // registered by `this.events.once(SHUTDOWN, this._onShutdown, this)`.
        // Each disposable controller is wrapped first so this assertion proves
        // its dispose() function was called, not merely that fields were nulled.
        const shutdown = await page.evaluate((keyAndFields) => {
            const { key, fields } = keyAndFields;
            const game = window.__game;
            const scene = game?.scene?.getScene(key);
            if (!scene) return { ok: false, reason: 'scene missing' };
            if (typeof scene._onShutdown !== 'function') {
                return { ok: false, reason: '_onShutdown handler missing' };
            }

            const seen = {};
            for (const field of fields) {
                const controller = scene[field];
                if (!controller?.dispose) return { ok: false, reason: `${field}.dispose missing` };
                const originalDispose = controller.dispose.bind(controller);
                seen[field] = 0;
                controller.dispose = (...args) => {
                    seen[field] += 1;
                    return originalDispose(...args);
                };
            }

            scene._onShutdown.call(scene);

            return {
                ok: true,
                disposeCalls: seen,
                cleared: Object.fromEntries(fields.map((field) => [field, scene[field] === null])),
                world: { ...window.__three.world.stats },
            };
        }, { key: SCENE_KEY, fields: CONTROLLER_FIELDS });
        assert(shutdown.ok, `P1: ${shutdown.reason}`);
        for (const field of CONTROLLER_FIELDS) {
            assert(shutdown.disposeCalls[field] === 1, `P1: ${field}.dispose() calls=${shutdown.disposeCalls[field]}, expected 1`);
            assert(shutdown.cleared[field] === true, `P1: ${field} was not cleared after dispose()`);
        }
        assert(shutdown.world.running === false, `P1: after shutdown running=${shutdown.world.running}, expected false`);
        assert(shutdown.world.disposed === true, `P1: after shutdown disposed=${shutdown.world.disposed}, expected true`);
        assert(shutdown.world.objects === 0, `P1: after shutdown objects=${shutdown.world.objects}, expected 0`);
        console.log('[PASS] P1: all controllers disposed once and cleared before world teardown');

        // ─── Relaunch: recreate the scene's owned world + controllers ───
        // `_onShutdown` is the precise production cleanup body. Re-run the
        // matching production create() method to exercise boot after teardown.
        // Remove the one-shot listener first because direct handler invocation
        // intentionally bypasses Phaser's emitter, which would otherwise remove it.
        const relaunch = await page.evaluate((key) => {
            const game = window.__game;
            const scene = game?.scene?.getScene(key);
            if (!scene) return { ok: false, reason: 'scene missing' };
            try {
                scene.events.off('shutdown', scene._onShutdown, scene);
                scene.create();
                return { ok: true };
            } catch (error) {
                return { ok: false, reason: error.message };
            }
        }, SCENE_KEY);
        assert(relaunch.ok, `Relaunch: ${relaunch.reason}`);
        await page.waitForTimeout(WAIT_RELAUNCH_MS);

        const relaunched = await readWorldStats(page);
        const relaunchedScene = await readSceneState(page);
        assert(relaunched, 'Relaunch: window.__three.world.stats is unavailable');
        assert(relaunched.running === true, `Relaunch: running=${relaunched.running}, expected true`);
        assert(relaunched.disposed === false, `Relaunch: disposed=${relaunched.disposed}, expected false`);
        assert(relaunched.objects > 0, `Relaunch: objects=${relaunched.objects}, expected > 0`);
        for (const [name, present] of Object.entries(relaunchedScene.controllers)) {
            assert(present, `Relaunch: ${name} controller was not recreated`);
        }
        assert(pageErrors.length === 0, `Runtime page errors: ${pageErrors.join(' | ')}`);
        console.log('[PASS] Relaunch: fresh world and all controllers rebuilt:', JSON.stringify({ relaunched, relaunchedScene }));

        console.log('\nPASS — PAT-9 PR #2 review regression suite: P1 + P2 verified');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('FAIL — threeworld-relaunch:', error.message);
    process.exit(1);
});
