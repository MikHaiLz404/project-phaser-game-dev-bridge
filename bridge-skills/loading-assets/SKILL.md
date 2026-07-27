---
name: loading-assets
description: "Bridge skill: Manage asset loading in Phaser 4. Maps loading patterns (progress bars, lazy load, asset bundles) to Phaser Loader API. Use when building preload screens, managing asset loading, or optimizing initial load time."
---

# Loading Assets Bridge

> How to manage asset loading using Phaser 4 Loader API.

**Design Source:** MengTo `ship-web-games`
**Framework:** Phaser 4

---

## 1. Asset Types

```js
preload() {
    // Images
    this.load.image('logo', 'assets/logo.png');

    // Spritesheets
    this.load.spritesheet('player', 'assets/player.png', {
        frameWidth: 32, frameHeight: 48
    });

    // Audio
    this.load.audio('bgm', 'assets/bgm.ogg');
    this.load.audio('sfx', 'assets/sfx.wav');

    // JSON data
    this.load.json('items', 'data/items.json');

    // Tilemap
    this.load.tilemapTiledJSON('level1', 'assets/level1.json');

    // Bitmap font
    this.load.bitmapFont('font', 'assets/font.png', 'assets/font.fnt');
}
```

## 2. Progress Bar

```js
preload() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    const bg = this.add.rectangle(w/2, h/2, 320, 50, 0x222222, 0.8);
    const bar = this.add.rectangle(w/2 - 150, h/2, 0, 30, 0x00ff00);
    bar.setOrigin(0, 0.5);

    const text = this.add.text(w/2, h/2, '0%', {
        fontSize: '14px', color: '#ffffff'
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
        bar.width = 300 * value;
        text.setText(Math.round(value * 100) + '%');
    });

    this.load.on('complete', () => {
        this.scene.start('Game');
    });
}
```

## 3. Multi-file Loading

```js
// Load multiple images
this.load.image(['bg_sky', 'bg_mountains'], 'assets/backgrounds/');

// Load from atlas
this.load.atlas('sprites', 'assets/sprites.png', 'assets/sprites.json');
```

## 4. Audio Unlock (Mobile)

```js
create() {
    // Resume audio on first interaction
    this.input.once('pointerdown', () => {
        this.sound.unlock();
    });
}
```

## 5. Lazy Load (Level Select)

```js
loadLevel(levelNum) {
    if (this.cache.tilemap.exists('level' + levelNum)) return;

    this.load.tilemapTiledJSON('level' + levelNum, 'assets/level' + levelNum + '.json');
    this.load.once('complete', () => {
        this.scene.start('Game', { level: levelNum });
    });
    this.load.start();
}
```

## 6. Check Cache Before Load

```js
preload() {
    if (!this.textures.exists('player')) {
        this.load.image('player', 'assets/player.png');
    }
}
```

---

## Pitfalls

1. **Never load in `create()`** — always `preload()`
2. **Check cache before loading** — prevent duplicate loads
3. **Audio needs user interaction** — call `sound.unlock()` on pointerdown
4. **File paths are relative** — to where index.html is served
5. **Atlas JSON must match PNG** — frame names must align
6. **Progress bar must be in preload()** — not create()
