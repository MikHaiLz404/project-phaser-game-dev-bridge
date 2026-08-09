/**
 * threeoverlay-scene-lifecycle.playwright.mjs
 * =============================================
 *
 * Post-merge regression coverage for the ThreeOverlayScene owner lifecycle.
 * Uses Phaser Scene Manager stop()/run() — never direct _onShutdown/create.
 *
 * Run: LIFECYCLE_URL=http://127.0.0.1:5174/ npm run test:threeoverlay-lifecycle
 */

import { chromium } from 'playwright';

const TARGET_URL = process.env.LIFECYCLE_URL ?? 'http://127.0.0.1:5174/';
const SCENE_KEY = 'ThreeOverlayScene';
const LATE_MODEL_URL = '/tests/fixtures/late-model-factory.js?lifecycle-delay=1';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function sceneState(page) {
    return page.evaluate((key) => {
        const game = window.__game;
        const scene = game?.scene?.getScene(key);
        const world = window.__three?.world;
        return {
            sceneFound: Boolean(scene),
            active: Boolean(scene?.scene?.isActive()),
            running: world?.stats?.running ?? false,
            pointerListeners: window.__threePointerTracker?.count() ?? -1,
            hasLateModel: Boolean(world?.root?.getObjectByName('__late_lifecycle_model__')),
        };
    }, SCENE_KEY);
}

async function waitForActiveScene(page, expected) {
    await page.waitForFunction(({ key, expected }) => {
        const scene = window.__game?.scene?.getScene(key);
        return Boolean(scene?.scene?.isActive()) === expected;
    }, { key: SCENE_KEY, expected }, { timeout: 15000 });
}

async function stopScene(page) {
    await page.evaluate((key) => window.__game.scene.stop(key), SCENE_KEY);
    await waitForActiveScene(page, false);
}

async function runScene(page, data = {}) {
    await page.evaluate(({ key, data }) => window.__game.scene.run(key, data), { key: SCENE_KEY, data });
    await waitForActiveScene(page, true);
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

        // Count only the Three.js canvas listeners. Player input and House Layout
        // are both lifecycle-owned; after stop there must be no live handlers.
        await page.addInitScript(() => {
            const active = new Set();
            const originalAdd = EventTarget.prototype.addEventListener;
            const originalRemove = EventTarget.prototype.removeEventListener;
            const isThreeCanvas = (target) => target?.id === 'three-canvas';
            EventTarget.prototype.addEventListener = function patchedAdd(type, listener, options) {
                if (type === 'pointerdown' && isThreeCanvas(this) && listener) active.add(listener);
                return originalAdd.call(this, type, listener, options);
            };
            EventTarget.prototype.removeEventListener = function patchedRemove(type, listener, options) {
                if (type === 'pointerdown' && isThreeCanvas(this) && listener) active.delete(listener);
                return originalRemove.call(this, type, listener, options);
            };
            window.__threePointerTracker = { count: () => active.size };
        });

        let releaseDelayedImport;
        const delayedImportReleased = new Promise((resolve) => { releaseDelayedImport = resolve; });
        let markImportRequested;
        const importRequested = new Promise((resolve) => { markImportRequested = resolve; });
        await page.route(/\/tests\/fixtures\/late-model-factory\.js\?.*lifecycle-delay=1/, async (route) => {
            markImportRequested();
            await delayedImportReleased;
            await route.continue();
        });

        const url = new URL(TARGET_URL);
        url.searchParams.set('debug', '1');
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('#three-canvas', { timeout: 15000 });
        await waitForActiveScene(page, true);
        await page.waitForFunction(() => window.__threePointerTracker?.count() > 0, null, { timeout: 15000 });

        const initial = await sceneState(page);
        assert(initial.running, 'Initial scene: ThreeWorld is not running');
        assert(initial.pointerListeners > 0, 'Initial scene: expected Three.js canvas pointer listeners');
        console.log('[PASS] Initial Scene Manager launch:', JSON.stringify(initial));

        // P1 listener lifecycle: actual Scene Manager stop → launch must remove
        // every previous canvas listener, then recreate exactly the baseline count.
        await stopScene(page);
        const stopped = await sceneState(page);
        assert(stopped.pointerListeners === 0,
            `P1 listener cleanup: stop left ${stopped.pointerListeners} pointerdown listener(s)`);
        console.log('[PASS] P1 stop cleanup:', JSON.stringify(stopped));

        await runScene(page);
        await page.waitForTimeout(500);
        const relaunched = await sceneState(page);
        assert(relaunched.pointerListeners === initial.pointerListeners,
            `P1 listener cleanup: relaunch has ${relaunched.pointerListeners}, expected ${initial.pointerListeners}`);
        console.log('[PASS] P1 Scene Manager relaunch:', JSON.stringify(relaunched));

        // P1 stale async model: defer the model module, stop the generation that
        // requested it, launch a fresh generation, then release the old request.
        await stopScene(page);
        await runScene(page, { modelUrl: LATE_MODEL_URL });
        await Promise.race([
            importRequested,
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('Timed model import was never requested')), 15000
            )),
        ]);
        await stopScene(page);
        await runScene(page);
        await page.waitForTimeout(250);

        releaseDelayedImport();
        await page.waitForTimeout(750);
        const afterLateResolve = await sceneState(page);
        assert(!afterLateResolve.hasLateModel,
            'P1 async lifecycle: stale model load was added to the relaunched world');
        assert(afterLateResolve.pointerListeners === initial.pointerListeners,
            `P1 async lifecycle: relaunch listener count=${afterLateResolve.pointerListeners}, expected ${initial.pointerListeners}`);
        assert(pageErrors.length === 0, `Runtime page errors: ${pageErrors.join(' | ')}`);
        console.log('[PASS] P1 stale async completion ignored:', JSON.stringify(afterLateResolve));

        await stopScene(page);
        const finalStop = await sceneState(page);
        assert(finalStop.pointerListeners === 0,
            `P1 final cleanup: stop left ${finalStop.pointerListeners} pointerdown listener(s)`);
        console.log('[PASS] Final Scene Manager stop:', JSON.stringify(finalStop));
        console.log('\nPASS — ThreeOverlayScene lifecycle ownership regression suite');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('FAIL — threeoverlay-scene-lifecycle:', error.message);
    process.exit(1);
});
