---
name: audio-system
description: "Bridge skill: Implement game audio in Phaser 4. Maps MengTo audio patterns (spatial audio, music states, SFX layers) to Phaser Sound API. Use when building sound effects, music system, or audio feedback."
---

# Audio System Bridge

> How to implement MengTo audio patterns using Phaser 4 Sound API.

**Design Source:** MengTo `build-game-audio-feedback`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Audio Layers
- **SFX** — one-shot sounds (hit, jump, collect)
- **Ambient** — looping background (rain, wind, crowd)
- **Music** — theme music, state-based transitions
- **UI** — menu clicks, hover sounds

### Audio Rules
- Max 3 concurrent SFX
- Music crossfade on state change
- SFX volume independent of music
- Mute toggle affects all

---

## Phaser 4 Implementation

### 1. Audio Setup

```js
preload() {
    // SFX
    this.load.audio('hit', 'assets/audio/hit.wav');
    this.load.audio('jump', 'assets/audio/jump.wav');
    this.load.audio('collect', 'assets/audio/collect.wav');

    // Music
    this.load.audio('theme-forest', 'assets/audio/theme-forest.ogg');
    this.load.audio('theme-battle', 'assets/audio/theme-battle.ogg');

    // Ambient
    this.load.audio('rain', 'assets/audio/rain.ogg');
}

create() {
    // Music manager
    this.music = {
        current: null,
        crossfade: (key, volume = 0.5) => {
            if (this.music.current) {
                this.tweens.add({
                    targets: this.music.current,
                    volume: 0,
                    duration: 1000,
                    onComplete: () => this.music.current.stop()
                });
            }
            this.music.current = this.sound.add(key, { volume: 0, loop: true });
            this.tweens.add({
                targets: this.music.current,
                volume: volume,
                duration: 1000
            });
            this.music.current.play();
        }
    };

    // Start theme
    this.music.crossfade('theme-forest');
}
```

### 2. SFX with Variations

```js
playHitSound() {
    const variations = ['hit1', 'hit2', 'hit3'];
    const key = Phaser.Utils.Array.GetRandom(variations);
    this.sound.play(key, { volume: 0.7 });
}

playHitSoundWithPitch() {
    this.sound.play('hit', {
        volume: 0.7,
        rate: Phaser.Math.FloatBetween(0.9, 1.1)
    });
}
```

### 3. Spatial Audio

```js
playSpatialSound(x, y, key, maxDistance = 300) {
    const sound = this.sound.add(key);
    const camera = this.cameras.main;

    // Calculate distance from camera center
    const camCenterX = camera.scrollX + camera.width / 2;
    const camCenterY = camera.scrollY + camera.height / 2;
    const dist = Phaser.Math.Distance.Between(x, y, camCenterX, camCenterY);

    // Volume based on distance
    const volume = Phaser.Math.Clamp(1 - (dist / maxDistance), 0, 1);
    sound.play({ volume });
}
```

### 4. Music State Machine

```js
class MusicManager {
    constructor(scene) {
        this.scene = scene;
        this.states = {};
        this.currentState = null;
    }

    addState(key, musicKey, volume = 0.5) {
        this.states[key] = { musicKey, volume };
    }

    transition(newState) {
        if (this.currentState === newState) return;
        if (!this.states[newState]) return;

        const state = this.states[newState];

        // Crossfade
        if (this.currentSound) {
            this.scene.tweens.add({
                targets: this.currentSound,
                volume: 0,
                duration: 1000,
                onComplete: () => this.currentSound.stop()
            });
        }

        this.currentSound = this.scene.sound.add(state.musicKey, {
            volume: 0,
            loop: true
        });

        this.scene.tweens.add({
            targets: this.currentSound,
            volume: state.volume,
            duration: 1000
        });

        this.currentSound.play();
        this.currentState = newState;
    }
}

// Usage
this.musicManager = new MusicManager(this);
this.musicManager.addState('explore', 'theme-forest', 0.4);
this.musicManager.addState('battle', 'theme-battle', 0.6);

// When entering battle
this.musicManager.transition('battle');
```

### 5. Mute Toggle

```js
setupMuteToggle() {
    this.input.keyboard.on('keydown-M', () => {
        this.sound.mute = !this.sound.mute;
        this.events.emit('mute-changed', this.sound.mute);
    });
}
```

---

## Pitfalls

1. **Don't create new Sound objects** for every SFX — reuse with `this.sound.add()`
2. **Music must loop** — set `loop: true` or it stops after one play
3. **Crossfade duration** should be 1000ms for smooth transitions
4. **Spatial audio is approximate** — Phaser doesn't have true 3D audio
5. **Check `this.sound.locked`** on mobile — audio requires user interaction first

---

## Related Skills

- MengTo: `build-game-audio-feedback`
- Phaser: `audio-and-sound`, `scenes`, `tweens`
