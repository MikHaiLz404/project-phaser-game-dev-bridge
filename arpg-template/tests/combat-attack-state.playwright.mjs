import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const TEST_PORT = 5176;
const TARGET_URL = process.env.COMBAT_ATTACK_URL ?? `http://127.0.0.1:${TEST_PORT}/`;
const ownsServer = !process.env.COMBAT_ATTACK_URL;
let server = null;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForServer(url, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Vite is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Vite did not become ready at ${url}`);
}

async function main() {
    if (ownsServer) {
        server = spawn(
            process.execPath,
            ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(TEST_PORT), '--strictPort'],
            { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
        );
        await waitForServer(TARGET_URL);
    }

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
        await page.waitForSelector('#game-container canvas', { state: 'visible', timeout: 15000 });
        await page.waitForFunction(() => {
            const scene = window.__game?.scene?.getScene('CombatTest');
            return Boolean(scene?.scene?.isActive() && scene.player && scene.enemy && scene.combatSystem);
        }, null, { timeout: 15000 });

        await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            scene.enemyAI.update = () => {};
            scene.enemy.body.setVelocity(0, 0);
            scene.player.body.setVelocity(0, 0);

            window.__pat12ResolveCalls = 0;
            const resolveHit = scene.combatSystem.resolveHit.bind(scene.combatSystem);
            scene.combatSystem.resolveHit = (...args) => {
                window.__pat12ResolveCalls += 1;
                return resolveHit(...args);
            };
        });

        const remoteStarted = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            scene.player.setPosition(100, 100);
            scene.enemy.setPosition(800, 400);
            scene.player.body.updateFromGameObject?.();
            scene.enemy.body.updateFromGameObject?.();
            scene.performAttack();
            scene.performAttack();
            return {
                distance: Math.hypot(scene.player.x - scene.enemy.x, scene.player.y - scene.enemy.y),
                attacking: scene.player.isAttacking,
            };
        });
        assert(remoteStarted.distance > 700, `Range setup: expected remote target, distance=${remoteStarted.distance}`);
        assert(remoteStarted.attacking === true, 'Range setup: remote attack did not enter startup');
        await page.waitForFunction(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return scene.player.isAttacking === false;
        }, null, { timeout: 5000 });
        const remoteFinal = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return {
                spriteHp: scene.enemy.hp,
                aiHp: scene.enemyAI.hp,
                resolveCalls: window.__pat12ResolveCalls,
            };
        });
        assert(remoteFinal.resolveCalls === 0,
            `Range: out-of-range action called resolveHit ${remoteFinal.resolveCalls} time(s)`);
        assert(remoteFinal.spriteHp === 50 && remoteFinal.aiHp === 50,
            `Range: out-of-range action changed HP; state=${JSON.stringify(remoteFinal)}`);
        console.log('[PASS] Out-of-range action completed without resolving damage:', JSON.stringify(remoteFinal));

        const started = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            scene.player.setPosition(scene.enemy.x - 20, scene.enemy.y);
            scene.player.body.updateFromGameObject?.();
            window.__pat12ResolveCalls = 0;

            const initial = {
                spriteHp: scene.enemy.hp,
                aiHp: scene.enemyAI.hp,
                attacking: scene.player.isAttacking,
            };
            const timing = { ...scene.combatSystem.config };
            scene.performAttack();
            scene.performAttack();

            return {
                initial,
                timing: {
                    startup: timing.startup,
                    active: timing.active,
                    recovery: timing.recovery,
                },
                attackingAfterInput: scene.player.isAttacking,
            };
        });

        assert(started.initial.spriteHp === 50, `Setup: expected enemy sprite HP 50, got ${started.initial.spriteHp}`);
        assert(started.initial.aiHp === 50, `Setup: expected EnemyAI HP 50, got ${started.initial.aiHp}`);
        assert(started.initial.attacking === false, 'Setup: player began in attacking state');
        assert(started.attackingAfterInput === true, 'Startup: player did not enter attacking state');
        console.log('[PASS] Startup entered attacking state:', JSON.stringify(started));

        await page.keyboard.press('KeyG');
        await page.waitForTimeout(Math.max(20, Math.floor(started.timing.startup / 2)));
        const beforeActive = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return {
                hp: scene.enemy.hp,
                guarding: scene.player.isGuarding,
                resolveCalls: window.__pat12ResolveCalls,
            };
        });
        assert(beforeActive.hp === 50, `Startup dealt damage early: enemy HP=${beforeActive.hp}`);
        assert(beforeActive.resolveCalls === 0, `Startup called resolveHit early: calls=${beforeActive.resolveCalls}`);
        assert(beforeActive.guarding === false,
            `Startup accepted guard input during a locked attack; state=${JSON.stringify(beforeActive)}`);
        console.log('[PASS] Startup window did not resolve damage:', JSON.stringify(beforeActive));

        await page.waitForFunction(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return window.__pat12ResolveCalls === 1 && scene.player.isAttacking === false;
        }, null, { timeout: 5000 });
        const final = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return {
                spriteHp: scene.enemy.hp,
                aiHp: scene.enemyAI.hp,
                attacking: scene.player.isAttacking,
                resolveCalls: window.__pat12ResolveCalls,
            };
        });

        assert(final.resolveCalls === 1,
            `Active window: expected resolveHit exactly once, got ${final.resolveCalls}; state=${JSON.stringify(final)}`);
        assert(final.spriteHp === 25,
            `Damage: expected enemy sprite HP 50 -> 25, got ${final.spriteHp}`);
        assert(final.aiHp === 25,
            `Damage: expected EnemyAI HP 50 -> 25, got ${final.aiHp}`);
        assert(final.attacking === false,
            `Recovery: expected player.isAttacking=false, got ${final.attacking}`);

        console.log('[PASS] Active window resolved exactly one 25-damage hit:', JSON.stringify(final));
        console.log('[PASS] Recovery returned player to idle attack state');

        await page.waitForFunction(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return scene.enemyAI.isInvulnerable === false;
        }, null, { timeout: 5000 });
        await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            scene.enemy.body.setVelocity(0, 0);
            scene.player.setPosition(scene.enemy.x - 20, scene.enemy.y);
            scene.player.body.updateFromGameObject?.();
            window.__pat12ResolveCalls = 0;
            scene.performAttack();
            scene.performAttack();
        });
        await page.waitForFunction(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return scene.scene.isPaused();
        }, null, { timeout: 5000 });
        const killingFinal = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('CombatTest');
            return {
                spriteHp: scene.enemy.hp,
                aiHp: scene.enemyAI.hp,
                attacking: scene.player.isAttacking,
                paused: scene.scene.isPaused(),
                resolveCalls: window.__pat12ResolveCalls,
            };
        });
        assert(killingFinal.resolveCalls === 1,
            `Killing action: expected resolveHit exactly once; state=${JSON.stringify(killingFinal)}`);
        assert(killingFinal.spriteHp === 0 && killingFinal.aiHp === 0,
            `Killing action: expected enemy HP 25 -> 0; state=${JSON.stringify(killingFinal)}`);
        assert(killingFinal.attacking === false,
            `Killing action: victory pause stranded attacking state; state=${JSON.stringify(killingFinal)}`);
        console.log('[PASS] Killing action reset attack state before victory pause:', JSON.stringify(killingFinal));

        assert(pageErrors.length === 0, `Runtime page errors: ${pageErrors.join(' | ')}`);
        console.log('\nPASS — PAT-12 CombatTestScene runtime regression');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('FAIL — PAT-12 combat attack runtime:', error.message);
    process.exitCode = 1;
}).finally(async () => {
    if (server) {
        server.kill('SIGTERM');
        await new Promise((resolve) => {
            server.once('exit', resolve);
            setTimeout(resolve, 1000);
        });
    }
});
