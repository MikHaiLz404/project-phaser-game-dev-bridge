---
name: enemy-ai
description: "Bridge skill: Implement enemy AI state machines in Phaser 4. Maps MengTo AI patterns (aggro, telegraphs, behavior states) to Phaser Scene.update(), Timers, and Physics. Use when building enemy behaviors, patrol, chase, attack patterns, or boss phases."
---

# Enemy AI Bridge

> How to implement MengTo enemy AI patterns using Phaser 4 API.

**Design Source:** MengTo `tune-enemy-ai`, `build-threejs-enemy-systems`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Behavior State Machine
Every enemy has states with clear transitions:
```
IDLE → PATROL → DETECT → CHASE → ATTACK → COOLDOWN → CHASE/RETREAT
```

### State Rules
- **One state at a time** — no overlap
- **Clear enter/exit** — cleanup on transition
- **Data-driven** — archetypes define timing, ranges, speeds

### Aggro System
- Detection range (sight/hearing)
- Aggro timer (persist after target out of range)
- Leash range (return to spawn if target too far)

---

## Phaser 4 Implementation

### 1. State Machine Pattern

```js
class Enemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, config) {
        super(scene, x, y, texture);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.config = config;
        this.state = 'IDLE';
        this.stateTimer = 0;

        // Archetype data
        this.hp = config.hp || 100;
        this.speed = config.speed || 100;
        this.sightRange = config.sightRange || 200;
        this.attackRange = config.attackRange || 40;
        this.leashRange = config.leashRange || 400;
        this.aggroDuration = config.aggroDuration || 3000;
    }

    setState(newState) {
        this.onExitState(this.state);
        this.state = newState;
        this.onEnterState(newState);
    }

    onEnterState(state) {
        switch (state) {
            case 'IDLE':
                this.setVelocity(0);
                this.anims.play('idle');
                break;
            case 'PATROL':
                this.anims.play('walk');
                this.pickPatrolTarget();
                break;
            case 'CHASE':
                this.anims.play('run');
                break;
            case 'ATTACK':
                this.setVelocity(0);
                this.anims.play('attack');
                break;
            case 'COOLDOWN':
                this.setVelocity(0);
                this.stateTimer = this.config.attackCooldown || 1500;
                break;
        }
    }

    onExitState(state) {
        // Cleanup if needed
    }

    update(time, delta, player) {
        switch (this.state) {
            case 'IDLE': this.updateIdle(player); break;
            case 'PATROL': this.updatePatrol(player, delta); break;
            case 'CHASE': this.updateChase(player); break;
            case 'ATTACK': this.updateAttack(player); break;
            case 'COOLDOWN': this.updateCooldown(delta); break;
        }
    }
}
```

### 2. State Update Logic

```js
updateIdle(player) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (dist < this.sightRange) {
        this.setState('CHASE');
    }
}

updatePatrol(player, delta) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (dist < this.sightRange) {
        this.setState('CHASE');
        return;
    }

    // Move toward patrol target
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);
    this.setVelocity(
        Math.cos(angle) * this.speed * 0.5,
        Math.sin(angle) * this.speed * 0.5
    );

    // Reached target or timed out
    const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);
    if (distToTarget < 10) {
        this.setState('IDLE');
        this.time.delayedCall(2000, () => this.setState('PATROL'));
    }
}

updateChase(player) {
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const distToSpawn = Phaser.Math.Distance.Between(this.x, this.y, this.spawnX, this.spawnY);

    // Leash: return to spawn if too far
    if (distToSpawn > this.leashRange) {
        this.setState('RETREAT');
        return;
    }

    // Attack if in range
    if (distToPlayer < this.attackRange) {
        this.setState('ATTACK');
        return;
    }

    // Move toward player
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    this.setVelocity(
        Math.cos(angle) * this.speed,
        Math.sin(angle) * this.speed
    );

    // Face player
    this.setFlipX(player.x < this.x);
}

updateAttack(player) {
    // Wait for animation to finish
    if (!this.anims.isPlaying) {
        this.setState('COOLDOWN');
    }
}

updateCooldown(delta) {
    this.stateTimer -= delta;
    if (this.stateTimer <= 0) {
        this.setState('CHASE');
    }
}
```

### 3. Telegraph System

```js
// Telegraph = visual warning before attack
showTelegraph(type) {
    const telegraph = this.scene.add.circle(this.x, this.y - 20, 30, 0xff0000, 0.3);
    this.scene.tweens.add({
        targets: telegraph,
        alpha: 0,
        scale: 1.5,
        duration: 500,
        onComplete: () => telegraph.destroy()
    });

    // Warning sound
    this.scene.sound.play('telegraph', { volume: 0.5 });
}
```

### 4. Boss Phases

```js
class Boss extends Enemy {
    constructor(scene, x, y, texture, config) {
        super(scene, x, y, texture, config);
        this.phase = 1;
        this.phaseThresholds = config.phaseThresholds || [0.7, 0.3];
    }

    takeDamage(amount) {
        super.takeDamage(amount);
        this.checkPhaseTransition();
    }

    checkPhaseTransition() {
        const hpPercent = this.hp / this.maxHp;

        if (this.phase === 1 && hpPercent < this.phaseThresholds[0]) {
            this.phase = 2;
            this.enterPhase2();
        } else if (this.phase === 2 && hpPercent < this.phaseThresholds[1]) {
            this.phase = 3;
            this.enterPhase3();
        }
    }

    enterPhase2() {
        this.speed *= 1.3;
        this.config.attackCooldown *= 0.7;
        this.scene.cameras.main.shake(500, 0.01);
        this.showTelegraph('phase-change');
    }

    enterPhase3() {
        this.speed *= 1.5;
        this.config.attackCooldown *= 0.5;
        this.scene.cameras.main.flash(300, 255, 0, 0);
    }
}
```

---

## Archetype Data Format

```json
{
    "slime": {
        "hp": 50,
        "speed": 60,
        "sightRange": 150,
        "attackRange": 30,
        "attackDamage": 10,
        "attackCooldown": 2000,
        "leashRange": 300,
        "aggroDuration": 2000,
        "phases": null
    },
    "skeleton": {
        "hp": 100,
        "speed": 80,
        "sightRange": 200,
        "attackRange": 45,
        "attackDamage": 20,
        "attackCooldown": 1500,
        "leashRange": 400,
        "aggroDuration": 3000,
        "telegraphDuration": 600
    },
    "boss_dragon": {
        "hp": 500,
        "speed": 100,
        "sightRange": 500,
        "attackRange": 80,
        "attackDamage": 50,
        "attackCooldown": 1000,
        "leashRange": 600,
        "aggroDuration": 5000,
        "phaseThresholds": [0.7, 0.3],
        "phases": {
            "2": { "speedMultiplier": 1.3, "cooldownMultiplier": 0.7 },
            "3": { "speedMultiplier": 1.5, "cooldownMultiplier": 0.5 }
        }
    }
}
```

---

## Pitfalls

1. **Never skip state cleanup** — always call `onExitState()` before transitioning
2. **Use `time.delayedCall`** for cooldowns, not frame counting (frame rate varies)
3. **Leash range must be checked** — enemies that chase forever break the game
4. **Telegraph timing matters** — too fast = unfair, too slow = boring
5. **Boss phases must be data-driven** — hardcoding phase changes makes balancing impossible

---

## Related Skills

- MengTo: `tune-enemy-ai`, `design-game-encounters`, `build-threejs-enemy-systems`
- Phaser: `physics-arcade`, `time-and-timers`, `tweens`
