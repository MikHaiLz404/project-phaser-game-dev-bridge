---
name: threejs-overlay
description: Use when adding a Three.js 3D background layer to a Phaser game via the Two-Canvas Sandwich pattern. Covers ThreeWorld bootstrap, ThreeBridge event bus, ModelLoader for img2threejs-generated factories, and Phaser↔Three lifecycle wiring.
version: 1.0.0
updated: 2026-07-27
tags: [phaser, threejs, bridge-skill, 2d-3d-hybrid, architecture, webgl]
---

# Three.js Overlay — Two-Canvas Sandwich for Phaser

**Use when:** you have a working Phaser 2D game and need a Three.js 3D layer
(background world, hero prop, weapon showcase) that coexists with Phaser's
scene, physics, input, and UI systems.

**Why this pattern:** Phaser is a 2D engine and Three.js is a 3D library.
Forcing Three.js into Phaser's scene graph fights both libraries. Running
them as two independent WebGL contexts stacked with CSS is cleaner, well
understood, and ships today without depending on experimental forks.

**Companion modules** (all in `src/threejs/` of the bridge-Three template):

| Module | Role |
|---|---|
| `ThreeWorld.js` | Singleton `WebGLRenderer` + scene + camera + lights bound to `<canvas id="three-canvas">` |
| `ThreeBridge.js` | Pub/sub event bus between Phaser and Three.js layers |
| `ModelLoader.js` | Async loader for img2threejs-generated factory modules |
| `ModelLoader.js` → `public/models/*.js` | Drop-in factory files produced by `forge/stage3_build/generate_threejs_factory.py` |

---

## The contract (one file each, then you're done)

### 1. `index.html` — two stacked canvases

```html
<div id="game-container"></div>     <!-- Phaser attaches its canvas here -->
<canvas id="three-canvas"></canvas>  <!-- Three.js renders into this one -->
```

CSS sets z-index stacking: Three.js canvas at `z: 0`, Phaser canvas at
`z: 1`. Phaser canvas gets `pointer-events: auto` (input). Three.js
canvas gets `pointer-events: none` so Phaser keeps all click/touch.

### 2. `src/threejs/ThreeWorld.js` — the 3D layer singleton

Exports a singleton `threeWorld` with `boot(canvas)`, `update(dt)`,
`add(obj)`, `remove(obj)`, `dispose()`. Idempotent. Owns one
`WebGLRenderer`, one `Scene`, one `PerspectiveCamera`, and a `Group` root
for all loaded models. `update()` is called from Phaser's `update()` —
Phaser passes delta in **milliseconds**, Three.js wants seconds.

### 3. `src/threejs/ThreeBridge.js` — event topics

Topics used by the bridge:

| Topic | Direction | Payload |
|---|---|---|
| `model-loaded` | 3D → Phaser | `{ url, group, took }` |
| `model-load-fail` | 3D → Phaser | `{ url, error }` |
| `pick-result` | 3D → Phaser | `{ ray, hits }` (raycast hits) |
| `camera-sync` | Phaser → 3D | `{ x, y, zoom }` (camera follow) |
| `pause-3d` / `resume-3d` | Phaser → 3D | (none) |

Use `ThreeBridge.on(topic, fn)` to subscribe; returns an unsubscribe
handle. Use `ThreeBridge.emit(topic, payload)` to publish. Topics with
`*` match everything (debug use only).

### 4. `src/threejs/ModelLoader.js` — img2threejs bridge

```javascript
import { loadModel } from './threejs/ModelLoader.js';
const group = await loadModel('/models/createDemoPropModel.js', spec, options);
// group is THREE.Group, ready to add to the world or your scene
```

Factories that import npm packages such as `three` must live under
`src/threejs/models/` and be registered in `BUNDLED_MODEL_IMPORTERS` so Vite
can transform and bundle them. Do not place a bare-import factory under
`public/`; public modules are served raw and browsers cannot resolve the bare
`three` specifier. The dynamic URL fallback is only for modules that are
already browser-loadable.

The factory contract (matches img2threejs v1.4 output):

```javascript
// src/threejs/models/createDemoPropModel.js
export default function createDemoPropModel(spec, options) {
    const group = new THREE.Group();
    // ... build geometry, materials, pivots ...
    if (spec.position) group.position.set(spec.position.x, spec.position.y, spec.position.z);
    return group;
}
```

