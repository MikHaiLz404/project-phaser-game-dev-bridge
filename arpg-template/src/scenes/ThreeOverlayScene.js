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
import { threeWorld } from '../threejs/ThreeWorld.js';
import { loadModel } from '../threejs/ModelLoader.js';
import { ThreeBridge } from '../threejs/ThreeBridge.js';

const SCENE_KEY = 'ThreeOverlayScene';

export class ThreeOverlayScene extends Phaser.Scene {
    constructor() {
        super(SCENE_KEY);
        this._modelUnsub = null;
        this._failUnsub = null;
    }

    init(data) {
        // data.modelUrl — optional, load on boot
        this._bootModelUrl = data?.modelUrl ?? '/models/createDemoPropModel.js';
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

        // Boot the placeholder/requested model. The placeholder proves the
        // pipeline works even before any real img2threejs output exists.
        loadModel(this._bootModelUrl, this._bootSpec ?? {}, { addToWorld: true })
            .then((group) => {
                console.info('[ThreeOverlayScene] boot model ready:', group.name);
            })
            .catch((err) => {
                console.warn('[ThreeOverlayScene] boot model failed (continuing):', err?.message);
            });

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
    }
}