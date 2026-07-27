// Combat System — based on MengTo design-action-combat pattern
// See bridge-skills/combat-system/SKILL.md for full implementation reference
//
// Responsibilities:
//   - Attack timing (startup → active → recovery)
//   - Damage calculation (base damage × combo multiplier)
//   - Hitstop (brief time-scale freeze on impact)
//   - Knockback (direction-based push)
//   - Player state styling (tint + alpha per state)
//   - Combo tracking

export class CombatSystem {
    constructor(scene) {
        this.scene = scene;
        this.config = {
            startup: 100,     // ms before hitbox active
            active: 80,       // ms hitbox is active
            recovery: 120,    // ms after active
            damage: 25,       // base damage per hit
            knockback: 200,   // knockback velocity
            hitstop: 40,      // ms to freeze both attacker & target
            combo: {
                window: 800,     // ms to chain next hit
                multiplier: 0.2  // damage bonus per combo level
            }
        };

        this.playerStateStyles = {
            IDLE:     { tint: 0x00cc44, alpha: 1 },
            RUNNING:  { tint: 0x00cc44, alpha: 1 },
            ATTACKING:{ tint: 0xffffff, alpha: 1 },
            GUARDING: { tint: 0x66aaff, alpha: 0.9 },
            DODGING:  { tint: 0xffffff, alpha: 0.65 }
        };
    }

    // ─── Stat / Direction Helpers ────────────────────────────────────

    resolveStat(entity, keys, fallback = 0) {
        if (!entity) return fallback;

        const layers = [entity.stats, entity.config, entity];
        for (const layer of layers) {
            if (!layer || typeof layer !== 'object') continue;
            for (const key of keys) {
                const value = layer[key];
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                }
            }
        }

