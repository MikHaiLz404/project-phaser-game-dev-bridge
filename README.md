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

1. **combat-system** — Timing windows, hit detection, damage
2. **enemy-ai** — State machines, aggro, telegraphs, boss phases
3. **inventory-system** — Item schemas, equipment, stacking, save/load
4. **camera-system** — Follow, shake, zoom, cinematic, fade
5. **vfx-system** — Performance tiers, combat effects, environmental
6. **particles** — ParticleEmitter API, hit sparks, trails, rain
7. **audio-system** — SFX layers, music states, spatial audio
8. **tilemaps** — Tiled integration, collision layers, spawn points
9. **tweens** — Easing, squash/stretch, chained animations, UI transitions
10. **groups-and-containers** — Object pooling, UI layouts, entity management
11. **text-and-bitmaptext** — Dialog boxes, HUD, typewriter, score display
12. **game-setup** — Config, scenes, boot sequence, project structure

## Sources

- MengTo/Skills: MIT License
- Phaser: MIT License
- This bridge: MIT License
