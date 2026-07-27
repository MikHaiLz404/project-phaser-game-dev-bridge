---
name: camera-system
description: "Bridge skill: Implement game cameras in Phaser 4. Maps MengTo camera patterns (follow, shake, zoom, cinematic) to Phaser Camera API. Use when building camera follow, screen shake, zoom effects, or cinematic sequences."
---

# Camera System Bridge

> How to implement MengTo camera patterns using Phaser 4 Camera API.

**Design Source:** MengTo `build-game-camera-controls`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Camera Behaviors
- **Follow** — track player with lerp smoothing
- **Deadzone** — area where camera doesn't move (responsive feel)
- **Bounds** — limit camera to level edges
- **Shake** — impact feedback, screen rumble
- **Zoom** — focus on action, reveal scale
- **Cinematic** — scripted camera movements for cutscenes

---

## Phaser 4 Implementation

### 1. Camera Follow with Deadzone

```js
const camera = this.cameras.main;

// Set bounds to level size
camera.setBounds(0, 0, 2000, 1500);

// Follow player with deadzone
camera.startFollow(this.player, true, 0.08, 0.08);
camera.setDeadzone(100, 50);

// Optional: round pixels for pixel art
camera.setRoundPixels(true);
```

### 2. Screen Shake

```js
// On hit impact
onPlayerHit() {
    this.cameras.main.shake(200, 0.01);
}

// On boss attack
onBossAttack() {
    this.cameras.main.shake(500, 0.02);
}

// Custom shake with callback
this.cameras.main.shake(300, 0.015, (camera, progress) => {
    if (progress === 1) {
        console.log('Shake complete');
    }
});
```

### 3. Zoom Effects

```js
// Zoom to target
zoomTo(target, duration = 500) {
    this.tweens.add({
        targets: this.cameras.main,
        zoom: 2,
        scrollX: target.x - this.cameras.main.width / 2,
        scrollY: target.y - this.cameras.main.height / 2,
        duration: duration,
        ease: 'power2.inOut'
    });
}

// Zoom out for overview
zoomOut() {
    this.tweens.add({
        targets: this.cameras.main,
        zoom: 1,
        duration: 500,
        ease: 'power2.inOut'
    });
}
```

### 4. Cinematic Camera

```js
// Scripted camera path
playCutscene() {
    const camera = this.cameras.main;
    const path = [
        { x: 100, y: 100, zoom: 1, duration: 1000 },
        { x: 500, y: 300, zoom: 1.5, duration: 1500 },
        { x: 800, y: 200, zoom: 1, duration: 1000 },
    ];

    camera.stopFollow();

    let delay = 0;
    path.forEach((point, i) => {
        this.time.delayedCall(delay, () => {
            this.tweens.add({
                targets: camera,
                scrollX: point.x,
                scrollY: point.y,
                zoom: point.zoom,
                duration: point.duration,
                ease: 'power2.inOut',
                onComplete: () => {
                    if (i === path.length - 1) {
                        camera.startFollow(this.player);
                        this.events.emit('cutscene-complete');
                    }
                }
            });
        });
        delay += point.duration;
    });
}
```

### 5. Camera Flash/Fade

```js
// Flash on damage
this.cameras.main.flash(200, 255, 0, 0);

// Fade to black for scene transition
this.cameras.main.fadeOut(500, 0, 0, 0);
this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start('NextScene');
});

// Fade in on scene start
this.cameras.main.fadeIn(500, 0, 0, 0);
```

---

## Pitfalls

1. **Always set bounds** — camera without bounds can show void
2. **Deadzone prevents jitter** — essential for responsive feel
3. **Use lerp for smooth follow** — `0.08` is good default
4. **Shake intensity is relative** — `0.01` = subtle, `0.03` = heavy
5. **Stop follow before cinematic** — or camera fights the script

---

## Related Skills

- MengTo: `build-game-camera-controls`
- Phaser: `cameras`, `tweens`, `scenes`
