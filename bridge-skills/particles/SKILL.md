---
name: particles
description: "Bridge skill: Implement particle effects in Phaser 4. Maps game VFX patterns (combat sparks, environmental effects, trails) to Phaser ParticleEmitter. Use when building hit effects, ambient particles, trails, or any particle-based visual feedback."
---

# Particles Bridge

> How to implement game VFX patterns using Phaser 4 ParticleEmitter API.

**Design Source:** MengTo `create-game-vfx`
**Framework:** Phaser 4

---

## Emitter Config Reference

```js
const emitter = this.add.particles(x, y, texture, {
    // Emission
    speed: { min: 100, max: 200 },
    angle: { min: 0, max: 360 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 500,
    frequency: 50,           // ms between emissions (-1 = burst only)
    quantity: 1,             // particles per emission
    emitting: true,          // auto-emit

    // Physics
    gravityY: 300,
    gravityX: 0,
    accelerationX: 0,
    accelerationY: 0,

    // Visual
    tint: [0xff0000, 0xff8800, 0xffff00],
    blendMode: 'ADD',
    rotate: { min: 0, max: 360 },

    // Shape
    emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, 50)
    }
});
```

---

## Common Effects

### 1. Hit Sparks
```js
const sparks = this.add.particles(0, 0, 'spark', {
    speed: { min: 100, max: 250 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.8, end: 0 },
    lifespan: 300,
    gravityY: 400,
    emitting: false,
    tint: [0xffff00, 0xff8800, 0xffffff]
});

// Usage
sparks.emitParticleAt(hitX, hitY, 8);
```

### 2. Blood/Hit Red
```js
const blood = this.add.particles(0, 0, 'particle', {
    speed: { min: 50, max: 150 },
    angle: { min: 200, max: 340 },
    scale: { start: 0.5, end: 0 },
    lifespan: 400,
    gravityY: 300,
    emitting: false,
    tint: 0xff0000
});
```

### 3. Dust Trail (Running)
```js
const dust = this.add.particles(0, 0, 'dust', {
    speed: { min: 10, max: 30 },
    angle: { min: 80, max: 100 },
    scale: { start: 0.4, end: 0 },
    alpha: { start: 0.6, end: 0 },
    lifespan: 500,
    frequency: 80,
    follow: this.player,
    followOffset: { x: 0, y: 16 }
});
```

### 4. Rain
```js
const rain = this.add.particles(0, 0, 'raindrop', {
    x: { min: 0, max: this.cameras.main.width },
    y: -10,
    speedY: { min: 400, max: 600 },
    speedX: { min: -50, max: -20 },
    scale: { min: 0.3, max: 0.5 },
    alpha: { min: 0.3, max: 0.6 },
    lifespan: 2000,
    frequency: 20,
    quantity: 2
});
```

### 5. Level Up Burst
```js
levelUpEffect(x, y) {
    const burst = this.add.particles(x, y, 'star', {
        speed: { min: 100, max: 300 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        lifespan: 800,
        gravityY: -100,
        emitting: false,
        tint: [0xffff00, 0xffffff]
    });

    burst.explode(20);
    this.time.delayedCall(1000, () => burst.destroy());
}
```

### 6. Death Explosion
```js
deathEffect(x, y) {
    // Inner burst
    const inner = this.add.particles(x, y, 'particle', {
        speed: { min: 50, max: 150 },
        scale: { start: 0.6, end: 0 },
        lifespan: 400,
        emitting: false,
        tint: 0xff4444
    });
    inner.explode(12);

    // Outer ring
    const outer = this.add.particles(x, y, 'particle', {
        speed: { min: 150, max: 250 },
        scale: { start: 0.3, end: 0 },
        lifespan: 600,
        emitting: false,
        tint: 0xffaa00,
        blendMode: 'ADD'
    });
    outer.explode(8);

    this.time.delayedCall(1000, () => { inner.destroy(); outer.destroy(); });
}
```

---

## Performance Tiers

```js
class ParticleManager {
    constructor(scene) {
        this.scene = scene;
        this.tier = this.detectTier();
    }

    detectTier() {
        if (this.scene.game.renderer.type === Phaser.CANVAS) return 'low';
        return 'medium';
    }

    create(config) {
        if (this.tier === 'low') {
            config.quantity = Math.max(1, Math.floor(config.quantity * 0.3));
            config.frequency = (config.frequency || 50) * 3;
            config.lifespan = (config.lifespan || 500) * 0.5;
        }
        return this.scene.add.particles(config.x || 0, config.y || 0, config.texture, config);
    }
}
```

---

## Pitfalls

1. **Always set `emitting: false`** for burst effects — or they never stop
2. **Destroy unused emitters** — they consume memory even when not visible
3. **Use `emitParticleAt()`** for one-shots — not `setPosition()` + `start()`
4. **Tint array** must be valid hex numbers — not strings
5. **Frequency of -1** = burst only, no auto-emission
6. **`follow` property** auto-moves emitter — don't update position manually

---

## Related Skills

- MengTo: `create-game-vfx`
- Phaser: `particles`, `filters-and-postfx`, `render-textures')
