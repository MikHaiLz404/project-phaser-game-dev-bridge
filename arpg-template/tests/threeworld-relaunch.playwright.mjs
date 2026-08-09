/**
 * threeworld-relaunch.playwright.mjs
 * ===================================
 *
 * Integration smoke test for PAT-9 [INV-004] — verifies that
 * ThreeOverlayScene can launch → stop → relaunch in a real browser, and
 * that `window.__three.world.stats.running === true` after the relaunch.
 *
 * This complements `threeworld-reboot.test.mjs` (the lifecycle state-
 * machine test). The state-machine test runs in plain node and verifies
 * the new derived-flag contract; this Playwright test verifies that the
 * full WebGLRenderer + Phaser + Three.js pipeline actually boots twice.
 *
 * Run:    npm run test:threeworld-relaunch
 * Needs:  dev server running (npm run dev) on http://localhost:5173/
 *         + chromium browser installed (npx playwright install chromium)
 */

import { chromium } from 'playwright';

const TARGET_URL = process.env.RELAUNCH_URL ?? 'http://localhost:5173/';
const WAIT_BOOT_MS = 3000;       // let ThreeWorld boot settle
const WAIT_RELAUNCH_MS = 3000;   // let relaunch settle

async function readStats(page) {
    return page.evaluate(() => {
        const t = window.__three?.world;
        return t ? { ...t.stats } : null;
    });
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=swiftshader', '--enable-webgl'],
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
        });
        const page = await context.newPage();

        // Debug overlay exposes window.__three.world.
        const url = new URL(TARGET_URL);
        if (!url.searchParams.has('debug')) url.searchParams.set('debug', '1');

        // ─── Cycle 1: launch ─────────────────────────────────────────
        await page.goto(url.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await page.waitForSelector('#three-canvas', { timeout: 15000 });
        await page.waitForTimeout(WAIT_BOOT_MS);

        const statsAfterFirstBoot = await readStats(page);
        if (!statsAfterFirstBoot) {
            throw new Error('Cycle 1: window.__three.world.stats not available after first boot');
        }
        console.log('cycle 1 (first boot):', JSON.stringify(statsAfterFirstBoot));
        if (statsAfterFirstBoot.running !== true) {
            throw new Error(`Cycle 1: stats.running should be true, got ${statsAfterFirstBoot.running}`);
        }

        // ─── Cycle 2: stop (dispose ThreeWorld via scene shutdown) ───
        // We don't have a Phaser-side test harness, but we can drive the
        // same lifecycle through window.__three.world.dispose() directly.
        // The contract under test is "boot → dispose → boot works" — the
        // exact disposal trigger (Phaser shutdown vs. direct call) is
        // covered by ThreeOverlayScene's _onShutdown path, which calls
        // the same dispose() method.
        const disposeResult = await page.evaluate(() => {
            const t = window.__three?.world;
            if (!t) return { ok: false, reason: 'no world' };
            t.dispose();
            return { ok: true, stats: { ...t.stats } };
        });
        console.log('cycle 2 (after dispose):', JSON.stringify(disposeResult));
        if (!disposeResult.ok) {
            throw new Error(`Cycle 2: dispose() failed — ${disposeResult.reason}`);
        }
        if (disposeResult.stats.running !== false) {
            throw new Error(`Cycle 2: stats.running should be false after dispose, got ${disposeResult.stats.running}`);
        }
        if (disposeResult.stats.disposed !== true) {
            throw new Error(`Cycle 2: stats.disposed should be true after dispose, got ${disposeResult.stats.disposed}`);
        }

        // Idempotency: a second dispose() must not throw.
        const secondDispose = await page.evaluate(() => {
            try {
                window.__three.world.dispose();
                return { ok: true };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        });
        if (!secondDispose.ok) {
            throw new Error(`Cycle 2: second dispose() threw — ${secondDispose.error}`);
        }

        // ─── Cycle 3: relaunch ────────────────────────────────────────
        // Use the same canvas to boot() the world again. This is the
        // exact path ThreeOverlayScene.create() takes on relaunch.
        const relaunchResult = await page.evaluate(() => {
            const t = window.__three?.world;
            const canvas = document.getElementById('three-canvas');
            if (!t || !canvas) return { ok: false, reason: 'no world/canvas' };
            t.boot(canvas);
            return { ok: true, stats: { ...t.stats } };
        });
        console.log('cycle 3 (after relaunch):', JSON.stringify(relaunchResult));
        await page.waitForTimeout(WAIT_RELAUNCH_MS);

        const statsAfterRelaunch = await readStats(page);
        if (!statsAfterRelaunch) {
            throw new Error('Cycle 3: window.__three.world.stats not available after relaunch');
        }
        console.log('cycle 3 (relaunch settled):', JSON.stringify(statsAfterRelaunch));

        if (statsAfterRelaunch.running !== true) {
            throw new Error(`PAT-9 FAIL: stats.running should be true after relaunch, got ${statsAfterRelaunch.running}`);
        }
        if (statsAfterRelaunch.disposed !== false) {
            throw new Error(`PAT-9 FAIL: stats.disposed should be false after relaunch, got ${statsAfterRelaunch.disposed}`);
        }
        if (statsAfterRelaunch.objects <= 0) {
            throw new Error(`PAT-9 FAIL: stats.objects should be > 0 after relaunch (lights+ground+grid), got ${statsAfterRelaunch.objects}`);
        }

        console.log('\nPASS — threeworld-relaunch integration test confirms PAT-9 acceptance');
        console.log('  • boot() ran successfully on first call');
        console.log('  • dispose() ran successfully and ran again idempotently');
        console.log('  • boot() ran successfully after dispose() — PAT-9 fixed');
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('FAIL — threeworld-relaunch:', err.message);
    process.exit(1);
});
