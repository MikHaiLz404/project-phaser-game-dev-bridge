/**
 * ThreeOverlayScene.js — Phaser scene that drives the 3D background layer
 * in lock-step with the Phaser game loop.
 *
 * This scene does NOT draw anything to its own canvas — it only owns the
 * lifecycle of the ThreeWorld singleton (boot / update / dispose) and
 * forwards model-load events into Phaser's event system.
 *
 * Why a dedicated Phaser scene?
 *   - Phaser scene lifecycle (create / update / shutdown) is the cleanest
 *     way to hook a per-frame render call into Phaser's RAF loop.
 *   - `this.scene.pause()` / `resume()` automatically suspends the 3D
 *     layer without any extra plumbing.
 *   - Multiple Phaser scenes can `launch('ThreeOverlayScene')` from
 *     wherever 3D content is needed, then `stop()` it on menu/pause.
 *
 * Usage from another scene:
 *   this.scene.launch('ThreeOverlayScene', { modelUrl: '/models/foo.js' });
 *   this.scene.get('ThreeOverlayScene').events.on('model-loaded', (g) => ...);
 */

import Phaser from 'phaser';
import * as THREE from 'three';
import { threeWorld } from '../threejs/ThreeWorld.js';
import { loadModel } from '../threejs/ModelLoader.js';
import { ThreeBridge } from '../threejs/ThreeBridge.js';
import createAsianVillage from '../threejs/models/createAsianVillage.js';
import createPlayerController from '../threejs/models/createPlayerController.js';
import createNPCs from '../threejs/models/createNPCs.js';
import createForest from '../threejs/models/createForest.js';
import createWildlife from '../threejs/models/createWildlife.js';
import createGoblins from '../threejs/models/createGoblin.js';

const SCENE_KEY = 'ThreeOverlayScene';

export class ThreeOverlayScene extends Phaser.Scene {
    constructor() {
        super(SCENE_KEY);
        this._modelUnsub = null;
        this._failUnsub = null;
    }

    init(data) {
        // data.modelUrl — optional, load on boot
        this._bootModelUrl = data?.modelUrl ?? null;
        this._bootSpec = data?.spec ?? null;
    }

    create() {
        // Attach the 3D renderer to the #three-canvas element defined in
        // index.html. ThreeWorld.boot() is idempotent so a second launch
        // (e.g. after pause/resume) is a no-op.
        const canvas = document.getElementById('three-canvas');
        if (!canvas) {
            console.error('[ThreeOverlayScene] #three-canvas not found in DOM');
            return;
        }
        threeWorld.boot(canvas);

        // Forward bridge events into Phaser's event bus so other Phaser
        // scenes can subscribe via `this.scene.get('ThreeOverlayScene').events`.
        this._modelUnsub = ThreeBridge.on('model-loaded', ({ url, group, took }) => {
            this.events.emit('model-loaded', { url, group, took });
        });
        this._failUnsub = ThreeBridge.on('model-load-fail', ({ url, error }) => {
            this.events.emit('model-load-fail', { url, error: error?.message ?? String(error) });
        });

        // Phase 1 POC: use the statically-imported demo factory directly.
        // The dynamic-URL path is kept intact for future img2threejs drops.
        if (this._bootModelUrl) {
            loadModel(this._bootModelUrl, this._bootSpec ?? {}, { addToWorld: true })
                .then((group) => {
                    console.info('[ThreeOverlayScene] boot model ready:', group.name);
                })
                .catch((err) => {
                    console.warn('[ThreeOverlayScene] boot model failed (continuing):', err?.message);
                });
        } else {
            // Inline default — bypasses ModelLoader's dynamic-import entirely
            // and proves the 3D layer is alive even when the URL route is broken.
            try {
                const group = createAsianVillage(this._bootSpec ?? {}, { addToWorld: true });
                group.scale.set(1, 1, 1);
                group.position.set(0, 0, 0);
                // Enable shadow casting on every mesh of the village
                group.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                    }
                });
                threeWorld.add(group);
                // Attach the house-layout GUI tool after the village is in the world
                if (threeWorld.gui) {
                    import('../threejs/models/createHouseLayoutTool.js').then(({ attachHouseLayoutTool }) => {
                        attachHouseLayoutTool(threeWorld.gui, threeWorld, group);
                    }).catch((err) => {
                        console.warn('[ThreeOverlayScene] house-layout tool attach failed:', err?.message);
                    });
                }
                console.info('[ThreeOverlayScene] inline asian village added:', group.name);

                // -----------------------------------------------------------------
                // Spawn ambient NPCs that wander the village
                // -----------------------------------------------------------------
                try {
                    this._npcs = createNPCs({
                        scene: threeWorld.scene,
                        count: 5,
                        bounds: { minX: -22, maxX: 22, minZ: -22, maxZ: 22 },
                        walkSpeed: 1.8,
                    });
                    console.info('[ThreeOverlayScene] NPCs spawned:', this._npcs.npcs.length);
                } catch (err) {
                    console.warn('[ThreeOverlayScene] NPC spawn failed:', err?.message);
                }

