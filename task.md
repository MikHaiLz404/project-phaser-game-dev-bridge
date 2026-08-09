# 📋 POC Roadmap: ARPG with Phaser

## Sprint 1: The Core Loop (Foundation)
- [x] **1. Architecture Setup**
  - [x] Initialize `CombatTestScene.js` in `src/scenes/`
  - [x] Link `bridge-skills/combat-system` and `bridge-skills/enemy-ai` to the template
  - [x] Verify basic scene loading and asset preloading
- [x] **2. Player Controller**
  - [x] Implement WASD movement with physics-based velocity
  - [x] Implement Camera follow (Smooth lerp)
  - [x] Add basic collision detection with tilemaps
- [x] **3. Combat Core (The Proof)**
  - [x] Create Player Attack action (with Startup/Active/Recovery windows)
  - [x] Implement Hitbox logic & Overlap detection
  - [x] Add Hitstop (Freeze frames) and Knockback effects
  - [x] Implement Damage system (Health subtraction & Tint/Alpha flash)
- [x] **4. Enemy & Data System**
  - [x] Load and validate enemy data from the canonical `src/data/enemies.json`
  - [x] Implement basic Enemy AI State Machine (Idle, Chase, Attack)
  - [x] Create 1 Test Enemy type
- [x] **5. Item & Inventory Data System**
  - [x] Load and validate item data from the canonical `src/data/items.json`
  - [x] Implement add/remove with atomic capacity checks and schema-defined stacking
  - [x] Implement equipment swap/unequip and derived equipment stats
  - [x] Verify schema, inventory, and live CombatTest data consumption with Node + browser regressions
- [ ] **6. Game Juice & Polish**
  - [ ] Integrate basic VFX (Hit sparks, dust)
  - [ ] Integrate basic Audio (Swing, Hit, Footstep sounds)
  - [ ] Final POC Playtest
- [x] **7. 3D Background Layer (Two-Canvas Sandwich)**
  - [x] Add `three@^0.169.0` dependency
  - [x] `src/threejs/ThreeWorld.js` — singleton WebGLRenderer + camera + lights
  - [x] `src/threejs/ThreeBridge.js` — Phaser↔Three event bus
  - [x] `src/threejs/ModelLoader.js` — async loader for img2threejs-generated factories
  - [x] `src/scenes/ThreeOverlayScene.js` — Phaser scene driving the 3D layer
  - [x] `public/models/createDemoPropModel.js` — placeholder factory matching img2threejs contract
  - [x] Update `index.html` — two stacked canvases (Phaser + Three.js), debug overlay
  - [x] `GameScene` launches `ThreeOverlayScene` in parallel with `UIScene`
  - [x] `bridge-skills/threejs-overlay/SKILL.md` — knowledge transfer
  - [x] `npm run build` succeeds; `npm run dev` serves the new layer

  --
  *Status: Two-Canvas Sandwich skeleton shipped (2026-07-27)*
  *Status: PAT-15 runtime data + inventory implementation verified (2026-08-09)*
  *Next: replace placeholder with a real img2threejs output (CS2 knife or any object)*
