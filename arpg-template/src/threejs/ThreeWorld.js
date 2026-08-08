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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';

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
        /** @type {OrbitControls|null} */
        this.controls = null;
        /** @type {{ ambient: THREE.AmbientLight, sun: THREE.DirectionalLight, fill: THREE.DirectionalLight, rim: THREE.DirectionalLight, point: THREE.PointLight } | null} */
        this.lights = null;
        /** @type {GUI|null} */
        this.gui = null;

        // Layer 1: Background (deep navy blue)
        this.scene.background = new THREE.Color(0x1a3a8a);

        // Layer 1: Lighting — improved 3-point rig with warm key + cool fill + rim
        // Soft ambient so shadows aren't pitch-black
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambient);

        // Key light — warm sun, casts shadows
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
        this.scene.add(sun);

        // Fill light — cool blue from opposite side (softens shadows)
        const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
        fill.position.set(-5, 3, -2);
        this.scene.add(fill);

        // Rim light — bright cool backlight to separate objects from background
        const rim = new THREE.DirectionalLight(0xccddff, 0.7);
        rim.position.set(0, 4, -8);
        this.scene.add(rim);

        // Studio lighting: 3-point rig (key + fill + rim) + hemisphere for daytime.
        // No point lights — those are for game-world mood, not a controlled product showcase.

        // Hemisphere — sky/ground tinting for a bright daytime outdoor feel.
        const hemi = new THREE.HemisphereLight(0xb8d8ff, 0x4a3a2a, 0.6);
        this.scene.add(hemi);

        this.lights = { ambient, sun, fill, rim, hemi };

        // Enable shadow rendering will happen after WebGLRenderer is created in boot()

        // Layer 2: Ground plane — sits at y = -1, receives shadows
        // 100×100 (was 50×50) to fit village (±22) + forest (z: -25..-65)
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a3a,
            roughness: 0.9,
            metalness: 0.1,
        });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -1;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Layer 2: Grid helper — 25×25 cells for spatial reference
        this.grid = new THREE.GridHelper(100, 50, 0x4a5a8a, 0x2a3a6a);
        this.grid.position.y = -0.99;
        this.scene.add(this.grid);

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
            preserveDrawingBuffer: true,  // Phase 1: keep buffer for debugging visibility
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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