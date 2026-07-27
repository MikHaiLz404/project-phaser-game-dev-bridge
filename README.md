# Phaser Game Dev Bridge

**Game Design Patterns × Phaser 4 API = Playable Games**

A bridge between [MengTo/Skills](https://github.com/MengTo/Skills) game development patterns and [Phaser 4](https://github.com/phaserjs/phaser) framework API.

## What This Is

| Source | Provides |
|--------|----------|
| **MengTo Skills** | Game design patterns: combat, AI, inventory, VFX, audio, cameras |
| **Phaser Skills** | Framework API: physics, input, tweens, particles, tilemaps |
| **Bridge Skills** | Implementation mapping: "how to build X in Phaser" |

## Structure

```
project-phaser-game-dev-bridge/
├── bridge-skills/           ← 7 bridge skills (design → Phaser API)
│   ├── combat-system/
│   ├── enemy-ai/
│   ├── inventory-system/
│   ├── camera-system/
│   ├── vfx-system/
│   ├── audio-system/
│   └── game-setup/
├── arpg-template/           ← Starter Phaser 4 ARPG project
│   ├── src/
│   ├── demo/
│   └── package.json
└── playbook/                ← Combined documentation
```

## Quick Start

```bash
cd arpg-template
npm install
npm run dev
```

## Bridge Skills

Each bridge skill connects a MengTo game design pattern to Phaser 4 implementation:

### Core Systems
1. **combat-system** — Timing windows, hit detection, combos, damage
2. **enemy-ai** — State machines, aggro, telegraphs, boss phases
3. **inventory-system** — Items, equipment, stacking, save/load
4. **camera-system** — Follow, shake, zoom, cinematic, fade

### Integration
21. **threejs-overlay** — Two-Canvas Sandwich: Phaser 2D + Three.js 3D layer via independent WebGL contexts. Drop-in for img2threejs-generated factory modules (`public/models/*.js`).

### Visual & Audio
5. **vfx-system** — Performance tiers, combat effects, environmental
6. **particles** — ParticleEmitter API, sparks, trails, rain
7. **audio-system** — SFX layers, music states, spatial audio
8. **sprites-and-animations** — Spritesheets, animation playback, projectiles

### Level & World
9. **tilemaps** — Tiled integration, collision layers, spawn points
10. **encounter-design** — Arena layout, wave spawning, boss fights
11. **scenes** — Lifecycle, transitions, data passing, multi-scene

### UI & Display
12. **text-and-bitmaptext** — Dialog boxes, HUD, typewriter, score
13. **tweens** — Easing, squash/stretch, chained animations
14. **groups-and-containers** — Object pooling, UI layouts, entity mgmt
15. **scale-and-responsive** — Mobile, portrait/landscape, resize

### Data & Persistence
16. **loading-assets** — Preload, progress bars, lazy load
17. **save-load** — localStorage, save slots, settings, migration

### Ship & Quality
18. **game-setup** — Config, scenes, boot sequence, project structure
19. **optimization** — Draw calls, object pooling, mobile budgets
20. **testing** — Vitest, unit tests, smoke tests
21. **shipping** — Build, deploy, CDN, performance checklist

## Sources

- MengTo/Skills: MIT License
- Phaser: MIT License
- This bridge: MIT License
