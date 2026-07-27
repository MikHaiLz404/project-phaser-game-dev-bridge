---
name: scenes
description: "Bridge skill: Manage scene lifecycle in Phaser 4. Maps game flow patterns (menus, gameplay, pause, game over) to Phaser Scene API. Use when building scene transitions, data passing between scenes, or multi-scene games."
---

# Scenes Bridge

> How to manage game flow using Phaser 4 Scene API.

**Design Source:** MengTo `ship-web-games`
**Framework:** Phaser 4

---

## Scene Lifecycle

```
init() → preload() → create() → update()
         ↓              ↓           ↓
      Load assets   Set up game   Game loop
```

---

## 1. Define Scenes

```js
class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() { this.scene.start('Preload'); }
}

class PreloadScene extends Phaser.Scene {
    constructor() { super('Preload'); }
    preload() { this.load.image('player', 'assets/player.png'); }
    create() { this.scene.start('Game'); }
}

class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }
    create() { /* game logic */ }
    update(time, delta) { /* game loop */ }
}
```

## 2. Scene Config

```js
const config = {
    scene: [BootScene, PreloadScene, GameScene]
};
// First scene in array starts automatically
```

## 3. Scene Transitions

```js
// Simple start
this.scene.start('GameOver', { score: 1000 });

// Transition with effects
this.cameras.main.fadeOut(500, 0, 0, 0);
this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start('NextScene', { level: 2 });
});

// Stop current, start new
this.scene.stop('Game');
this.scene.start('Menu');
```

## 4. Pass Data Between Scenes

```js
// Sender
this.scene.start('GameOver', {
    score: this.score,
    level: this.currentLevel,
    time: this.gameTime
});

// Receiver
class GameOverScene extends Phaser.Scene {
    init(data) {
        this.finalScore = data.score;
        this.level = data.level;
    }
}
```

## 5. Run Multiple Scenes

```js
// UI scene runs on top of Game scene
this.scene.launch('UI');
this.scene.launch('Audio');

// Access other scene
const ui = this.scene.get('UI');
ui.events.emit('score-changed', this.score);

// Stop specific scene
this.scene.stop('UI');
```

## 6. Pause/Resume

```js
// Pause
this.scene.pause('Game');
this.scene.launch('PauseMenu');

// Resume
this.scene.resume('Game');
this.scene.stop('PauseMenu');
```

## 7. Scene Events

```js
create() {
    this.scene.events.on('shutdown', () => {
        // Cleanup when scene stops
        this.tweens.killAll();
    });

    this.scene.events.on('wake', () => {
        // Scene resumed from sleep
    });
}
```

---

## Pitfalls

1. **init() receives data** — use it, not create()
2. **Don't load assets in Game scene** — do it in Preload
3. **Stop scenes you don't need** — they still run update()
4. **Events are per-scene** — use scene.events, not game.events
5. **shutdown cleanup is essential** — prevent memory leaks
