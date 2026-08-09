import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const PORT = Number(process.env.PAT15_PORT ?? 4175);
const BASE_URL = process.env.PAT15_URL ?? `http://127.0.0.1:${PORT}/`;
const ownsServer = !process.env.PAT15_URL;

const originalEnemies = JSON.parse(
    await readFile(new URL('../src/data/enemies.json', import.meta.url), 'utf8'),
);
const routedEnemies = structuredClone(originalEnemies);
routedEnemies.slime.hp = 73;
routedEnemies.slime.speed = 137;
routedEnemies.slime.spawnX = 611;
routedEnemies.slime.spawnY = 299;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, processHandle) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (processHandle?.exitCode !== null) {
            throw new Error(`Vite exited before becoming ready (code ${processHandle.exitCode})`);
        }
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Vite is still starting.
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for Vite at ${url}`);
}

let server = null;
let browser = null;

try {
    if (ownsServer) {
        server = spawn(
            'npm',
            ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
            { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] },
        );
        await waitForServer(BASE_URL, server);
    }

    browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=swiftshader', '--enable-webgl'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const pageErrors = [];
    const failedResponses = [];
    const dataRequests = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
        if (response.status() >= 400) {
            failedResponses.push(`${response.status()} ${response.url()}`);
        }
    });
    page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (pathname.includes('/data/')) dataRequests.push(pathname);
    });

    await page.route(/\/src\/data\/enemies\.json(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(routedEnemies),
        });
    });

    const url = new URL(BASE_URL);
    url.searchParams.set('debug', '1');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
        const scene = window.__game?.scene?.getScene('CombatTest');
        return Boolean(scene?.scene?.isActive() && scene.enemy && scene.enemyAI);
    }, null, { timeout: 15000 });

    const runtime = await page.evaluate(() => {
        const scene = window.__game.scene.getScene('CombatTest');
        const potionAdded = scene.inventory?.addItem('health_potion', 12);
        const swordAdded = scene.inventory?.addItem('iron_sword');
        const armorAdded = scene.inventory?.addItem('dragon_armor');
        const swordSlot = scene.inventory?.slots.findIndex((slot) => slot?.itemId === 'iron_sword');
        const armorSlot = scene.inventory?.slots.findIndex((slot) => slot?.itemId === 'dragon_armor');
        const swordEquipped = swordSlot >= 0 ? scene.inventory.equip(swordSlot) : false;
        const armorEquipped = armorSlot >= 0 ? scene.inventory.equip(armorSlot) : false;
        const initialEnemyHp = scene.enemy?.hp;
        const initialEnemyMaxHp = scene.enemy?.maxHp;
        const damageApplied = scene.enemyAI.takeDamage(10);
        scene.updateHUD();

        return {
            cacheEnemyHp: scene.cache.json.get('enemies')?.slime?.hp,
            cacheItemMaxStack: scene.cache.json.get('items')?.health_potion?.maxStack,
            enemyId: scene.enemy?.enemyId,
            enemyHp: initialEnemyHp,
            enemyMaxHp: initialEnemyMaxHp,
            enemyX: scene.enemy?.x,
            enemyY: scene.enemy?.y,
            aiHp: scene.enemyAI?.config?.hp,
            aiSpeed: scene.enemyAI?.config?.speed,
            inventoryCreated: Boolean(scene.inventory),
            potionAdded,
            potionCount: scene.inventory?.countItem('health_potion'),
            swordAdded,
            armorAdded,
            swordEquipped,
            armorEquipped,
            equipment: scene.inventory?.equipment,
            derivedStats: scene.inventory?.getStats(),
            damageApplied,
            damagedAiHp: scene.enemyAI?.hp,
            damagedSpriteHp: scene.enemy?.hp,
            damagedHudWidth: scene.hpBar?.width,
            canvasCount: document.querySelectorAll('canvas').length,
        };
    });

    assert(dataRequests.some((path) => path === '/src/data/enemies.json'),
        `canonical enemy JSON request not observed: ${JSON.stringify(dataRequests)}`);
    assert(dataRequests.some((path) => path === '/src/data/items.json'),
        `canonical item JSON request not observed: ${JSON.stringify(dataRequests)}`);
    assert.equal(runtime.cacheEnemyHp, 73, 'intercepted enemy JSON did not enter Phaser cache');
    assert.equal(runtime.enemyId, 'slime');
    assert.equal(runtime.enemyHp, 73, 'CombatTestScene used a duplicate enemy HP value');
    assert.equal(runtime.enemyMaxHp, 73, 'CombatTestScene max HP did not derive from JSON');
    assert.equal(runtime.enemyX, 611, 'CombatTestScene spawnX did not derive from JSON');
    assert.equal(runtime.enemyY, 299, 'CombatTestScene spawnY did not derive from JSON');
    assert.equal(runtime.aiHp, 73, 'EnemyAI HP did not derive from JSON');
    assert.equal(runtime.aiSpeed, 137, 'EnemyAI speed did not derive from JSON');
    assert.equal(runtime.cacheItemMaxStack, 10);
    assert.equal(runtime.inventoryCreated, true);
    assert.equal(runtime.potionAdded, true);
    assert.equal(runtime.potionCount, 12);
    assert.equal(runtime.swordAdded, true);
    assert.equal(runtime.armorAdded, true);
    assert.equal(runtime.swordEquipped, true);
    assert.equal(runtime.armorEquipped, true);
    assert.deepEqual(runtime.equipment, {
        weapon: 'iron_sword',
        armor: 'dragon_armor',
        accessory: null,
    });
    assert.deepEqual(runtime.derivedStats, {
        attack: 10,
        defense: 30,
        hp: 0,
        fireResist: 50,
    });
    assert.equal(runtime.damageApplied, true);
    assert.equal(runtime.damagedAiHp, 63, 'EnemyAI damage did not update authoritative HP');
    assert.equal(runtime.damagedSpriteHp, 63, 'EnemyAI damage left sprite HP stale');
    assert.equal(runtime.damagedHudWidth, (63 / 73) * 200, 'EnemyAI damage left HUD HP stale');
    assert(runtime.canvasCount >= 2, `expected Phaser + Three canvases, got ${runtime.canvasCount}`);
    assert.deepEqual(pageErrors, [], `runtime page errors: ${pageErrors.join(' | ')}`);
    assert.deepEqual(failedResponses, [], `HTTP failures: ${failedResponses.join(' | ')}`);

    console.log('[PASS] canonical JSON requests:', JSON.stringify(dataRequests));
    console.log('[PASS] CombatTestScene intercepted enemy data:', JSON.stringify({
        hp: runtime.enemyHp,
        speed: runtime.aiSpeed,
        spawn: [runtime.enemyX, runtime.enemyY],
    }));
    console.log('[PASS] runtime inventory + equipment stats:', JSON.stringify({
        potionCount: runtime.potionCount,
        equipment: runtime.equipment,
        derivedStats: runtime.derivedStats,
    }));
    console.log('[PASS] Phaser browser smoke:', JSON.stringify({
        canvasCount: runtime.canvasCount,
        pageErrors,
        failedResponses,
    }));
    console.log('\nPASS — PAT-15 runtime consumes canonical loaded JSON data');
} finally {
    await browser?.close();
    if (server && server.exitCode === null) {
        server.kill('SIGTERM');
        await Promise.race([
            new Promise((resolve) => server.once('exit', resolve)),
            delay(2000),
        ]);
        if (server.exitCode === null) server.kill('SIGKILL');
    }
}
