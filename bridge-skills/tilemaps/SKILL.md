---
name: tilemaps
description: "Bridge skill: Implement tilemap-based levels in Phaser 4. Maps MengTo level design patterns (collision layers, spawn zones, landmarks) to Phaser Tilemap API with Tiled integration. Use when building platformer levels, RPG maps, or tile-based worlds."
---

# Tilemaps Bridge

> How to implement MengTo level design patterns using Phaser 4 Tilemap API.

**Design Source:** MengTo `author-game-levels`, `build-isometric-arpg`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Level Structure
- **Ground layer** — walkable terrain
- **Collision layer** — invisible walls/platforms
- **Decoration layer** — visual-only tiles (trees, rocks)
- **Object layer** — spawn points, triggers, exits

### Level Rules
- Every collision tile must have a physics body
- Spawn points defined in Tiled as object layer
- Landmarks visible from distance for navigation
- Camera bounds must match tilemap dimensions

---

## Phaser 4 Implementation

### 1. Tiled Setup (External Tool)
Export from Tiled as JSON:
```
File → Export → JSON
```
Required layers:
- `Ground` (tile layer)
- `Collision` (tile layer)
- `Decoration` (tile layer)
- `Spawns` (object layer)

### 2. Load Tilemap

```js
preload() {
    this.load.image('tiles', 'assets/tileset.png');
    this.load.tilemapTiledJSON('level1', 'assets/level1.json');
}

create() {
    const map = this.make.tilemap({ key: 'level1' });
    const tileset = map.addTilesetImage('tileset', 'tiles');

    // Create layers (order matters — back to front)
    const groundLayer = map.createLayer('Ground', tileset);
    const collisionLayer = map.createLayer('Collision', tileset);
    const decorationLayer = map.createLayer('Decoration', tileset);

    // Set collision on specific tile IDs
    collisionLayer.setCollisionByProperty({ collides: true });

    // Set world bounds to tilemap size
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
}
```

### 3. Collision Setup

```js
// Player collides with ground
this.physics.add.collider(this.player, collisionLayer);

// Enemies collide with ground
this.physics.add.collider(this.enemies, collisionLayer);

// Player can overlap with items (pickup)
this.physics.add.overlap(this.player, this.items, this.onPickup, null, this);
```

### 4. Spawn from Object Layer

```js
// Read spawn points from Tiled object layer
const spawnLayer = map.getObjectLayer('Spawns');

spawnLayer.objects.forEach(obj => {
    switch (obj.type) {
        case 'player':
            this.player.setPosition(obj.x, obj.y);
            break;
        case 'enemy':
            this.spawnEnemy(obj.x, obj.y, obj.name);
            break;
        case 'item':
            this.spawnItem(obj.x, obj.y, obj.name);
            break;
        case 'exit':
            this.createExit(obj.x, obj.y, obj.properties);
            break;
    }
});
```

### 5. Camera Follow with Tilemap Bounds

```js
const camera = this.cameras.main;
camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
camera.startFollow(this.player, true, 0.08, 0.08);
```

### 6. Tilemap Debug (Development)

```js
// Visualize collision tiles
const debugGraphics = this.add.graphics().setAlpha(0.7);
collisionLayer.renderDebug(debugGraphics, {
    tileColor: null,
    collidingTileColor: new Phaser.Display.Color(243, 134, 48, 200),
    faceColor: new Phaser.Display.Color(40, 39, 37, 255)
});
```

---

## Tilemap Properties (Tiled)

In Tiled, set custom properties on tiles:

| Property | Type | Purpose |
|----------|------|---------|
| `collides` | bool | Enable physics collision |
| `damage` | int | Damage on contact |
| `speed` | float | Speed modifier (ice, mud) |

---

## Pitfalls

1. **Always set collision by property** — not by index (fragile)
2. **Layer order matters** — ground first, decoration last
3. **Tileset image must match** — same filename in load and addTilesetImage
4. **Object layer Y is bottom-aligned** — subtract tile height for top-left
5. **Set world bounds** — or player falls through the map

---

## Related Skills

- MengTo: `author-game-levels`, `build-isometric-arpg`
- Phaser: `tilemaps`, `physics-arcade`, `cameras`
