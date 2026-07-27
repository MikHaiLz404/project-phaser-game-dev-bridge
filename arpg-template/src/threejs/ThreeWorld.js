/**
 * ThreeWorld.js — bootstrap for the 3D background layer of the Two-Canvas
 * Sandwich pattern. Owns its own WebGLRenderer bound to <canvas id="three-canvas">,
 * a perspective camera, a basic three-point light rig, and a root Group that
 * holds every model loaded via ModelLoader.
 *
 * This class is intentionally a *singleton* per page. Phaser and Three.js
 * share the same window but run in two independent WebGL contexts (Phaser 4
 * owns its canvas, Three.js owns the #three-canvas). There is no context
 * sharing — the two layers communicate through ThreeBridge (event bus).
 *
 * Lifecycle (driven by ThreeOverlayScene):
 *   1. ThreeOverlayScene.create() → ThreeWorld.boot(canvas)
 *   2. ThreeOverlayScene.update(dt) → ThreeWorld.update(dt)
 *   3. scene shutdown → ThreeWorld.dispose()
 */

import * as THREE from 'three';

export class ThreeWorld {
    constructor() {
        /** @type {THREE.WebGLRenderer|null} */
        this.renderer = null;
        /** @type {THREE.Scene} */
        this.scene = new THREE.Scene();
        /** @type {THREE.PerspectiveCamera} */
        this.camera = null;
        /** @type {THREE.Group} */
        this.root = new THREE.Group();
        this.scene.add(this.root);

        // Default ambient + hemisphere fill — cheap, prevents black silhouettes
        // before any directional lights are added.
        this.scene.background = new THREE.Color(0x101024);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x202040, 0.6);
        this.scene.add(hemi);

        // Directional "sun" — tuned for game-prop lighting (45° elevation).
        const sun = new THREE.DirectionalLight(0xffeec0, 1.1);
        sun.position.set(4, 6, 3);
        this.scene.add(sun);

        // Soft backlight to separate objects from background.
        const back = new THREE.DirectionalLight(0x88aaff, 0.3);
        back.position.set(-3, 2, -4);
        this.scene.add(back);

        this._running = false;
        this._disposed = false;
    }

    /**
     * Attach the renderer to a canvas and set initial size.
     * Idempotent — safe to call multiple times.
     * @param {HTMLCanvasElement} canvas
     */
    boot(canvas) {
        if (this.renderer || this._disposed) {
            console.warn('[ThreeWorld] boot() called twice — ignoring');
            return;
        }

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 1.2, 4);
        this.camera.lookAt(0, 0, 0);

        this._resize();
        window.addEventListener('resize', this._resize);

        this._running = true;
        console.info('[ThreeWorld] booted — canvas:', canvas.width, 'x', canvas.height);
    }

    _resize = () => {
        if (!this.renderer || !this.camera) return;
        const canvas = this.renderer.domElement;
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    };

    /**
     * @param {number} dt — delta in milliseconds (Phaser passes ms, Three.js
     * uses seconds internally so we convert here).
     */
    update(dt) {
        if (!this._running) return;
        // Convert ms → s for Three.js animation conventions.
        const deltaSeconds = dt * 0.001;

        // Light scene-root rotation so the placeholder looks alive in dev.
        // Real games replace this with game-specific tick logic.
        if (this.root.children.length === 0) {
            // Demo helper — auto-add a cube the first time so an empty scene
            // still proves the canvas is alive. Safe to remove once real
            // models are loaded.
            this._addDemoCube();
        }

        this.renderer.render(this.scene, this.camera);
    }

    _addDemoCube() {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff5577,
            metalness: 0.3,
            roughness: 0.5,
        });
        const cube = new THREE.Mesh(geo, mat);
        cube.name = '__demoCube';
        this.root.add(cube);
    }

    /**
     * Add a THREE.Object3D (typically from an img2threejs-generated factory)
     * to the world. Caller retains ownership of the object.
     * @param {THREE.Object3D} obj
     */
    add(obj) {
        if (!obj || !(obj instanceof THREE.Object3D)) {
            console.warn('[ThreeWorld] add() called with non-Object3D:', obj);
            return;
        }
        this.root.add(obj);
    }

    remove(obj) {
        this.root.remove(obj);
    }

    /**
     * Tear down GPU resources. Call from Phaser scene `shutdown` event.
     */
    dispose() {
        if (this._disposed) return;
        this._running = false;
        window.removeEventListener('resize', this._resize);

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss?.();
            this.renderer = null;
        }
        this.scene.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose?.();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
                else obj.material.dispose?.();
            }
        });
        this.scene.clear();
        this._disposed = true;
        console.info('[ThreeWorld] disposed');
    }

    /** Debug helper exposed via window.__three.world */
    get stats() {
        return {
            objects: this.root.children.length,
            running: this._running,
            disposed: this._disposed,
        };
    }
}

// Singleton — see class docstring.
export const threeWorld = new ThreeWorld();