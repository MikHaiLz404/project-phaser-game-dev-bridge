---
name: game-setup
description: "Bridge skill: Set up a Phaser 4 game project with MengTo design defaults. Maps MengTo game architecture patterns to Phaser 4 GameConfig, Scene structure, and boot sequence. Use when starting a new Phaser 4 game or configuring project structure."
---

# Game Setup Bridge

> How to set up a Phaser 4 project with MengTo design defaults.

**Design Source:** MengTo `ship-web-games`, `test-playable-web-games`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Project Structure
```
src/
├── scenes/          ← Scene classes
├── systems/         ← Game logic (combat, AI, inventory)
├── entities/        ← Player, enemies, NPCs
├── data/            ← JSON configs (items, enemies, levels)
├── ui/              ← HUD, menus
└── utils/           ← Helpers
```

### Boot Sequence
1. Preload essential assets (logo, loading bar)
2. Show loading screen
3. Load all game assets
4. Start main game scene

---

## Phaser 4 Implementation

### 1. GameConfig

```js
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, PreloadScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);
```

### 2. Boot Scene

```js
class BootScene extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    preload() {
        // Load loading bar assets
        this.load.image('logo', 'assets/logo.png');
    }

    create() {
        // Set up loading bar
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Progress events
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0x00ff00, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        // Start loading game assets
        this.scene.start('Preload');
    }
}
```

### 3. Preload Scene

```js
class PreloadScene extends Phaser.Scene {
    constructor() {
        super('Preload');
    }

    preload() {
        // Player
        this.load.spritesheet('player', 'assets/player.png', {
            frameWidth: 32, frameHeight: 48
        });

        // Enemies
        this.load.spritesheet('slime', 'assets/slime.png', {
            frameWidth: 32, frameHeight: 32
        });

        // Tilemap
        this.load.image('tiles', 'assets/tileset.png');
        this.load.tilemapTiledJSON('level1', 'assets/level1.json');

        // Audio
        this.load.audio('bgm-forest', 'assets/audio/bgm-forest.ogg');
        this.load.audio('sfx-hit', 'assets/audio/sfx-hit.wav');

        // Data
        this.load.json('items', 'data/items.json');
        this.load.json('enemies', 'data/enemies.json');
    }

    create() {
        this.scene.start('Game');
    }
}
```

### 4. Game Scene

```js
class GameScene extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    create() {
        // Tilemap
        const map = this.make.tilemap({ key: 'level1' });
        const tileset = map.addTilesetImage('tileset', 'tiles');
        const groundLayer = map.createLayer('Ground', tileset);
        const collisionLayer = map.createLayer('Collision', tileset);

        // Player
        this.player = this.physics.add.sprite(100, 300, 'player');
        this.player.setCollideWorldBounds(true);

        // Enemies
        this.enemies = this.physics.add.group();
        this.spawnEnemy(400, 300, 'slime');

        // Collisions
        this.physics.add.collider(this.player, collisionLayer);
        this.physics.add.collider(this.enemies, collisionLayer);

        // Camera
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();

        // Systems
        this.combatSystem = new CombatSystem(this);
        this.inventoryManager = new InventoryManager(this);
    }

    update(time, delta) {
        // Player movement
        this.player.setVelocityX(0);
        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-160);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(160);
        }

        if (this.cursors.up.isDown && this.player.body.blocked.down) {
            this.player.setVelocityY(-330);
        }

        // Update enemies
        this.enemies.getChildren().forEach(enemy => {
            enemy.update(time, delta, this.player);
        });
    }

    spawnEnemy(x, y, type) {
        const enemyData = this.cache.json.get('enemies')[type];
        const enemy = new Enemy(this, x, y, type, enemyData);
        this.enemies.add(enemy);
        return enemy;
    }
}
```

---

## Project Checklist

- [ ] Set up `package.json` with Phaser 4
- [ ] Create folder structure (scenes, systems, entities, data)
- [ ] Configure GameConfig (physics, scale, scenes)
- [ ] Create BootScene with loading bar
- [ ] Create PreloadScene for asset loading
- [ ] Create GameScene with basic setup
- [ ] Add player movement
- [ ] Add enemy spawning
- [ ] Add camera follow
- [ ] Add collision detection

---

## Pitfalls

1. **Always use `pixelArt: true`** for sprite games — prevents blurry sprites
2. **Set `scale.mode: FIT`** — handles different screen sizes
3. **Boot → Preload → Game** — never load all assets in Boot
4. **Use tilemap layers** — don't place tiles manually
5. **Camera bounds must match tilemap** — or camera shows void

---

## Related Skills

- MengTo: `ship-web-games`, `test-playable-web-games`
- Phaser: `game-setup-and-config`, `scenes`, `loading-assets`
