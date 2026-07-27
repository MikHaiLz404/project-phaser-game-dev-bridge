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

---

## Text

### Basic
```js
const text = this.add.text(x, y, 'Hello', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 2
}).setOrigin(0.5);
```

### Dynamic Update
```js
this.hpText.setText('HP: ' + current + '/' + max);
```

### Typewriter
```js
typewrite(text, target, speed) {
    let i = 0;
    target.setText('');
    this.time.addEvent({
        delay: speed || 30,
        callback: () => {
            target.setText(text.substring(0, i));
            i++;
        },
        repeat: text.length - 1
    });
}
```

### Dialog Box
```js
createDialog(x, y, w, h) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.8);
    bg.setStrokeStyle(2, 0xffffff);
    const txt = this.add.text(-w/2+20, -h/2+20, '', {
        fontSize: '14px', color: '#fff',
        wordWrap: { width: w - 40 }
    });
    c.add([bg, txt]);
    return { container: c, text: txt };
}
```

---

## BitmapText

### Load
```js
this.load.bitmapFont('gameFont', 'assets/font.png', 'assets/font.fnt');
```

### Create
```js
this.scoreText = this.add.bitmapText(10, 10, 'gameFont', 'SCORE: 0', 24);
```

### HUD (fixed on screen)
```js
this.scoreText.setScrollFactor(0);
```

---

## Pitfalls

1. Text re-renders every setText() -- use BitmapText for frequent updates
2. Word wrap needs width set
3. setScrollFactor(0) for HUD elements
