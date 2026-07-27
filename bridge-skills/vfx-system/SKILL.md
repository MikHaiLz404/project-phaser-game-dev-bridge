---
name: vfx-system
description: "Bridge skill: Implement game VFX in Phaser 4. Maps MengTo VFX patterns (particles, shaders, performance tiers) to Phaser ParticleEmitter, Filters, and RenderTexture. Use when building combat effects, environmental particles, or visual feedback."
---

# VFX System Bridge

> How to implement MengTo VFX patterns using Phaser 4 API.

**Design Source:** MengTo `create-game-vfx`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Performance Tiers
- **High:** Full particles, post-processing, dynamic lights
- **Medium:** Reduced particles, no post-processing
- **Low:** Minimal particles, no shaders, static fallbacks

### Effect Categories
- **Combat:** Hit sparks, slash trails, damage numbers
- **Environmental:** Rain, snow, dust, leaves
- **UI:** Button press, level up, achievement unlock

---

## Phaser 4 Implementation

### 1. Hit Sparks (Combat VFX)

```js
createHitSparks() {
    this.hitSparkEmitter = this.add.particles(0, 0, 'spark', {
        speed: { min: 100, max: 200 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        lifespan: 300,
        gravityY: 300,
        emitting: false,
        quantity: 8,
        tint: [0xffff00, 0xff8800, 0xffffff]
    });
}

emitHitSparks(x, y) {
    this.hitSparkEmitter.emitParticleAt(x, y, 8);
}
```

### 2. Slash Trail

```js
createSlashTrail() {
    // Use graphics for dynamic trail
    this.slashGraphics = this.add.graphics();
    this.slashPoints = [];
}

updateSlashTrail(x, y) {
    this.slashPoints.push({ x, y, alpha: 1 });
    if (this.slashPoints.length > 20) {
        this.slashPoints.shift();
    }

    this.slashGraphics.clear();
    this.slashGraphics.lineStyle(4, 0xffffff);

    for (let i = 1; i < this.slashPoints.length; i++) {
        const p = this.slashPoints[i];
        const prev = this.slashPoints[i - 1];
        this.slashGraphics.lineBetween(prev.x, prev.y, p.x, p.y);
    }

    // Fade out
    this.slashPoints.forEach(p => p.alpha -= 0.05);
    this.slashPoints = this.slashPoints.filter(p => p.alpha > 0);
}
```

### 3. Damage Numbers

```js
showDamage(x, y, damage, isCritical = false) {
    const color = isCritical ? 0xff0000 : 0xffffff;
    const size = isCritical ? '24px' : '16px';

    const text = this.add.text(x, y, `-${damage}`, {
        fontSize: size,
        fontFamily: 'Arial',
        color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 2
    });

    this.tweens.add({
        targets: text,
        y: y - 50,
        alpha: 0,
        duration: 800,
        ease: 'power2.out',
        onComplete: () => text.destroy()
    });
}
```

### 4. Environmental Particles

```js
createRain() {
    this.rainEmitter = this.add.particles(0, 0, 'raindrop', {
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
}

createDust() {
    this.dustEmitter = this.add.particles(0, 0, 'dust', {
        x: { min: 0, max: this.cameras.main.width },
        y: { min: 0, max: this.cameras.main.height },
        speedX: { min: -20, max: 20 },
        speedY: { min: -10, max: 10 },
        scale: { min: 0.1, max: 0.3 },
        alpha: { min: 0.1, max: 0.3 },
        lifespan: 5000,
        frequency: 100
    });
}
```

### 5. Performance Tier System

```js
class VFXManager {
    constructor(scene) {
        this.scene = scene;
        this.tier = this.detectTier();
    }

    detectTier() {
        const gl = this.scene.game.renderer;
        if (gl.type === Phaser.CANVAS) return 'low';
        // Check FPS or device
        return 'medium';
    }

    createParticles(config) {
        if (this.tier === 'low') {
            config.maxParticles = Math.floor(config.maxParticles * 0.3);
            config.frequency = config.frequency * 3;
        } else if (this.tier === 'medium') {
            config.maxParticles = Math.floor(config.maxParticles * 0.6);
        }
        return this.scene.add.particles(0, 0, config.texture, config);
    }
}
```

---

## Pitfalls

1. **Always set `emitting: false`** for one-shot effects — prevents memory leaks
2. **Reuse particle emitters** — don't create new ones per effect
3. **Performance tier must be checked** before creating heavy effects
4. **Damage numbers must be destroyed** — use tween onComplete
5. **Slash trail needs cleanup** — clear graphics when not in use

---

## Related Skills

- MengTo: `create-game-vfx`, `build-hybrid-game-assets`
- Phaser: `particles`, `filters-and-postfx`, `render-textures`
