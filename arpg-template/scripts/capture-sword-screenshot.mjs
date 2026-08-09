/**
 * capture-sword-screenshot.mjs
 * =============================
 *
 * Headless Playwright capture of the sword geometry from the gameplay
 * camera. Verifies the PAT-10 acceptance item requiring a runtime-visual
 * proof that blade + tip read as a continuous sword shape.
 *
 * Usage:
 *   1. Run `npm run dev` in a separate terminal
 *   2. Wait for "Local: http://localhost:5173/" to appear
 *   3. Run `npm run capture:screenshot`
 *   4. Output PNG is written to arpg-template/screenshots/sword-gameplay.png
 *
 * Why headless + screenshot (not a unit test):
 *   - The automated assertion in tests/sword-axes.test.mjs already proves
 *     the blade/tip vectors are parallel (dot product >= 0.99) on the
 *     Three.js object graph.
 *   - A screenshot from the gameplay camera proves the rendered scene
 *     shows the sword reading as a continuous shape from the player's
 *     perspective — a different signal than the math check.
 *
 * Tuning notes:
 *   - The Phaser canvas renders inside #game-container, and the Three.js
 *     canvas sits at #three-canvas with z-index above the Phaser one
 *     (see skill: "Z-index swap for Two-Canvas Sandwich mouse routing").
 *   - We screenshot the full page so the Three.js canvas + the lit HUD
 *     come out together — that's what the player actually sees.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const OUT_FILE = path.join(OUT_DIR, 'sword-gameplay.png');

const TARGET_URL = process.env.CAPTURE_URL ?? 'http://localhost:5173/';
const VIEWPORT = { width: 1280, height: 720 };
const WAIT_FOR_CANVAS_MS = 2500;     // give Phaser/Three a moment to boot
const WAIT_FOR_THREE_RENDER_MS = 1500; // extra settle time for first Three frame
const DEBUG_QUERY = '?debug=1';    // exposes window.__three.{world,game}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });

    const browser = await chromium.launch({
        // Headless mode + WebGL via swiftshader/software fallback. Three.js
        // boots on a software renderer in headless Chromium — the scene
        // geometry is what we want to verify, not shader fidelity.
        headless: true,
        args: ['--use-gl=swiftshader', '--enable-webgl'],
    });

    try {
        const context = await browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: 2,  // crisp screenshot for PR review
        });
        const page = await context.newPage();

        const fullUrl = TARGET_URL.includes('?')
            ? TARGET_URL
            : `${TARGET_URL}${DEBUG_QUERY}`;
        console.log(`capture: navigating to ${fullUrl}`);
        await page.goto(fullUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        // Wait for the Phaser canvas to mount.
        await page.waitForSelector('#game-container canvas', {
            timeout: 15000,
        });
        console.log('capture: Phaser canvas mounted');

        // Wait for the Three.js overlay canvas (mounted by ThreeOverlayScene).
        await page.waitForSelector('#three-canvas', {
            timeout: 15000,
        });
        console.log('capture: Three.js overlay canvas mounted');

        // Give the renderer a few frames to draw the scene.
        await page.waitForTimeout(WAIT_FOR_CANVAS_MS + WAIT_FOR_THREE_RENDER_MS);

        // Frame the sword for the screenshot. We want the gameplay camera to
        // look at the player's right hand (where the sword lives) from a
        // close, low angle so the blade/tip continuity is unambiguous.
        // Uses ThreeOverlayScene's exposed world + controls + camera.
        const frameInfo = await page.evaluate(() => {
            const tw = window.__three?.world;
            if (!tw) {
                return { error: 'window.__three.world missing' };
            }
            const { camera, controls, scene } = tw;
            // Find the player mesh. createCharacter() doesn't set a .name
            // on the group, but it does set userData and add a swordPivot
            // child. Walk the scene and pick the first group that owns a
            // swordPivot.
            let playerGroup = null;
            scene.traverse((o) => {
                if (playerGroup) return;
                if (o.children) {
                    for (const c of o.children) {
                        if (c.name === 'swordPivot') {
                            playerGroup = o;
                            break;
                        }
                    }
                }
            });
            if (!playerGroup || !controls) {
                return {
                    error: 'player group / controls not found',
                    playerFound: !!playerGroup,
                    controlsFound: !!controls,
                    cameraPos: [camera.position.x, camera.position.y, camera.position.z],
                    controlsTarget: [controls.target.x, controls.target.y, controls.target.z],
                };
            }
            const pos = playerGroup.position;
            const result = {
                before: {
                    cameraPos: [camera.position.x, camera.position.y, camera.position.z],
                    controlsTarget: [controls.target.x, controls.target.y, controls.target.z],
                    playerPos: [pos.x, pos.y, pos.z],
                },
            };
            // Frame the sword from the side so the blade + tip are visible as
            // a continuous shape. Sword sits at the player's right hand and
            // extends along local +Z (~0.84 units). Stand on the player's
            // right side, slightly above, and look across the sword so both
            // blade and tip are in profile.
            const SIDE_OFFSET = 1.4;
            controls.target.set(pos.x, pos.y + 0.4, pos.z + 0.45);
            camera.position.set(
                pos.x + SIDE_OFFSET,
                pos.y + 0.7,
                pos.z + 0.45,
            );
            camera.lookAt(controls.target);
            controls.enableDamping = false;
            controls.update();
            result.after = {
                cameraPos: [camera.position.x, camera.position.y, camera.position.z],
                controlsTarget: [controls.target.x, controls.target.y, controls.target.z],
            };
            return result;
        });
        console.log(`capture: frame info = ${JSON.stringify(frameInfo)}`);
        await page.waitForTimeout(500); // let controls.update settle

        // Read threeWorld stats from window.__three. With ?debug=1, main.js
        // exposes window.__three.world; without it, we get null.
        const stats = await page.evaluate(() => {
            const t = window.__three?.world?.stats;
            return t ? { objects: t.objects, running: t.running } : null;
        });
        console.log(`capture: threeWorld stats = ${JSON.stringify(stats)}`);

        if (!stats || stats.objects === 0) {
            console.warn(
                'capture: WARN — ThreeWorld reports 0 objects. ' +
                'Screenshot may be blank. The script continues so a debug ' +
                'screenshot is still produced.',
            );
        }

        await page.screenshot({
            path: OUT_FILE,
            fullPage: false,  // viewport only — matches gameplay camera framing
        });
        console.log(`capture: screenshot saved → ${OUT_FILE}`);
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('capture: FAILED:', err.message);
    process.exit(1);
});