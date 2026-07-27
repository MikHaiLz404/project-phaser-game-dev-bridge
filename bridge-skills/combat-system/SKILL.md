---
name: combat-system
description: "Bridge skill: Implement tactical action combat in Phaser 4. Maps MengTo combat design patterns (timing windows, hit detection, damage) to Phaser Arcade Physics, Tweens, and Input API. Use when building melee/ranged combat, attack combos, guard/dodge, or hit feedback."
---

# Combat System Bridge

> How to implement MengTo combat design patterns using Phaser 4 API.

**Design Source:** MengTo `design-action-combat` skill
**Framework:** Phaser 4 (Arcade Physics)

---

## Design Patterns (from MengTo)

### Timing Windows
Every attack has 3 phases:
1. **Startup** — wind-up, vulnerable, no hitbox active
2. **Active** — hitbox active, can deal damage
3. **Recovery** — post-attack, vulnerable again

### Hit Contact Contracts
- Hitbox must overlap target during **active frames**
- Damage applied once per swing (no multi-hit on same frame)
- Hitstop (freeze frames) on impact for juice

### Guard/Dodge
- **Guard:** reduces damage by %, pushes attacker back
- **Dodge:** invincibility frames, position shift

---

## Phaser 4 Implementation

### 1. Attack Timing with Tweens

```js
// Attack sequence: startup → active → recovery
attack(target) {
    if (this.isAttacking) return;
    this.isAttacking = true;

    // Phase 1: Startup (no damage)
    this.tweens.add({
        targets: this,
        scaleX: 1.2,
        duration: 100,  // startup frames
        ease: 'power2.in',
        onComplete: () => {
            // Phase 2: Active (deal damage)
            this.hitbox.SetActive(true);
            this.tweens.add({
                targets: this,
                scaleX: 1.0,
                duration: 80,  // active frames
                onComplete: () => {
                    // Phase 3: Recovery
                    this.hitbox.SetActive(false);
                    this.tweens.add({
                        targets: this,
                        duration: 120,  // recovery frames
                        onComplete: () => { this.isAttacking = false; }
                    });
                }
            });
        }
    });
}
```

### 2. Hit Detection with Arcade Physics

```js
// Create hitbox as physics body
this.hitbox = this.physics.add.sprite(0, 0, 'hitbox');
this.hitbox.setSize(64, 32);
this.hitbox.setVisible(false);
this.hitbox.SetActive(false);

// Overlap check (runs every frame)
this.physics.add.overlap(
    this.hitbox,
    enemies,
    this.onHitEnemy,
    () => this.hitbox.active,  // processCallback
    this
);

onHitEnemy(hitbox, enemy) {
    if (enemy.isInvulnerable) return;

    // Apply damage
    enemy.takeDamage(this.attackDamage);

    // Hitstop (freeze both)
    this.time.delayedCall(50, () => {
        enemy.setVelocity(0);
    });
}
```

### 3. Damage System

```js
// In enemy.js
takeDamage(amount) {
    if (this.isInvulnerable) return;

    const reduced = this.guarding ? amount * 0.3 : amount;
    this.hp -= reduced;

    // Flash red
    this.setTint(0xff0000);
    this.time.delayedCall(100, () => this.clearTint());

    // Knockback
    const knockDir = this.x < attacker.x ? -1 : 1;
    this.setVelocity(knockDir * 200, -100);

    // Invulnerability frames
    this.isInvulnerable = true;
    this.tweens.add({
        targets: this,
        alpha: 0.5,
        duration: 80,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
            this.isInvulnerable = false;
            this.alpha = 1;
        }
    });
}
```

### 4. Combo System

```js
// Track combo state
this.comboCount = 0;
this.comboTimer = null;

onAttackHit() {
    this.comboCount++;

    // Reset combo after 800ms of no hits
    if (this.comboTimer) this.comboTimer.remove();
    this.comboTimer = this.time.delayedCall(800, () => {
        this.comboCount = 0;
    });

    // Combo multiplier
    const damage = this.baseDamage * (1 + this.comboCount * 0.2);

    // Combo UI
    this.events.emit('combo', this.comboCount);
}
```

---

## Config Reference

```js
const combatConfig = {
    attack: {
        startup: 100,    // ms before hitbox active
        active: 80,      // ms hitbox is active
        recovery: 120,   // ms after active
        damage: 25,
        knockback: 200,
    },
    guard: {
        reduction: 0.7,  // 70% damage reduction
        pushback: 100,
    },
    dodge: {
        iframes: 300,    // invincibility ms
        distance: 80,
    },
    combo: {
        window: 800,     // ms to chain next hit
        multiplier: 0.2, // damage bonus per combo
    }
};
```

---

## Pitfalls

1. **Don't use `update()` for hit detection** — use `physics.add.overlap()` with processCallback
2. **Reset hitbox position** every frame relative to attacker facing
3. **Invulnerability must be checked** before applying damage
4. **Hitstop should freeze both** attacker and target (set velocity to 0)
5. **Combo window must reset** on each hit, not on attack start

---

## Related Skills

- MengTo: `design-action-combat`, `build-game-camera-controls`
- Phaser: `physics-arcade`, `tweens`, `input-keyboard-mouse-touch`
