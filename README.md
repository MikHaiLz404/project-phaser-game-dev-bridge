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
2. **enemy-ai** — State machines, aggro, telegraphs
3. **inventory-system** — Item schemas, equipment, stacking
4. **camera-system** — Follow, shake, zoom, cinematic
5. **vfx-system** — Particles, filters, performance tiers
6. **audio-system** — Spatial audio, music states, SFX layers
7. **game-setup** — Config, scenes, boot sequence

## Sources

- MengTo/Skills: MIT License
- Phaser: MIT License
- This bridge: MIT License
