---
name: sprites-and-animations
description: "Bridge skill: Implement sprites and animations in Phaser 4. Maps game object patterns (player, enemies, projectiles) to Phaser Sprite, Spritesheet, and Animation API. Use when creating animated characters, projectiles, or any sprite-based game object."
---

# Sprites & Animations Bridge

> How to create animated game objects using Phaser 4 Sprite API.

**Design Source:** MengTo `build-hybrid-game-assets`
**Framework:** Phaser 4

---

## 1. Create Sprite

```js
// Basic sprite
this.player = this.add.sprite(400, 300, 'player');

// Physics sprite
this.player = this.physics.add.sprite(400, 300, 'player');
this.player.setCollideWorldBounds(true);
this.player.setBounce(0.2);
```

## 2. Load Spritesheet

```js
preload() {
    this.load.spritesheet('player', 'assets/player.png', {
        frameWidth: 32,
        frameHeight: 48
    });
}
```

## 3. Create Animations

```js
create() {
    this.anims.create({
        key: 'walk-down',
        frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1  // loop
    });

    this.anims.create({
        key: 'attack',
        frames: this.anims.generateFrameNumbers('player', { start: 4, end: 7 }),
        frameRate: 15,
        repeat: 0  // play once
    });

    this.anims.create({
        key: 'idle',
        frames: [{ key: 'player', frame: 0 }],
        frameRate: 1
    });
}
```

## 4. Play Animations

```js
// Play
this.player.anims.play('walk-down');

// Play if not already playing
if (this.player.anims.currentAnim?.key !== 'walk-down') {
    this.player.anims.play('walk-down');
}

// On complete
this.player.anims.play('attack');
this.player.once('animationcomplete', () => {
    this.isAttacking = false;
});

// Reverse
this.player.anims.playReverse('walk-down');
```

## 5. Flip Sprite

```js
// Flip horizontally
this.player.setFlipX(true);

// Based on movement direction
if (velocity.x < 0) this.player.setFlipX(true);
else if (velocity.x > 0) this.player.setFlipX(false);
```

## 6. Sprite Effects

```js
// Tint
this.player.setTint(0xff0000);  // red
this.player.clearTint();

// Alpha
this.player.setAlpha(0.5);

// Scale
this.player.setScale(1.5);

// Rotation
this.player.setRotation(Math.PI / 4);
```

## 7. Projectile Pattern

```js
shoot(x, y, angle) {
    const bullet = this.bullets.get(x, y, 'bullet');
    if (!bullet) return;

    bullet.setActive(true).setVisible(true);
    bullet.setRotation(angle);
    this.physics.velocityFromRotation(angle, 400, bullet.body.velocity);

    this.time.delayedCall(2000, () => {
        bullet.setActive(false).setVisible(false);
    });
}
```

---

## Pitfalls

1. **frameWidth/Height must match** — or animations look wrong
2. **repeat: -1 = infinite loop** — use repeat: 0 for one-shot
3. **Check currentAnim** before playing — prevent animation restarts
4. **Physics sprites need body** — set velocity on body, not sprite
5. **Destroy off-screen sprites** — prevent memory leaks
