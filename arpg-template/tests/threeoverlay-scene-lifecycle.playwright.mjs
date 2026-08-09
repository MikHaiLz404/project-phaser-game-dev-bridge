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
const CACHED_MODEL_URL = '/tests/fixtures/late-model-factory.js?cache-lifecycle=1';
const SPEC_ECHO_MODEL_URL = '/tests/fixtures/spec-echo-model-factory.js?epoch-shared=1';

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
            houseLayoutOwned: Boolean(scene?._houseLayoutDispose),
            hasLateModel: Boolean(world?.root?.getObjectByName('__late_lifecycle_model__')),
        };
    }, SCENE_KEY);
}

async function modelLoaderStats(page) {
    return page.evaluate(async () => {
        const moduleUrl = performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((name) => name.includes('/src/threejs/ModelLoader.js'));
        if (!moduleUrl) throw new Error('Vite did not load the active ModelLoader module');
        const { stats } = await import(moduleUrl);
        return stats();
    });
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
    // Phaser marks the scene inactive before its SHUTDOWN listeners finish.
    // The owner lifecycle is complete only once ThreeWorld.dispose() has run.
    await page.waitForFunction(
        () => window.__three?.world?.stats?.running === false,
        null,
        { timeout: 15000 },
    );
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

        let releaseLayoutImport;
        const layoutImportReleased = new Promise((resolve) => { releaseLayoutImport = resolve; });
        let markLayoutImportRequested;
        const layoutImportRequested = new Promise((resolve) => { markLayoutImportRequested = resolve; });
        await page.route(/\/src\/threejs\/models\/createHouseLayoutTool\.js(?:\?.*)?$/, async (route) => {
            markLayoutImportRequested();
            await layoutImportReleased;
            await route.continue();
        });

        let releaseSpecEchoImport;
        const specEchoImportReleased = new Promise((resolve) => { releaseSpecEchoImport = resolve; });
        let markSpecEchoImportRequested;
        const specEchoImportRequested = new Promise((resolve) => { markSpecEchoImportRequested = resolve; });
        await page.route(/\/tests\/fixtures\/spec-echo-model-factory\.js\?.*epoch-shared=1/, async (route) => {
            markSpecEchoImportRequested();
            await specEchoImportReleased;
            await route.continue();
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
        await Promise.race([
            layoutImportRequested,
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('House Layout import was never requested')), 15000
            )),
        ]);

        // Hold the first House Layout import through a genuine teardown. The
        // stale callback must not attach its old village to the fresh world.
        const beforeLayoutRelease = await sceneState(page);
        assert(beforeLayoutRelease.running, 'Initial scene: ThreeWorld is not running');
        assert(beforeLayoutRelease.pointerListeners > 0,
            'Initial scene: expected existing Three.js canvas pointer listeners');
        assert(!beforeLayoutRelease.houseLayoutOwned,
            'Initial scene: delayed House Layout tool attached before its import released');
        await stopScene(page);
        await runScene(page);
        releaseLayoutImport();
        await page.waitForFunction((baseline) => {
            const scene = window.__game?.scene?.getScene('ThreeOverlayScene');
            return Boolean(scene?._houseLayoutDispose)
                && window.__threePointerTracker?.count() === baseline + 1;
        }, beforeLayoutRelease.pointerListeners, { timeout: 15000 });

        const initial = await sceneState(page);
        assert(initial.houseLayoutOwned, 'House Layout: fresh generation did not retain its disposer');
        assert(initial.pointerListeners === beforeLayoutRelease.pointerListeners + 1,
            `House Layout async race: active listener count=${initial.pointerListeners}, expected ${beforeLayoutRelease.pointerListeners + 1}`);
        console.log('[PASS] House Layout stale import ignored; fresh tool attached once:', JSON.stringify(initial));

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

        // Cached templates share render resources with their clones. A real
        // scene shutdown must invalidate the cache before ThreeWorld disposes
        // the active clone, otherwise the next caller could clone resources
        // already disposed by the previous world.
        await stopScene(page);
        await runScene(page, { modelUrl: CACHED_MODEL_URL });
        await page.waitForFunction(() => Boolean(
            window.__three?.world?.root?.getObjectByName('__late_lifecycle_model__')
        ), null, { timeout: 15000 });
        const cacheBeforeShutdown = await modelLoaderStats(page);
        assert(cacheBeforeShutdown.cached === 1,
            `ModelLoader cache setup: cached=${cacheBeforeShutdown.cached}, expected 1`);
        await stopScene(page);
        const cacheAfterShutdown = await modelLoaderStats(page);
        assert(cacheAfterShutdown.cached === 0,
            `ModelLoader cache lifecycle: shutdown left cached=${cacheAfterShutdown.cached}, expected 0`);
        console.log('[PASS] ModelLoader cache invalidated before world teardown:', JSON.stringify(cacheAfterShutdown));

        // P2 in-flight epoch: a fresh lifecycle requesting the same URL with a
        // different spec must not join the stale lifecycle's factory task.
        await runScene(page, { modelUrl: SPEC_ECHO_MODEL_URL, spec: { variant: 'A' } });
        await Promise.race([
            specEchoImportRequested,
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('Spec-echo model import was never requested')), 15000
            )),
        ]);
        await stopScene(page);
        await runScene(page, { modelUrl: SPEC_ECHO_MODEL_URL, spec: { variant: 'B' } });
        releaseSpecEchoImport();
        await page.waitForFunction(() => Boolean(
            window.__three?.world?.root?.getObjectByName('__spec_echo_A__')
            || window.__three?.world?.root?.getObjectByName('__spec_echo_B__')
        ), null, { timeout: 15000 });
        const specEchoNames = await page.evaluate(() =>
            window.__three?.world?.root?.children.map((child) => child.name) ?? []
        );
        assert(specEchoNames.includes('__spec_echo_B__'),
            `P2 in-flight epoch: fresh lifecycle received stale spec; root names=${JSON.stringify(specEchoNames)}`);
        assert(!specEchoNames.includes('__spec_echo_A__'),
            `P2 in-flight epoch: stale spec A appeared in fresh root; root names=${JSON.stringify(specEchoNames)}`);
        console.log('[PASS] P2 fresh lifecycle owns same-URL spec B:', JSON.stringify(specEchoNames));

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
        const cacheAfterLateResolve = await modelLoaderStats(page);
        assert(!afterLateResolve.hasLateModel,
            'P1 async lifecycle: stale model load was added to the relaunched world');
        assert(cacheAfterLateResolve.cached === 0,
            `P2 stale cache write: delayed old lifecycle left cached=${cacheAfterLateResolve.cached}, expected 0`);
        assert(cacheAfterLateResolve.inFlight === 0,
            `P2 stale cache write: delayed old lifecycle left inFlight=${cacheAfterLateResolve.inFlight}, expected 0`);
        assert(afterLateResolve.pointerListeners === initial.pointerListeners,
            `P1 async lifecycle: relaunch listener count=${afterLateResolve.pointerListeners}, expected ${initial.pointerListeners}`);
        assert(pageErrors.length === 0, `Runtime page errors: ${pageErrors.join(' | ')}`);
        console.log('[PASS] P1 stale async completion and cache write ignored:', JSON.stringify({
            scene: afterLateResolve,
            cache: cacheAfterLateResolve,
        }));

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
