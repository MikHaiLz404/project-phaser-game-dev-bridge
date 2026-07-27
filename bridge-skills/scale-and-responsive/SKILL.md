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
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 800,
        height: 600,
        min: { width: 400, height: 300 },
        max: { width: 1600, height: 1200 }
    }
};
```

## 2. Scale Modes

| Mode | Behavior | Use When |
|------|----------|----------|
| `FIT` | Fit + letterbox | Most games |
| `RESIZE` | Match window | Full-screen apps |
| `ENVELOP` | Cover + may crop | Background-heavy |
| `NONE` | No scaling | Fixed size |

## 3. Responsive Layout

```js
create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // UI positioned relative to screen
    this.hpBar = this.add.rectangle(w * 0.1, h * 0.05, 200, 16, 0x00ff00)
        .setOrigin(0, 0.5).setScrollFactor(0);

    this.scoreText = this.add.text(w * 0.9, h * 0.05, '0', {
        fontSize: '24px', color: '#ffffff'
    }).setOrigin(1, 0).setScrollFactor(0);
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

    // Left = move
    this.moveZone = this.add.rectangle(w * 0.25, h * 0.7, w * 0.5, h * 0.3, 0xffffff, 0.1)
        .setInteractive().setScrollFactor(0);

    // Right = attack
    this.attackZone = this.add.rectangle(w * 0.75, h * 0.7, w * 0.5, h * 0.3, 0xff0000, 0.1)
        .setInteractive().setScrollFactor(0);

    this.moveZone.on('pointerdown', () => { this.touching = 'move'; });
    this.attackZone.on('pointerdown', () => { this.attack(); });
}
```

## 6. Orientation Lock

```js
// Check orientation
if (this.scale.orientation === Phaser.Scale.Orientation.PORTRAIT) {
    this.showRotatePrompt();
}

// Listen for changes
this.scale.on('orientationchange', (orientation) => {
    if (orientation === Phaser.Scale.Orientation.PORTRAIT) {
        this.showRotatePrompt();
    } else {
        this.hideRotatePrompt();
    }
});
```

## 7. Safe Areas (Notch)

```js
create() {
    const top = this.scale.safeArea?.top || 0;
    const bottom = this.scale.safeArea?.bottom || 0;

    // Position UI below notch
    this.scoreText = this.add.text(10, top + 10, '0', { fontSize: '24px' });
}
```

---

## Pitfalls

1. **Always use FIT** — handles all screen sizes automatically
2. **UI must use relative positions** — never hardcode x/y
3. **Test at multiple sizes** — 400x300, 800x600, 1920x1080
4. **Touch zones need minimum size** — 48px minimum for fingers
5. **handleResize fires on orientation change** — reposition UI
6. **`touch-action: none`** on canvas — prevents browser gestures
7. **Safe areas vary by device** — iPhone notch != Android punch-hole
