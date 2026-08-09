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
 *   4. (optional) ThreeOverlayScene re-create → ThreeWorld.boot(canvas) again
 *
 * Reboot contract (PAT-9 [INV-004]): after dispose() the world must be
 * bootable again. boot() rebuilds the WebGLRenderer, scene, root group,
 * lights, ground, and grid from scratch so a relaunched scene gets a
 * fully fresh 3D layer. dispose() is idempotent (calling it twice is a
 * no-op), and `stats.disposed` is derived from `!this.renderer` rather
 * than a permanent flag.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';

/**
 * Create the lights + ground + grid that every fresh world needs.
 * Pulled out of the constructor (and out of boot()) so a relaunch can
 * rebuild the world without duplicating constructor boilerplate.
 */
function _buildSceneContents(scene) {
    // Layer 1: Background (deep navy blue)
    scene.background = new THREE.Color(0x1a3a8a);

    // Lighting — improved 3-point rig with warm key + cool fill + rim
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeec8, 1.6);
    sun.position.set(8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
    fill.position.set(-5, 3, -2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xccddff, 0.7);
    rim.position.set(0, 4, -8);
    scene.add(rim);

    const hemi = new THREE.HemisphereLight(0xb8d8ff, 0x4a3a2a, 0.6);
    scene.add(hemi);

    // Ground plane — sits at y = -1, receives shadows
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a3a,
        roughness: 0.9,
        metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper — 25×25 cells for spatial reference
    const grid = new THREE.GridHelper(100, 50, 0x4a5a8a, 0x2a3a6a);
    grid.position.y = -0.99;
    scene.add(grid);

    return { ambient, sun, fill, rim, hemi, ground, grid };
}

export class ThreeWorld {
    constructor() {
        // PAT-9: scene/root are created lazily in boot() now, NOT in the
        // constructor. The constructor only initializes the singleton
        // identity; the actual scene graph is built fresh on each boot()
        // so a relaunch never reuses stale objects from a prior cycle.
        /** @type {THREE.WebGLRenderer|null} */
        this.renderer = null;
        /** @type {THREE.Scene|null} */
        this.scene = null;
        /** @type {THREE.PerspectiveCamera|null} */
        this.camera = null;
        /** @type {THREE.Group|null} */
        this.root = null;
        /** @type {OrbitControls|null} */
        this.controls = null;
        /** @type {object|null} */
        this.lights = null;
        /** @type {GUI|null} */
        this.gui = null;

        this._running = false;
        // PAT-9: removed the permanent `_disposed` flag. `stats.disposed`
        // is now derived from `!this.renderer` (see `get stats()` below).
    }

    /**
     * Attach the renderer to a canvas and set initial size.
     *
     * Idempotent across dispose/reboot cycles: if a previous boot left
     * a renderer alive, dispose it first so the new boot starts from a
     * fully clean slate (no leaking WebGL contexts, no stale scene
     * contents, no duplicated lights/ground/grid).
     *
     * @param {HTMLCanvasElement} canvas
     */
    boot(canvas) {
        // PAT-9: tear down any leftover state from a prior cycle before
        // rebuilding. Without this, relaunching ThreeOverlayScene would
        // either early-return (old behaviour, broken) or accumulate
        // duplicate lights/ground/grid (new behaviour without this guard).
        if (this.renderer) {
            this._teardownRenderer();
        }

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true,  // Phase 1: keep buffer for debugging visibility
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // PAT-9: build a fresh scene + root for each boot. The previous
        // code created these in the constructor, which meant dispose()
        // emptied the scene but left the THREE.Scene object itself
        // holding stale background/fog references and any orphan children
        // that escaped the dispose traversal.
        this.scene = new THREE.Scene();
        this.root = new THREE.Group();
        this.scene.add(this.root);

        // Rebuild lights + ground + grid into the fresh scene.
        this.lights = _buildSceneContents(this.scene);

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
        // Pulled back to fit the village cluster (houses span ±18, road cross ±15)
        // + the forest zone to the north (z down to -65).
        this.camera.position.set(30, 20, 48);
        this.camera.lookAt(0, 0.5, -15);

        // Layer 5: OrbitControls — mouse drag rotates, scroll zooms, right-drag pans
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, -15);
        this.controls.minDistance = 2;
        this.controls.maxDistance = 90;
        this.controls.maxPolarAngle = Math.PI * 0.49; // prevent going below ground
        // enableRotate is disabled — player controller handles orbit in follow mode.
        // enablePan stays ON so Right-Drag pan works regardless of follow mode.
        this.controls.enableRotate = false;
        this.controls.enablePan = true;

        this._resize();
        window.addEventListener('resize', this._resize);

        // lil-gui panel — root panel hosts the top-level tool folders
        // (Scene Setup, Player Control, House Layout). Individual folders
        // declare their own scope so the root title stays neutral.
        this.gui = new GUI({ title: 'Asian Village POC' });
        this.gui.domElement.style.position = 'fixed';
        this.gui.domElement.style.top = '12px';
        this.gui.domElement.style.left = '12px';
        this.gui.domElement.style.zIndex = '110';
        this.gui.domElement.style.opacity = '0.95';

