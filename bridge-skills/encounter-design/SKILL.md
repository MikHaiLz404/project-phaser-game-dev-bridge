---
name: encounter-design
description: "Bridge skill: Design game encounters in Phaser 4. Maps encounter patterns (arena layout, wave spawning, boss fights) to Phaser scene logic and spawning systems. Use when building enemy encounters, arena fights, or wave-based gameplay."
---

# Encounter Design Bridge

> How to design encounters using MengTo patterns in Phaser 4.

**Design Source:** MengTo `design-game-encounters`
**Framework:** Phaser 4

---

## 1. Arena Setup

```js
class ArenaScene extends Phaser.Scene {
    create() {
        // Define arena bounds
        this.arenaBounds = new Phaser.Geom.Rectangle(100, 100, 600, 400);

        // Draw arena walls
        const graphics = this.add.graphics();
        graphics.lineStyle(2, 0xffffff);
        graphics.strokeRectShape(this.arenaBounds);

        // Player starts in center
        this.player.setPosition(400, 300);
    }
}
```

## 2. Wave Spawning

```js
class WaveManager {
    constructor(scene) {
        this.scene = scene;
        this.waves = [];
        this.currentWave = 0;
    }

    addWave(config) {
        this.waves.push(config);
    }

    start() {
        this.spawnWave(this.waves[0]);
    }

    spawnWave(config) {
        config.enemies.forEach((enemy, i) => {
            this.scene.time.delayedCall(i * config.delay, () => {
                const pos = this.getPosition(config.spawnPattern, i);
                this.scene.spawnEnemy(pos.x, pos.y, enemy.type);
            });
        });
    }

    getPosition(pattern, index) {
        const bounds = this.scene.arenaBounds;
        switch (pattern) {
            case 'circle':
                const angle = (index / 8) * Math.PI * 2;
                return {
                    x: bounds.centerX + Math.cos(angle) * 150,
                    y: bounds.centerY + Math.sin(angle) * 150
                };
            case 'sides':
                return index % 2 === 0
                    ? { x: bounds.left + 50, y: bounds.centerY }
                    : { x: bounds.right - 50, y: bounds.centerY };
            default:
                return { x: bounds.randomX, y: bounds.randomY };
        }
    }
}
```

## 3. Wave Config

```js
const encounterData = {
    forest_arena: {
        waves: [
            {
                enemies: [
                    { type: 'slime', count: 3 },
                    { type: 'slime', count: 2 }
                ],
                delay: 500,
                spawnPattern: 'circle'
            },
            {
                enemies: [
                    { type: 'skeleton', count: 2 },
                    { type: 'skeleton', count: 2 }
                ],
                delay: 300,
                spawnPattern: 'sides'
            },
            {
                enemies: [{ type: 'boss_dragon', count: 1 }],
                delay: 0,
                spawnPattern: 'center'
            }
        ]
    }
};
```

## 4. Objective Triggers

```js
// Trigger encounter on zone enter
this.physics.add.overlap(this.player, this.entranceZone, () => {
    if (!this.encounterActive) {
        this.startEncounter('forest_arena');
    }
});

// Complete encounter
checkEncounterComplete() {
    const alive = this.enemies.getChildren().filter(e => e.active).length;
    if (alive === 0 && this.encounterActive) {
        this.encounterActive = false;
        this.events.emit('encounter-complete');

        // Drop loot
        this.spawnLoot(this.lastEnemy.x, this.lastEnemy.y);
    }
}
```

## 5. Boss Phase Triggers

```js
// Boss enters at wave 3
spawnBoss() {
    const boss = this.spawnEnemy(400, 100, 'boss_dragon');

    boss.on('phase-change', (phase) => {
        this.cameras.main.shake(500, 0.02);
        this.events.emit('boss-phase', phase);
    });
}
```

---

## Pitfalls

1. **Spawn pattern affects difficulty** — circle is easier than random
2. **Delay between waves** — 500ms feels fair, 0ms feels relentless
3. **Always have a win condition** — check every frame if encounter is complete
4. **Boss phases need visual feedback** — camera effects, tint changes
5. **Loot should drop from last enemy** — not randomly in arena
