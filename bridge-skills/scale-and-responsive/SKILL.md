---
name: scale-and-responsive
description: "Bridge skill: Handle screen sizing in Phaser 4. Maps mobile/responsive patterns (portrait, landscape, resize, safe areas) to Phaser Scale Manager. Use when building games for multiple screen sizes or mobile devices."
---

# Scale & Responsive Bridge

> How to handle screen sizing using Phaser 4 Scale Manager.

**Design Source:** MengTo `build-mobile-threejs-games`
**Framework:** Phaser 4

---

## 1. Scale Config

```js
const config = {
    scale: {
        mode: Phaser.Scale.FIT,           // Fit to screen
        autoCenter: Phaser.Scale.CENTER_BOTH, // Center canvas
        width: 800,
        height: 600,
        min: { width: 400, height: 300 },
        max: { width: 1600, height: 1200 }
    }
};
```

## 2. Scale Modes

| Mode | Behavior |
|------|----------|
| `FIT` | Scale to fit, maintain aspect ratio |
| `RESIZE` | Resize canvas to window |
| `ENVELOP` | Scale to cover, may crop |
| `NONE` | No scaling |

## 3. Responsive Layout

```js
create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // UI positioned relative to screen
    this.hpBar = this.add.rectangle(w * 0.1, h * 0.05, 200, 20, 0x00ff00);
    this.scoreText = this.add.text(w * 0.9, h * 0.05, '0', { fontSize: '24px' })
        .setOrigin(1, 0);

    // Center game area
    this.player = this.add.rectangle(w / 2, h / 2, 32, 48, 0x00ff00);
}
```

## 4. Handle Resize

```js
create() {
    this.scale.on('resize', (gameSize) => {
        this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
        this.repositionUI(gameSize.width, gameSize.height);
    });
}

repositionUI(w, h) {
    this.hpBar.setPosition(w * 0.1, h * 0.05);
    this.scoreText.setPosition(w * 0.9, h * 0.05);
}
```

## 5. Mobile Touch Zones

```js
create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // Left side = move
    this.moveZone = this.add.rectangle(w * 0.25, h * 0.7, w * 0.5, h * 0.3, 0xffffff, 0.1)
        .setInteractive().setScrollFactor(0);

    // Right side = attack
    this.attackZone = this.add.rectangle(w * 0.75, h * 0.7, w * 0.5, h * 0.3, 0xff0000, 0.1)
        .setInteractive().setScrollFactor(0);

    this.moveZone.on('pointerdown', () => { this.touching = 'move'; });
    this.attackZone.on('pointerdown', () => { this.attack(); });
}
```

## 6. Orientation Lock

```js
// Lock to landscape
this.scale.orientation = Phaser.Scale.Orientation.LANDSCAPE;

// Check orientation
if (this.scale.orientation === Phaser.Scale.Orientation.PORTRAIT) {
    this.showRotatePrompt();
}
```

---

## Pitfalls

1. **Always use FIT** — handles all screen sizes automatically
2. **UI must use relative positions** — never hardcode x/y
3. **Test at multiple sizes** — 400x300, 800x600, 1920x1080
4. **Touch zones need minimum size** — 48px minimum for fingers
5. **handleResize fires on orientation change** — reposition UI