        const lighting = {
            ambient: 0.6,
            key: 1.6,
            keyX: 6,
            keyY: 10,
            keyZ: 5,
            fill: 0.6,
            rim: 0.7,
            hemi: 0.6,
            exposure: 1.1,
            shadow: true,
        };

        // Master folder — Scene Setup (lighting + camera defaults + render)
        // Renamed from "Scene Lights" so future Scene-Setup concerns
        // (camera defaults, render options, post-processing) belong here.
        const setupFolder = this.gui.addFolder('Scene Setup');
        setupFolder.close();

        setupFolder.add(lighting, 'ambient', 0, 2, 0.01).name('Ambient').onChange(v => { if (this.lights) this.lights.ambient.intensity = v; });
        // Key Light — intensity + position (angle control)
        const keyFolder = setupFolder.addFolder('Key Light');
        keyFolder.add(lighting, 'key', 0, 3, 0.01).name('Intensity').onChange(v => { if (this.lights) this.lights.sun.intensity = v; });
        keyFolder.add(lighting, 'keyX', -10, 10, 0.1).name('Position X').onChange(v => { if (this.lights) this.lights.sun.position.x = v; });
        keyFolder.add(lighting, 'keyY', 0.5, 15, 0.1).name('Position Y').onChange(v => { if (this.lights) this.lights.sun.position.y = v; });
        keyFolder.add(lighting, 'keyZ', -10, 10, 0.1).name('Position Z').onChange(v => { if (this.lights) this.lights.sun.position.z = v; });

        setupFolder.add(lighting, 'fill', 0, 2, 0.01).name('Fill Light').onChange(v => { if (this.lights) this.lights.fill.intensity = v; });
        setupFolder.add(lighting, 'rim', 0, 2, 0.01).name('Rim Light').onChange(v => { if (this.lights) this.lights.rim.intensity = v; });
        setupFolder.add(lighting, 'hemi', 0, 2, 0.01).name('Hemisphere').onChange(v => { if (this.lights?.hemi) this.lights.hemi.intensity = v; });
        setupFolder.add(lighting, 'exposure', 0.2, 2.0, 0.01).name('Exposure').onChange(v => { if (this.renderer) this.renderer.toneMappingExposure = v; });
        setupFolder.add(lighting, 'shadow').name('Shadows').onChange(v => { if (this.renderer) this.renderer.shadowMap.enabled = v; });

        // sync actual light positions to UI defaults
        if (this.lights) {
            this.lights.sun.position.set(lighting.keyX, lighting.keyY, lighting.keyZ);
        }

        this._running = true;
        console.info('[ThreeWorld] booted — canvas:', canvas.width, 'x', canvas.height);
    }

    /**
     * Internal helper — dispose ONLY the renderer/controls/gui/resize
     * listener. Does NOT touch the scene graph. Used by boot() when a
     * previous cycle is still partially alive, and as the first step
     * of the public dispose() method.
     */
    _teardownRenderer() {
        window.removeEventListener('resize', this._resize);

        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }

        if (this.gui) {
            this.gui.destroy();
            this.gui = null;
        }

        if (this.renderer) {
            this.renderer.dispose();
            // PAT-9: do NOT call forceContextLoss() here. The same canvas
            // DOM element is reused by the next boot() — forcing the WebGL
            // context to die would leave the canvas in a "context lost"
            // state that Three.js can't recover from. The renderer.dispose()
            // above already releases GPU resources; forceContextLoss is
            // reserved for permanent teardown (page unload, app shutdown).
            this.renderer = null;
        }
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

        // Layer 5: update OrbitControls damping
        if (this.controls) this.controls.update();

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
        if (!this.root) return;
        this.root.add(obj);
    }

    remove(obj) {
        if (!this.root) return;
        this.root.remove(obj);
    }

    /**
     * Tear down GPU resources. Call from Phaser scene `shutdown` event.
     *
     * PAT-9: idempotent — calling dispose() on an already-disposed world
     * is a no-op (every step null-guards its target). After dispose(),
     * a subsequent boot() rebuilds the world from scratch.
     */
    dispose() {
        if (!this.renderer && !this.scene) {
            // Already disposed — no-op.
            return;
        }

        this._running = false;
        this._teardownRenderer();

        if (this.scene) {
            this.scene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose?.();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
                    else obj.material.dispose?.();
                }
            });
            this.scene.clear();
        }

        // PAT-9: null out scene/root/lights so a subsequent boot() truly
        // rebuilds them rather than reusing a half-dead graph.
        this.scene = null;
        this.root = null;
        this.lights = null;
        this.camera = null;

        console.info('[ThreeWorld] disposed');
    }

    /** Debug helper exposed via window.__three.world */
    get stats() {
        return {
            objects: this.root ? this.root.children.length : 0,
            running: this._running,
            // PAT-9: derived from renderer state. No more permanent flag.
            disposed: !this.renderer,
        };
    }
}

// Singleton — see class docstring.
export const threeWorld = new ThreeWorld();