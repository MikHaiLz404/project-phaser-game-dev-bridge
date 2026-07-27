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

**Rule:** Group for gameplay objects. Container for UI layouts.

---

## Groups

### Basic Group
```js
this.enemies = this.physics.add.group();
this.enemies.create(400, 300, 'slime');
```

### Static Group (Platforms)
```js
this.platforms = this.physics.add.staticGroup();
this.platforms.create(400, 568, 'ground').setScale(2).refreshBody();
```

### Object Pooling
```js
spawnBullet(x, y, dir) {
    const b = this.bullets.get(x, y, 'bullet');
    if (!b) return;
    b.setActive(true).setVisible(true);
    b.setVelocityX(dir * 400);
    this.time.delayedCall(3000, () => {
        b.setActive(false).setVisible(false);
        b.body.reset(-100, -100);
    });
}
```

### Group Operations
```js
this.enemies.getChildren().forEach(e => { if (e.active) e.update(); });
this.physics.add.collider(this.player, this.enemies, onHit, null, this);
```

---

## Containers

### UI Panel
```js
const panel = this.add.container(400, 300);
const bg = this.add.rectangle(0, 0, 200, 150, 0x222222, 0.8);
const title = this.add.text(0, -50, 'Menu', { fontSize: '18px', color: '#fff' }).setOrigin(0.5);
panel.add([bg, title]);
```

### Inventory Grid
```js
const grid = this.add.container(x, y);
for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
        const cell = this.add.rectangle(c*44, r*44, 40, 40, 0x333333);
        cell.setStrokeStyle(1, 0x666666);
        grid.add(cell);
    }
}
```

---

## Pitfalls

1. Group for physics, Container for visuals -- never mix
2. StaticGroup needs refreshBody() after scale/position change
3. Object pool: always check active before using get()
4. Destroy children before container
