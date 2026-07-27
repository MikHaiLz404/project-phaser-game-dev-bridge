---
name: groups-and-containers
description: "Bridge skill: Organize game objects in Phaser 4. Maps entity management patterns (enemy waves, bullet pools, UI layouts) to Phaser Group and Container API. Use when managing multiple similar objects, object pooling, or UI element grouping."
---

# Groups & Containers Bridge

> How to manage game objects using Phaser 4 Group and Container API.

**Design Source:** MengTo `design-game-encounters`, `build-game-inventory`
**Framework:** Phaser 4

---

## Group vs Container

| Feature | Group | Container |
|---------|-------|-----------|
| Physics bodies | Yes | No (children have own) |
| Object pooling | Yes | No |
| Visual nesting | No | Yes |
| Transform inheritance | No | Yes |
| getChildren() | Yes | Yes |
| setDepth() | Per-child | All children |

**Rule:** Group for gameplay objects (enemies, bullets). Container for UI layouts (menus, HUD panels).

---

## Groups

### 1. Basic Group

```js
this.enemies = this.physics.add.group();
this.enemies.create(400, 300, 'slime');
```

### 2. Static Group (Platforms)

```js
this.platforms = this.physics.add.staticGroup();
this.platforms.create(400, 568, 'ground').setScale(2).refreshBody();

// Important: refreshBody() after scale/position change
```

### 3. Group Config

```js
this.bullets = this.physics.add.group({
    classType: Bullet,           // custom class
    maxSize: 20,                 // object pool limit
    runChildUpdate: true,        // call update() on each child
    createCallback: (bullet) => {
        bullet.setTint(0xffff00);
    }
});
```

### 4. Object Pooling

```js
// Spawn from pool (reuses dead objects)
spawnBullet(x, y, direction) {
    const bullet = this.bullets.get(x, y, 'bullet');
    if (!bullet) return; // pool exhausted

    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setVelocityX(direction * 400);

    // Auto-deactivate when off screen
    this.time.delayedCall(3000, () => {
        this.deactivateBullet(bullet);
    });
}

deactivateBullet(bullet) {
    bullet.setActive(false);
    bullet.setVisible(false);
    bullet.body.stop();
    bullet.body.reset(-100, -100);
}
```

### 5. Group Operations

```js
// Iterate all active
this.enemies.getChildren().forEach(enemy => {
    if (enemy.active) enemy.update();
});

// Kill all
this.enemies.getChildren().forEach(enemy => enemy.destroy());

// Count active
const alive = this.enemies.getChildren().filter(e => e.active).length;

// Group + Collider
this.physics.add.collider(this.player, this.enemies, onHit, null, this);
```

### 6. Create Multiple

```js
// Create N sprites in a line
this.enemies.createMultiple({
    key: 'slime',
    repeat: 5,
    setXY: { x: 100, y: 300, stepX: 80 }
});

// Create from config array
const enemySpawns = [
    { type: 'slime', x: 200, y: 300 },
    { type: 'skeleton', x: 400, y: 300 }
];
enemySpawns.forEach(s => this.enemies.create(s.x, s.y, s.type));
```

### 7. Group Filters

```js
// Get only active enemies
const alive = this.enemies.getChildren().filter(e => e.active);

// Find nearest
let nearest = null;
let minDist = Infinity;
this.enemies.getChildren().forEach(e => {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
    if (dist < minDist) { minDist = dist; nearest = e; }
});

// Kill by property
this.enemies.getChildren()
    .filter(e => e.active && e.type === 'slime')
    .forEach(e => e.destroy());
```

---

## Containers

### 1. UI Panel

```js
const panel = this.add.container(400, 300);
const bg = this.add.rectangle(0, 0, 200, 150, 0x222222, 0.8);
bg.setStrokeStyle(2, 0xffffff);
const title = this.add.text(0, -50, 'Menu', {
    fontSize: '18px', color: '#ffffff'
}).setOrigin(0.5);
panel.add([bg, title]);
```

### 2. Inventory Grid

```js
createInventoryGrid(x, y, cols, rows) {
    const container = this.add.container(x, y);
    const cellSize = 40;
    const padding = 4;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cell = this.add.rectangle(
                col * (cellSize + padding),
                row * (cellSize + padding),
                cellSize, cellSize, 0x333333
            );
            cell.setStrokeStyle(1, 0x666666);
            container.add(cell);
        }
    }
    return container;
}
```

### 3. Damage Numbers Container

```js
class DamageNumbers {
    constructor(scene) {
        this.scene = scene;
        this.container = scene.add.container(0, 0).setDepth(1000);
    }

    show(x, y, damage, isCritical = false) {
        const text = this.scene.add.text(x, y, `-${damage}`, {
            fontSize: isCritical ? '20px' : '14px',
            color: isCritical ? '#ff0000' : '#ffff00',
            stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5);

        this.container.add(text);

        this.scene.tweens.add({
            targets: text, y: y - 40, alpha: 0,
            duration: 800,
            onComplete: () => { this.container.remove(text); text.destroy(); }
        });
    }
}
```

### 4. Container Show/Hide

```js
// Toggle container visibility
this.menuContainer.setVisible(!this.menuContainer.visible);

// Animate in
this.menuContainer.setScale(0);
this.tweens.add({
    targets: this.menuContainer,
    scaleX: 1, scaleY: 1,
    duration: 300,
    ease: 'Back.easeOut'
});
```

---

## Pitfalls

1. **Group for physics, Container for visuals** — never mix
2. **StaticGroup needs `refreshBody()`** after scale/position change
3. **Object pool: always check `active`** before using `get()`
4. **Destroy children before container** — or memory leak
5. **Container children don't inherit physics** — each has its own body
6. **`getChildren()` returns all** — filter by `.active` when needed
7. **`runChildUpdate: true`** — only if your children have `update()` method
8. **Group maxSize** — `get()` returns null when pool is empty