ModelLoader maps stable logical URLs to Vite-analyzable bundled importers,
caches successful loads, dedupes concurrent requests for the same URL, and
emits `model-load-fail` on ThreeBridge when a factory returns non-Object3D or
the module is missing.

### 5. `src/scenes/ThreeOverlayScene.js` — the Phaser scene that drives the 3D layer

This is a normal Phaser `Scene` whose only job is to:

1. On `create()`: boot ThreeWorld against `#three-canvas`, subscribe to
   model-load events, load the boot model from `init.data.modelUrl`.
2. On `update()`: call `threeWorld.update(delta)`.
3. On `shutdown`: dispose ThreeWorld (releases WebGL context).

Launch it from anywhere: `this.scene.launch('ThreeOverlayScene', { modelUrl: '/models/foo.js' })`.
Pause/resume via `this.scene.pause('ThreeOverlayScene')`.

### 6. `src/main.js` — register the scene

```javascript
import { ThreeOverlayScene } from './scenes/ThreeOverlayScene.js';

const config = {
    parent: 'game-container',
    transparent: true,
    // ... phaser config ...
    scene: [BootScene, PreloadScene, ThreeOverlayScene, GameScene, ...],
};
```

Set `transparent: true` so the Phaser canvas lets the Three.js canvas
show through where Phaser is empty.

---

## When to use this (and when NOT to)

**Use when:**
- 2D game with a 3D hero asset, 3D background, or 3D prop showcase
- Phaser physics/tilemap/audio/scenes + Three.js render
- You want to ship today without depending on experimental forks

**Skip when:**
- Game is fully 3D → just use Three.js + your own scene loop
- Game is fully 2D → no Three.js, no extra context
- You want Phaser scene-graph integration → use `phas3d` (experimental,
  not production-ready as of 2026-07)

---

## Pitfalls

- **Two WebGL contexts**: Phaser 4 and Three.js each create their own.
  This is fine for GPU on any laptop/phone built after 2018. Don't try
  to share a context (it leads to state-leak bugs).
- **Pointer-events CSS**: Get this wrong and clicks fall through to the
  wrong canvas. Three.js canvas MUST be `pointer-events: none`.
- **Asset loading timing**: img2threejs emits TypeScript. Compile to JS
  before placing in `public/models/`. Vite handles the rest.
- **Camera sync**: 2D and 3D cameras are independent. Drive 3D camera
  from Phaser camera via `ThreeBridge.emit('camera-sync', {...})` in
  Phaser's `update()`. Don't try to share a camera object.
- **Pause/resume**: `scene.pause('ThreeOverlayScene')` stops the
  Three.js render. Don't call `threeWorld.dispose()` from pause — only
  from `shutdown` (full scene stop).
- **First-frame flash**: Set `transparent: true` in Phaser config and
  set the Three.js scene background to your game's base color so the
  first frame doesn't show through to black.
- **Bundle size**: Three.js is ~600 KB minified. If size matters, use
  `three/build/three.module.min.js` via Vite (already the default) and
  consider code-splitting Three.js into its own chunk with
  `manualChunks`.

---

## Verify checklist

- [ ] `#three-canvas` element exists in `index.html`
- [ ] `npm install three` — three appears in `dependencies`
- [ ] `npm run build` succeeds, no missing-import errors
- [ ] `npm run dev` → `curl http://localhost:5173/` returns 200 with
      the new `<canvas id="three-canvas">` markup
- [ ] Browser console: no "ThreeWorld boot: #three-canvas not found" errors
- [ ] `?debug=1` shows debug overlay with non-zero Three objects
- [ ] Pause/resume: open menu, Three.js stops; close menu, Three.js resumes

---

## Reference

- Working example: `/Users/jojo/Github/project-phaser-game-dev-bridge/arpg-template/`
  (Pattern A implemented in `src/threejs/`, `src/scenes/ThreeOverlayScene.js`)
- img2threejs factory contract: `~/GitHub/img2threejs/SKILL.md` step 6
- Phaser 4 docs: https://phaser.io
- Phaser 4 experimental 3D (phas3d): https://github.com/phaserjs/phas3d
  — alternative for fully-3D games; NOT used in this pattern
- Inspired by gamefromscratch "Mixing 2D and 3D Graphics using Phaser
  and Three.js" (CanvasTexture pattern, which this skill replaces)