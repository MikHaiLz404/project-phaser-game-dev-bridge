/**
 * Browser acceptance regression for PAT-16 [INV-006].
 *
 * Proves the real ?debug=1 runtime owns its 250 ms overlay timer, reports
 * live Three.js/Phaser values without recurring page errors, and stops future
 * callbacks when page teardown invokes its idempotent disposer.
 *
 * Run: DEBUG_OVERLAY_URL=http://127.0.0.1:5176/ npm run test:debug-overlay-lifecycle
 */

import { chromium } from 'playwright';

const TARGET_URL = process.env.DEBUG_OVERLAY_URL ?? 'http://127.0.0.1:5176/';
const DEBUG_INTERVAL_MS = 250;

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

        // Instrument the browser timer APIs before main.js runs. This tracks the
        // production 250 ms debug interval by ownership, while still executing
        // its real callback and leaving unrelated timers alone.
        await page.addInitScript((debugIntervalMs) => {
            const originalSetInterval = window.setInterval.bind(window);
            const originalClearInterval = window.clearInterval.bind(window);
            const timers = new Map();
            let created = 0;
            let clearCalls = 0;
            let totalTicks = 0;

            window.setInterval = (callback, delay, ...args) => {
                let timerId;
                const wrapped = (...callbackArgs) => {
                    const timer = timers.get(timerId);
                    if (timer) {
                        timer.ticks += 1;
                        totalTicks += 1;
                    }
                    return callback(...callbackArgs);
                };
                timerId = originalSetInterval(wrapped, delay, ...args);
                if (delay === debugIntervalMs) {
                    created += 1;
                    timers.set(timerId, { ticks: 0 });
                }
                return timerId;
            };

            window.clearInterval = (timerId) => {
                if (timers.has(timerId)) {
                    clearCalls += 1;
                    timers.delete(timerId);
                }
                return originalClearInterval(timerId);
            };

            window.__pat16TimerTracker = {
                snapshot: () => ({
                    created,
                    clearCalls,
                    active: timers.size,
                    ticks: totalTicks,
                }),
            };
        }, DEBUG_INTERVAL_MS);

        const url = new URL(TARGET_URL);
        url.searchParams.set('debug', '1');
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForFunction(() => {
            const objectText = document.getElementById('dbg-objects')?.textContent ?? '0';
            const sceneText = document.getElementById('dbg-scene')?.textContent ?? '--';
            const fpsText = document.getElementById('dbg-fps')?.textContent ?? '--';
            const timer = window.__pat16TimerTracker?.snapshot();
            return document.getElementById('debug-overlay')?.style.display === 'block'
                && Number(objectText) > 0
                && sceneText !== '--'
                && fpsText !== '--'
                && timer?.created === 1
                && timer?.ticks >= 2;
        }, null, { timeout: 20000 });

        const live = await page.evaluate(() => {
            const activeScene = window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? '--';
            return {
                overlay: {
                    display: document.getElementById('debug-overlay')?.style.display,
                    fps: document.getElementById('dbg-fps')?.textContent,
                    objects: document.getElementById('dbg-objects')?.textContent,
                    scene: document.getElementById('dbg-scene')?.textContent,
                },
                worldObjects: window.__three?.world?.stats?.objects,
                activeScene,
                timer: window.__pat16TimerTracker.snapshot(),
            };
        });

        assert(Number(live.overlay.objects) === live.worldObjects,
            `Live objects mismatch: overlay=${live.overlay.objects}, world=${live.worldObjects}`);
        assert(live.overlay.scene === live.activeScene,
            `Live scene mismatch: overlay=${live.overlay.scene}, active=${live.activeScene}`);
        assert(pageErrors.length === 0, `Runtime page errors before teardown: ${pageErrors.join(' | ')}`);
        console.log('[PASS] debug overlay reports live runtime values:', JSON.stringify(live));

        const teardown = await page.evaluate(() => {
            const exposedDispose = window.__three?.debugOverlay?.dispose;
            const before = window.__pat16TimerTracker.snapshot();

            // Exercise the production unload path first, then call the captured
            // disposer and unload path again to prove disposal is idempotent.
            window.dispatchEvent(new Event('beforeunload'));
            const afterUnload = window.__pat16TimerTracker.snapshot();
            exposedDispose?.();
            exposedDispose?.();
            window.dispatchEvent(new Event('beforeunload'));

            return {
                disposerExposed: typeof exposedDispose === 'function',
                hookCleared: window.__three?.debugOverlay === undefined,
                overlayHidden: document.getElementById('debug-overlay')?.style.display === 'none',
                before,
                afterUnload,
                afterRepeatedDispose: window.__pat16TimerTracker.snapshot(),
            };
        });

        assert(teardown.afterUnload.clearCalls === 1,
            `Unload clear calls=${teardown.afterUnload.clearCalls}, expected exactly 1`);
        assert(teardown.afterUnload.active === 0,
            `Unload left ${teardown.afterUnload.active} debug interval(s) active`);
        assert(teardown.disposerExposed, 'Debug lifecycle disposer seam was not exposed under window.__three');
        assert(teardown.afterRepeatedDispose.clearCalls === 1,
            `Repeated dispose clear calls=${teardown.afterRepeatedDispose.clearCalls}, expected exactly 1`);
        assert(teardown.hookCleared, 'Debug disposer hook was not removed during disposal');
        assert(teardown.overlayHidden, 'Debug overlay remained visible after disposal');

        await page.waitForTimeout(DEBUG_INTERVAL_MS * 3);
        const afterWait = await page.evaluate(() => window.__pat16TimerTracker.snapshot());
        assert(afterWait.active === 0, `Post-teardown wait found ${afterWait.active} active interval(s)`);
        assert(afterWait.clearCalls === 1,
            `Post-teardown clear calls=${afterWait.clearCalls}, expected exactly 1`);
        assert(afterWait.ticks === teardown.afterUnload.ticks,
            `Debug callback count advanced after teardown: ${teardown.afterUnload.ticks} -> ${afterWait.ticks}`);
        assert(pageErrors.length === 0, `Runtime page errors: ${pageErrors.join(' | ')}`);
        console.log('[PASS] unload/disposer cleared timer exactly once and stopped future callbacks:', JSON.stringify({
            teardown,
            afterWait,
        }));
        console.log('\nPASS — PAT-16 debug overlay lifecycle acceptance');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('FAIL — debug-overlay-lifecycle:', error.message);
    process.exit(1);
});
