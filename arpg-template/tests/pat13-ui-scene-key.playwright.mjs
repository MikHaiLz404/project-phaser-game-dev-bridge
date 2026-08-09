/**
 * pat13-ui-scene-key.playwright.mjs
 * =================================
 *
 * PAT-13 runtime regression: GameScene must launch the registered UI scene
 * through its canonical key and leave that scene active without page errors.
 */

import { chromium } from 'playwright';

const TARGET_URL = process.env.PAT13_URL ?? 'http://127.0.0.1:5174/';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=swiftshader', '--enable-webgl'],
    });

    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));

        const url = new URL(TARGET_URL);
        url.searchParams.set('debug', '1');
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => Boolean(window.__game?.scene), null, { timeout: 15000 });
        // The app currently boots CombatTest; explicitly drive the GameScene
        // owner path through Phaser's public Scene Manager for this regression.
        await page.evaluate(() => {
            const manager = window.__game.scene;
            if (manager.isActive('CombatTest')) manager.stop('CombatTest');
            if (!manager.isActive('Game')) manager.run('Game');
        });
        await page.waitForFunction(() => window.__game?.scene?.isActive('Game'), null, { timeout: 15000 });
        await page.waitForFunction(() => window.__game?.scene?.isActive('UI'), null, { timeout: 15000 });

        const state = await page.evaluate(() => {
            const manager = window.__game.scene;
            return {
                gameActive: manager.isActive('Game'),
                uiActive: manager.isActive('UI'),
                registeredKeys: manager.getScenes(false).map((scene) => scene.scene.key).sort(),
            };
        });

        assert(state.gameActive, 'PAT-13: Game scene is not active');
        assert(state.uiActive, `PAT-13: registered UI scene was not active; keys=${JSON.stringify(state.registeredKeys)}`);
        assert(pageErrors.length === 0, `PAT-13 runtime page errors: ${pageErrors.join(' | ')}`);
        console.log('[PASS] PAT-13 canonical UI scene launch:', JSON.stringify(state));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('FAIL — PAT-13 UI scene key:', error.message);
    process.exit(1);
});