                // -----------------------------------------------------------------
                // Player + third-person camera controller
                // -----------------------------------------------------------------
                try {
                    const threeCanvas = document.getElementById('three-canvas');
                    this._playerCtrl = createPlayerController({
                        camera: threeWorld.camera,
                        domElement: threeCanvas,
                        scene: threeWorld.scene,
                        controls: threeWorld.controls,
                        spawnPosition: { x: 0, z: -12 },
                    });
                    console.info('[ThreeOverlayScene] player + third-person camera ready');

                    // -----------------------------------------------------------------
                    // Player Parameters GUI folder — top-level, sibling of Scene Setup.
                    // Tunes physics constants (walk/run speed, jump height, gravity,
                    // camera distance/height/smoothing, attack duration/cooldown).
                    // NOTE: this folder is NOT the keyboard shortcuts reference —
                    // those are documented in the "Player Control" overlay panel
                    // in index.html.
                    // -----------------------------------------------------------------
                    if (threeWorld.gui) {
                        const paramsFolder = threeWorld.gui.addFolder('Player Parameters');
                        paramsFolder.close();
                        paramsFolder.add(this._playerCtrl, 'moveSpeed', 1, 12, 0.1).name('Walk Speed');
                        paramsFolder.add(this._playerCtrl, 'runMultiplier', 1, 3, 0.05).name('Run Multiplier');
                        paramsFolder.add(this._playerCtrl, 'jumpVelocity', 2, 12, 0.1).name('Jump Height');
                        paramsFolder.add(this._playerCtrl, 'gravity', 5, 40, 0.5).name('Gravity');
                        paramsFolder.add(this._playerCtrl, 'cameraDistance', 3, 15, 0.2).name('Camera Distance');
                        paramsFolder.add(this._playerCtrl, 'cameraHeight', 1, 8, 0.1).name('Camera Height');
                        paramsFolder.add(this._playerCtrl, 'cameraSmoothing', 0, 12, 0.1).name('Camera Smoothing');

                        // Attack controls — duration + cooldown both live-tunable
                        const attackFolder = paramsFolder.addFolder('Attack');
                        attackFolder.add(this._playerCtrl, 'attackDuration', 0.1, 1.5, 0.05).name('Swing Duration (s)');
                        attackFolder.add(this._playerCtrl, 'attackCooldown', 0.0, 2.0, 0.05).name('Cooldown (s)');
                        const attackBtn = { '⚔️ Trigger Swing Now': () => this._playerCtrl.tryAttack() };
                        attackFolder.add(attackBtn, '⚔️ Trigger Swing Now');
                        const attackModeState = { mode: this._playerCtrl.getAttackInputMode() };
                        attackFolder.add(attackModeState, 'mode', ['LMB', 'RMB']).name('Attack Button').onChange(v => {
                            this._playerCtrl.setAttackInputMode(v);
                        });

                        const playerActions = {
                            '🎯 Snap to Player': () => this._playerCtrl.snapToPlayer(),
                            '🚫 Disable Input': () => this._playerCtrl.setEnabled(false),
                            '✅ Enable Input': () => this._playerCtrl.setEnabled(true),
                            '📍 Teleport (0,-12)': () => this._playerCtrl.teleport(0, -12),
                        };
                        // Follow Mode checkbox — toggle between follow-camera (default)
                        // and free-camera (OrbitControls takes over).
                        const followState = { enabled: this._playerCtrl.isFollowMode() };
                        const followCtrl = paramsFolder.add(followState, 'enabled').name('🔗 Follow Mode');
                        followCtrl.onChange(v => {
                            this._playerCtrl.setFollowMode(v);
                        });
                        paramsFolder.add(playerActions, '🎯 Snap to Player');
                        paramsFolder.add(playerActions, '🚫 Disable Input');
                        paramsFolder.add(playerActions, '✅ Enable Input');
                        paramsFolder.add(playerActions, '📍 Teleport (0,-12)');
                        console.info('[ThreeOverlayScene] player parameters GUI attached');
                    }
                } catch (err) {
                    console.warn('[ThreeOverlayScene] player controller failed:', err?.message);
                }

                // -----------------------------------------------------------------
                // Forest zone (north of village) + wildlife + goblins
                // -----------------------------------------------------------------
                try {
                    const forestGroup = createForest({}, { addToWorld: false });
                    forestGroup.traverse((child) => {
                        if (child.isMesh) child.castShadow = true;
                    });
                    threeWorld.add(forestGroup);
                    console.info('[ThreeOverlayScene] forest added:', forestGroup.name);

                    // Live player ref for wildlife/goblin chase behaviour
                    const playerRef = { position: this._playerCtrl?.player?.position ?? null };

                    this._wildlife = createWildlife({
                        scene: threeWorld.scene,
                        count: 8,
                        bounds: { minX: -20, maxX: 20, minZ: -32, maxZ: -62 },
                        playerRef,
                    });
                    console.info('[ThreeOverlayScene] wildlife spawned:', this._wildlife.animals.length);

                    this._goblins = createGoblins({
                        scene: threeWorld.scene,
                        count: 4,
                        bounds: { minX: -18, maxX: 18, minZ: -34, maxZ: -60 },
                        playerRef,
                    });
                    console.info('[ThreeOverlayScene] goblins spawned:', this._goblins.goblins.length);
                } catch (err) {
                    console.warn('[ThreeOverlayScene] forest/wildlife/goblins failed:', err?.message);
                }
            } catch (err) {
                console.warn('[ThreeOverlayScene] inline asian village failed:', err?.message);
            }
        }

        // Auto-shutdown: dispose ThreeWorld when this scene is stopped.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._onShutdown, this);
    }

    _onShutdown() {
        this._modelUnsub?.();
        this._failUnsub?.();
        threeWorld.dispose();
        console.info('[ThreeOverlayScene] shutdown complete');
    }

    update(time, delta) {
        // Phaser passes delta in milliseconds. ThreeWorld converts to seconds.
        threeWorld.update(delta);

        // Player + NPC controllers run in seconds (delta is ms → sec)
        const dtSec = delta * 0.001;
        if (this._npcs) this._npcs.update(dtSec);
        if (this._playerCtrl) this._playerCtrl.update(dtSec);
        if (this._wildlife) this._wildlife.update(dtSec);
        if (this._goblins) this._goblins.update(dtSec);
    }
}