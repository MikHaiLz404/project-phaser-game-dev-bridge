/**
 * Production-preview regression for PAT-11.
 *
 * Builds must bundle the demo model factory into Vite's module graph. The
 * browser must never fetch the raw public copy, whose bare `three` import is
 * not browser-resolvable in a production preview.
 *
 * Run after `npm run build` and while `npm run preview` is serving TARGET_URL:
 *   MODEL_PREVIEW_URL=http://127.0.0.1:4173/ npm run test:model-preview
 */

import { chromium } from 'playwright';

const TARGET_URL = process.env.MODEL_PREVIEW_URL ?? 'http://127.0.0.1:4173/';
const RAW_FACTORY_PATH = '/models/createDemoPropModel.js';
const SCENE_KEYS = {
    combat: 'CombatTest',
    game: 'Game',
    overlay: 'ThreeOverlayScene',
};

function report(checks, condition, message, detail = '') {
    const line = `${message}${detail ? `: ${detail}` : ''}`;
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${line}`);
    if (!condition) checks.push(line);
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
        const consoleErrors = [];
        const moduleErrors = [];
        const failedResponses = [];
        const rawFactoryRequests = [];

        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
            if (/module|import|specifier|resolve/i.test(error.message)) moduleErrors.push(error.message);
        });
        page.on('console', (message) => {
            const entry = `${message.type()}: ${message.text()}`;
            if (message.type() === 'error') consoleErrors.push(entry);
            if (
                (message.type() === 'error' || message.type() === 'warning')
                && /module|import|specifier|resolve/i.test(entry)
            ) {
                moduleErrors.push(entry);
            }
        });
        page.on('response', (response) => {
            if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
        });
        page.on('request', (request) => {
            const url = new URL(request.url());
            if (url.pathname === RAW_FACTORY_PATH) rawFactoryRequests.push(request.url());
        });

        const url = new URL(TARGET_URL);
        if (!url.searchParams.has('debug')) url.searchParams.set('debug', '1');
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => Boolean(window.__game && window.__three?.world), null, {
            timeout: 15000,
        });
        await page.waitForFunction((key) => (
            window.__game.scene.getScene(key)?.scene?.isActive() === true
        ), SCENE_KEYS.combat, { timeout: 15000 });

        // Exercise production scene ownership through Phaser's public Scene
        // Manager. The existing overlay is stopped first so GameScene's launch
        // receives its real modelUrl data instead of reusing the default scene.
        await page.evaluate(({ combat, overlay }) => {
            window.__game.scene.stop(combat);
            window.__game.scene.stop(overlay);
        }, SCENE_KEYS);
        await page.waitForFunction(({ combat, overlay }) => {
            const game = window.__game;
            return game.scene.getScene(combat)?.scene?.isActive() === false
                && game.scene.getScene(overlay)?.scene?.isActive() === false
                && window.__three?.world?.stats?.running === false;
        }, SCENE_KEYS, { timeout: 15000 });
        await page.evaluate((key) => window.__game.scene.run(key), SCENE_KEYS.game);

        await page.waitForFunction(({ game, overlay }) => {
            const manager = window.__game.scene;
            return manager.getScene(game)?.scene?.isActive() === true
                && manager.getScene(overlay)?.scene?.isActive() === true
                && window.__three?.world?.stats?.running === true;
        }, SCENE_KEYS, { timeout: 15000 });

        // Let the async factory import settle. RED times out here because the
        // raw public module cannot resolve its bare `three` import.
        await page.waitForFunction(() => Boolean(
            window.__three?.world?.root?.getObjectByName('demo-prop')
        ), null, { timeout: 10000 }).catch(() => {});

        const state = await page.evaluate(({ game, overlay }) => {
            const manager = window.__game.scene;
            const world = window.__three.world;
            return {
                gameActive: manager.getScene(game)?.scene?.isActive() ?? false,
                overlayActive: manager.getScene(overlay)?.scene?.isActive() ?? false,
                worldRunning: world.stats.running,
                demoPropInRoot: Boolean(world.root?.getObjectByName('demo-prop')),
                rootChildren: world.root?.children.map((child) => child.name) ?? [],
            };
        }, SCENE_KEYS);

        const failures = [];
        report(failures, state.gameActive, 'Game scene is active');
        report(failures, state.overlayActive, 'ThreeOverlayScene is active');
        report(failures, state.worldRunning, 'ThreeWorld is running');
        report(
            failures,
            state.demoPropInRoot,
            'Bundled demo-prop is attached under ThreeWorld.root',
            JSON.stringify(state.rootChildren),
        );
        report(
            failures,
            rawFactoryRequests.length === 0,
            'No raw public model factory request',
            JSON.stringify(rawFactoryRequests),
        );
        report(failures, pageErrors.length === 0, 'No page errors', JSON.stringify(pageErrors));
        report(failures, consoleErrors.length === 0, 'No console errors', JSON.stringify(consoleErrors));
        report(failures, moduleErrors.length === 0, 'No module-resolution errors', JSON.stringify(moduleErrors));
        report(failures, failedResponses.length === 0, 'No HTTP responses >= 400', JSON.stringify(failedResponses));

        if (failures.length > 0) {
            throw new Error(`${failures.length} PAT-11 check(s) failed`);
        }
        console.log('\nPASS — PAT-11 bundled model production-preview regression');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('FAIL — bundled-model-production-preview:', error.message);
    process.exit(1);
});
