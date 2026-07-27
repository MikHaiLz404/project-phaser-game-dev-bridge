---
name: optimization
description: "Bridge skill: Optimize Phaser 4 game performance. Maps performance patterns (draw calls, memory, mobile budgets) to Phaser renderer settings and profiling. Use when building performant games, reducing lag, or optimizing for mobile."
---

# Optimization Bridge

> How to optimize Phaser 4 game performance.

**Design Source:** MengTo `optimize-threejs-games`
**Framework:** Phaser 4

---

## 1. Renderer Settings

```js
const config = {
    type: Phaser.AUTO,
    pixelArt: true,        // Disable smoothing
    roundPixels: true,     // Round to integer positions
    antialias: false,      // Disable AA
    transparent: false     // No alpha compositing
};
```

## 2. Object Pooling

```js
// Bad: create/destroy
spawnBullet() {
    const b = this.add.sprite(x, y, 'bullet');
    this.time.delayedCall(2000, () => b.destroy());
}

// Good: pool
this.bullets = this.physics.add.group({
    maxSize: 50,
    runChildUpdate: false
});

spawnBullet() {
    const b = this.bullets.get(x, y, 'bullet');
    if (!b) return;
    b.setActive(true).setVisible(true);
}
```

## 3. Camera Optimization

```js
// Only render visible area
camera.setBounds(0, 0, mapWidth, mapHeight);

// Cull off-screen objects
this.physics.world.on('worldbounds', (body) => {
    body.gameObject.setActive(false).setVisible(false);
});
```

## 4. Reduce Draw Calls

```js
// Bad: many small sprites
for (let i = 0; i < 100; i++) {
    this.add.sprite(x + i * 10, y, 'particle');
}

// Good: use particle emitter
this.add.particles(x, y, 'particle', {
    quantity: 100,
    lifespan: 1000
});
```

## 5. Texture Atlas

```js
// Bad: many individual images
this.load.image('player', 'assets/player.png');
this.load.image('enemy', 'assets/enemy.png');
this.load.image('bullet', 'assets/bullet.png');

// Good: single atlas
this.load.atlas('sprites', 'assets/sprites.png', 'assets/sprites.json');
```

## 6. Profiling

```js
// Log FPS
this.time.addEvent({
    delay: 1000,
    callback: () => {
        console.log('FPS:', this.game.loop.actualFps);
    },
    loop: true
});

// Check texture memory
console.log(this.textures.getTextureKeys());
```

## 7. Mobile Budgets

| Metric | Budget |
|--------|--------|
| Draw calls | < 50 |
| Active sprites | < 200 |
| Texture memory | < 128MB |
| FPS target | 60 (30 minimum) |

---

## Pitfalls

1. **Object pooling saves memory** — never create/destroy in game loop
2. **Texture atlas reduces draw calls** — one texture = one draw call
3. **Round pixels for pixel art** — prevents sub-pixel jitter
4. **Kill off-screen objects** — don't render what you can't see
5. **Profile on target device** — desktop FPS != mobile FPS