        return fallback;
    }

    normalizeVector(direction, fallback = { x: 1, y: 0 }) {
        const dx = direction?.x ?? 0;
        const dy = direction?.y ?? 0;
        const length = Math.hypot(dx, dy);
        if (!Number.isFinite(length) || length === 0) {
            return { x: fallback.x ?? 1, y: fallback.y ?? 0 };
        }
        return { x: dx / length, y: dy / length };
    }

    getDirectionVector(source, target, fallback = { x: 1, y: 0 }) {
        if (!source || !target) return fallback;
        return this.normalizeVector({
            x: target.x - source.x,
            y: target.y - source.y
        }, fallback);
    }

    // ─── Player State Styles ─────────────────────────────────────────

    applyPlayerStyle(player, state) {
        if (!player || !player.active) return;
        const style = this.playerStateStyles[state] || this.playerStateStyles.IDLE;
        player.setTint(style.tint);
        player.setAlpha(style.alpha);
    }

    startPlayerAttack(player) {
        if (!player) return;
        player.isAttacking = true;
        player.isGuarding = false;
        player.isDodging = false;
        this.applyPlayerStyle(player, 'ATTACKING');
    }

    endPlayerAttack(player, nextState = 'IDLE') {
        if (!player) return;
        player.isAttacking = false;
        this.applyPlayerStyle(player, nextState);
    }

    startPlayerGuard(player) {
        if (!player) return;
        player.isAttacking = false;
        player.isGuarding = true;
        player.isDodging = false;
        this.applyPlayerStyle(player, 'GUARDING');
    }

    endPlayerGuard(player, nextState = 'IDLE') {
        if (!player) return;
        player.isGuarding = false;
        this.applyPlayerStyle(player, nextState);
    }

    startPlayerDodge(player, direction = { x: 1, y: 0 }, speed = 280) {
        if (!player || !player.body) return;
        player.isAttacking = false;
        player.isGuarding = false;
        player.isDodging = true;
        this.applyPlayerStyle(player, 'DODGING');

        const normalized = this.normalizeVector(direction, { x: 1, y: 0 });
        player.body.setVelocity(normalized.x * speed, normalized.y * speed);
    }

    endPlayerDodge(player, nextState = 'IDLE') {
        if (!player) return;
        player.isDodging = false;
        this.applyPlayerStyle(player, nextState);
    }

    // ─── Damage Calculation ──────────────────────────────────────────

    calculateDamage(attackerOrBaseDamage, targetOrComboCount = 0, options = {}) {
        if (typeof attackerOrBaseDamage === 'number') {
            const baseDamage = attackerOrBaseDamage;
            const comboCount = typeof targetOrComboCount === 'number' ? targetOrComboCount : 0;
            const multiplier = 1 + (comboCount * this.config.combo.multiplier);
            return Math.floor(baseDamage * multiplier);
        }

        const attacker = attackerOrBaseDamage;
        const target = targetOrComboCount;
        const comboCount = options.comboCount || 0;
        const attackPower = options.baseDamage ?? this.resolveStat(attacker, ['attackPower', 'attack', 'damage'], this.config.damage);
        const defense = this.resolveStat(target, ['defense', 'armor', 'guard'], 0);
        const comboMultiplier = 1 + (comboCount * this.config.combo.multiplier);
        const rawDamage = Math.max(1, attackPower - defense);
        return Math.max(1, Math.floor(rawDamage * comboMultiplier));
    }

    // ─── Hitstop (Freeze Frames) ─────────────────────────────────────

    applyHitstop(targets, duration = null) {
        const ms = duration || this.config.hitstop;
        const targetsList = Array.isArray(targets) ? targets.filter(Boolean) : [targets].filter(Boolean);
        if (!targetsList.length) return;

        const savedVelocities = targetsList.map(t => {
            if (!t || !t.body) return null;
            return { x: t.body.velocity.x, y: t.body.velocity.y };
        });

        targetsList.forEach(t => {
            if (t && t.body) t.body.setVelocity(0, 0);
        });

        this.scene.time.delayedCall(ms, () => {
            targetsList.forEach((t, i) => {
                if (!t || !t.body || !t.active) return;
                if (savedVelocities[i]) {
                    t.body.setVelocity(savedVelocities[i].x, savedVelocities[i].y);
                }
            });
        });
    }

    // ─── Knockback ───────────────────────────────────────────────────

    applyKnockback(targetOrAttacker, directionOrTarget, force = null, lift = -50) {
        let target = targetOrAttacker;
        let direction = directionOrTarget;

        // Backwards compatibility: applyKnockback(attacker, target)
        if (targetOrAttacker?.body && directionOrTarget?.body) {
            target = directionOrTarget;
            direction = this.getDirectionVector(targetOrAttacker, target, { x: target.x >= targetOrAttacker.x ? 1 : -1, y: 0 });
        }

        if (!target || !target.body) return;

        const normalized = this.normalizeVector(direction, { x: target.flipX ? -1 : 1, y: 0 });
        const kb = force || this.config.knockback;
        target.body.setVelocity(normalized.x * kb, normalized.y * kb + lift);
    }

    // ─── Hit Resolution (full pipeline) ──────────────────────────────

    resolveHit(attacker, target, hitConfig = {}) {
        if (!attacker || !target) return false;
        if (target.isInvulnerable) return false;

        const attackerSprite = hitConfig.attackerSprite || attacker.sprite || attacker;
        const targetSprite = hitConfig.targetSprite || target.sprite || target;
        const comboCount = hitConfig.comboCount || 0;
        const finalDamage = this.calculateDamage(attacker, target, {
            comboCount,
            baseDamage: hitConfig.baseDamage
        });

        const fallbackDirection = hitConfig.attackDirection
            || attackerSprite?.attackDirection
            || attackerSprite?.facingDirection
            || { x: attackerSprite?.flipX ? -1 : 1, y: 0 };

        const impactDirection = this.normalizeVector(
            hitConfig.direction || this.getDirectionVector(attackerSprite, targetSprite, fallbackDirection),
            fallbackDirection
        );

        let tookDamage = true;
        if (typeof target.takeDamage === 'function') {
            tookDamage = target.takeDamage(finalDamage, {
                attacker,
                attackerSprite,
                targetSprite,
                direction: impactDirection,
                returnState: hitConfig.returnState
            }) !== false;
        }

        if (!tookDamage) return false;

        if (hitConfig.applyKnockback !== false && targetSprite?.body) {
            this.applyKnockback(targetSprite, impactDirection, hitConfig.knockbackForce || this.config.knockback, hitConfig.knockbackLift ?? -50);
        }

        if (hitConfig.applyHitstop !== false) {
            this.applyHitstop([attackerSprite, targetSprite], hitConfig.hitstopDuration || this.config.hitstop);
        }

        return {
            damage: finalDamage,
            direction: impactDirection,
            attacker: attackerSprite,
            target: targetSprite
        };
    }
}
