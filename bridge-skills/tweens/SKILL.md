---
name: tweens
description: "Bridge skill: Implement animations and easing in Phaser 4. Maps game feel patterns (squash/stretch, screen effects, UI transitions) to Phaser Tween API. Use when building attack animations, UI transitions, camera effects, or any smooth motion."
---

# Tweens Bridge

> How to implement game feel patterns using Phaser 4 Tween API.

**Design Source:** MengTo `design-action-combat`, `create-game-vfx`
**Framework:** Phaser 4

---

## Tween Basics

### Core Properties
```js
this.tweens.add({
    targets: sprite,          // object to animate
    x: 500,                  // end value
    y: 300,
    alpha: 0.5,
    scaleX: 2,
    scaleY: 2,
    angle: 360,
    duration: 1000,           // ms
    ease: 'Power2',           // easing function
    delay: 0,                 // ms before start
    yoyo: false,              // reverse on complete
    repeat: 0,                // times to repeat (-1 = infinite)
    hold: 0,                  // ms to hold at end before yoyo
    repeatDelay: 0,           // ms between repeats
    onStart: () => {},
    onUpdate: () => {},
    onComplete: () => {}
});
```

### Common Eases
| Ease | Feel |
|------|------|
| `Linear` | Constant speed |
| `Power2` | Smooth acceleration |
| `Power3` | Strong acceleration |
| `Back` | Overshoot + settle |
| `Bounce` | Bounce at end |
| `Elastic` | Springy bounce |
| `Quad.easeIn` | Slow start |
| `Quad.easeOut` | Slow end |

---

## Game Feel Patterns

### 1. Squash & Stretch (Landing)
```js
land() {
    this.tweens.add({
        targets: this.player,
        scaleY: 0.6,
        scaleX: 1.3,
        duration: 80,
        ease: 'Quad.easeOut',
        yoyo: true,
        onComplete: () => {
            this.player.setScale(1);
        }
    });
}
```

### 2. Hit Impact
```js
hitEffect(target) {
    // Flash white
    target.setTint(0xffffff);
    this.time.delayedCall(80, () => target.clearTint());

    // Knockback with bounce
    this.tweens.add({
        targets: target,
        x: target.x + (target.flipX ? 50 : -50),
        duration: 150,
        ease: 'Back.easeOut'
    });
}
```

### 3. Attack Swing
```js
swingAttack() {
    this.tweens.add({
        targets: this.weapon,
        angle: 90,
        duration: 100,
        ease: 'Quad.easeIn',
        yoyo: true,
        hold: 50,
        onComplete: () => {
            this.weapon.angle = 0;
        }
    });
}
```

### 4. UI Pop-in
```js
popIn(element) {
    element.setScale(0);
    this.tweens.add({
        targets: element,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        ease: 'Back.easeOut'
    });
}
```

### 5. Floating Idle
```js
floatIdle(sprite) {
    this.tweens.add({
        targets: sprite,
        y: sprite.y - 10,
        duration: 1500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
    });
}
```

### 6. Screen Flash
```js
flashScreen(color = 0xffffff) {
    const flash = this.add.rectangle(
        this.cameras.main.centerX,
        this.cameras.main.centerY,
        this.cameras.main.width,
        this.cameras.main.height,
        color
    ).setDepth(1000);

    this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 200,
        onComplete: () => flash.destroy()
    });
}
```

---

## Chained Tweens

```js
// Sequential animations
this.tweens.chain({
    targets: this.player,
    tweens: [
        { x: 200, duration: 500 },
        { y: 100, duration: 300 },
        { scaleX: 1.5, scaleY: 0.5, duration: 100, yoyo: true },
        { x: 0, y: 0, duration: 500 }
    ]
});
```

---

## Tween Groups

```js
// Animate multiple objects together
this.tweens.add({
    targets: [sprite1, sprite2, sprite3],
    alpha: 0,
    duration: 500,
    stagger: 100  // delay between each
});
```

---

## Pitfalls

1. **Always use `onComplete`** to reset state — or objects stay modified
2. **`yoyo: true`** needs enough duration — too fast looks glitchy
3. **`repeat: -1`** loops forever — must stop manually with `tween.stop()`
4. **Stagger timing** — 100ms is subtle, 200ms is noticeable
5. **Don't stack tweens** on same property — they fight each other
6. **Kill tweens on scene stop** — or they leak into next scene

---

## Related Skills

- MengTo: `design-action-combat`, `create-game-vfx`, `build-game-camera-controls`
- Phaser: `tweens`, `animations`, `time-and-timers`
