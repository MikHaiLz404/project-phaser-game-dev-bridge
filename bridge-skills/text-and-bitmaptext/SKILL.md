---
name: text-and-bitmaptext
description: "Bridge skill: Implement text rendering in Phaser 4. Maps UI patterns (HP bars, damage numbers, dialog boxes, menus) to Phaser Text and BitmapText API. Use when building game UI, dialog systems, or any text display."
---

# Text & BitmapText Bridge

> How to implement game UI text using Phaser 4 Text API.

**Design Source:** MengTo `build-game-inventory`, `design-action-combat`
**Framework:** Phaser 4

---

## Text vs BitmapText

| Feature | Text | BitmapText |
|---------|------|------------|
| Rendering | Canvas/WebGL | Sprite-based |
| Performance | Slower (re-renders) | Faster (pre-rendered) |
| Styling | Full CSS | Font image only |
| Dynamic | Yes | Limited |
| Best for | Dialog, UI labels | Score, counters, HUD |

**Rule:** Use **Text** for dynamic content (dialog, names). Use **BitmapText** for frequent updates (score, timer).

---

## Text

### 1. Basic Text

```js
const text = this.add.text(x, y, 'Hello World', {
    fontSize: '24px',
    fontFamily: 'Arial, sans-serif',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 2,
    shadow: {
        offsetX: 2, offsetY: 2,
        color: '#000000',
        blur: 4, fill: true
    }
}).setOrigin(0.5);
```

### 2. Word Wrap

```js
const dialog = this.add.text(100, 400, dialogText, {
    fontSize: '16px',
    color: '#ffffff',
    wordWrap: { width: 600, useAdvancedWrap: true },
    lineSpacing: 8
}).setOrigin(0.5);
```

### 3. Dynamic Update

```js
// HP display
updateHP(current, max) {
    this.hpText.setText(`HP: ${current}/${max}`);
    const pct = current / max;
    if (pct > 0.5) this.hpText.setColor('#00ff00');
    else if (pct > 0.25) this.hpText.setColor('#ffff00');
    else this.hpText.setColor('#ff0000');
}
```

### 4. Typewriter Effect

```js
typewrite(text, target, speed = 30) {
    let index = 0;
    target.setText('');
    const timer = this.time.addEvent({
        delay: speed,
        callback: () => {
            target.setText(text.substring(0, index));
            index++;
            if (index > text.length) timer.remove();
        },
        repeat: text.length - 1
    });
    return timer;
}
```

### 5. Dialog Box

```js
createDialog(x, y, width, height) {
    const container = this.add.container(x, y).setDepth(100);

    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.85);
    bg.setStrokeStyle(2, 0xffffff);

    const text = this.add.text(
        -width/2 + 20, -height/2 + 20, '',
        { fontSize: '14px', color: '#ffffff', wordWrap: { width: width - 40 }, lineSpacing: 6 }
    );

    const indicator = this.add.text(
        width/2 - 20, height/2 - 20, '▼',
        { fontSize: '12px', color: '#ffffff' }
    ).setOrigin(1, 1);

    // Blink indicator
    this.tweens.add({
        targets: indicator, alpha: 0,
        duration: 500, yoyo: true, repeat: -1
    });

    container.add([bg, text, indicator]);
    return { container, text, indicator };
}

// Usage
const dialog = this.createDialog(400, 500, 600, 120);
this.typewrite('Welcome to the dungeon!', dialog.text);
```

### 6. Score Pop Animation

```js
showScorePopup(x, y, points) {
    const text = this.add.text(x, y, `+${points}`, {
        fontSize: '18px', color: '#ffff00',
        stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);

    this.tweens.add({
        targets: text,
        y: y - 40, alpha: 0, scale: 1.5,
        duration: 800,
        onComplete: () => text.destroy()
    });
}
```

### 7. HP Bar with Text

```js
createHPBar(x, y, width) {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, width, 16, 0x333333);
    bg.setOrigin(0, 0.5);

    const bar = this.add.rectangle(0, 0, width, 16, 0x00ff00);
    bar.setOrigin(0, 0.5);

    const label = this.add.text(width / 2, 0, '100/100', {
        fontSize: '10px', color: '#ffffff'
    }).setOrigin(0.5);

    container.add([bg, bar, label]);

    return {
        container,
        update(current, max) {
            const pct = current / max;
            bar.width = width * pct;
            label.setText(`${current}/${max}`);
            if (pct > 0.5) bar.setFillStyle(0x00ff00);
            else if (pct > 0.25) bar.setFillStyle(0xffff00);
            else bar.setFillStyle(0xff0000);
        }
    };
}
```

---

## BitmapText

### 1. Load Bitmap Font

```js
preload() {
    // From fnt file (BMFont format)
    this.load.bitmapFont('gameFont', 'assets/font.png', 'assets/font.fnt');

    // From XML (Tiled format)
    this.load.bitmapFont('pixelFont', 'assets/pixel.png', 'assets/pixel.xml');
}
```

### 2. Create BitmapText

```js
this.scoreText = this.add.bitmapText(10, 10, 'gameFont', 'SCORE: 0', 24);
```

### 3. HUD (fixed on screen)

```js
this.scoreText.setScrollFactor(0);
```

### 4. Retro Score HUD

```js
createHUD() {
    this.scoreText = this.add.bitmapText(10, 10, 'gameFont', '0', 16)
        .setScrollFactor(0);
    this.livesText = this.add.bitmapText(10, 30, 'gameFont', '♥♥♥', 16)
        .setScrollFactor(0);
    this.levelText = this.add.bitmapText(
        this.cameras.main.width - 10, 10, 'gameFont', 'LV 1', 16
    ).setOrigin(1, 0).setScrollFactor(0);
}
```

---

## Styling Reference

| Property | Description | Example |
|----------|-------------|---------|
| `fontSize` | Font size | `'24px'` |
| `fontFamily` | Font stack | `'Arial, sans-serif'` |
| `fontStyle` | Style | `'bold italic'` |
| `color` | Text color | `'#ffffff'` |
| `stroke` | Outline color | `'#000000'` |
| `strokeThickness` | Outline width | `2` |
| `align` | Alignment | `'center'` |
| `wordWrap.width` | Wrap width | `400` |
| `lineSpacing` | Line gap | `8` |
| `shadow.blur` | Shadow softness | `4` |

---

## Pitfalls

1. **Text re-renders every `setText()`** — use BitmapText for high-frequency updates
2. **Word wrap needs `width`** — without it, text runs off screen
3. **BitmapText fonts must match** — image + fnt/xml must be same font
4. **`setScrollFactor(0)`** for HUD — keeps text fixed on screen
5. **Dynamic text can be slow** — batch updates, don't update every frame
6. **Dialog typewriter needs cleanup** — remove timer on scene shutdown
7. **Use `setOrigin(0.5)`** for centered text — default is (0, 0) top-left
