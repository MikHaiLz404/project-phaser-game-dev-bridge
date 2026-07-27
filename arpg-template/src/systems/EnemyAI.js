// Enemy AI State Machine — based on MengTo enemy-ai bridge skill
// See bridge-skills/enemy-ai/SKILL.md for full implementation reference

import Phaser from 'phaser';

export class EnemyAI {
    constructor(scene, sprite, config = {}) {
        this.scene = scene;
        this.sprite = sprite || null;
        this.config = {
            hp: 50,
            speed: 60,
            sightRange: 150,
            attackRange: 30,
            attackDamage: 10,
            attackPower: 10,
            attackCooldown: 2000,
            leashRange: 300,
            attackDuration: 600,
            hitStunDuration: 120,
            invulnerabilityDuration: 160,
            defense: 0,
            idleColor: 0xff0000,
            patrolColor: 0xff6600,
            chaseColor: 0xff0000,
            attackColor: 0xff00ff,
            cooldownColor: 0x990000,
            retreatColor: 0x666666,
            ...config
        };

        this.config.attackPower = this.config.attackPower ?? this.config.attackDamage;
        this.config.defense = this.config.defense ?? 0;

        this.state = 'IDLE';
        this.hp = this.config.hp;
        this.maxHp = this.config.hp;
        this.stateTimer = 0;
        this.isInvulnerable = false;
        this.hitReturnState = 'CHASE';
        this.stateBeforeHit = 'CHASE';

        this.stats = {
            attackPower: this.config.attackPower,
            defense: this.config.defense,
            hp: this.hp,
            maxHp: this.maxHp
        };

        // Defer patrol generation until sprite is available
        if (this.sprite && this.sprite.x != null && this.sprite.y != null) {
            this.spawnX = this.sprite.x;
            this.spawnY = this.sprite.y;
            this.patrolTargets = this.generatePatrolPoints();
            this.patrolIndex = 0;
        } else {
            this.spawnX = 0;
            this.spawnY = 0;
            this.patrolTargets = [];
            this.patrolIndex = 0;
        }
    }

    /**
     * Late-bind a sprite after construction (e.g. when the sprite is
     * created after the EnemyAI instance). Sets spawn coords and
     * generates patrol points immediately.
     */
    registerEnemy(sprite) {
        if (!sprite) return;
        this.sprite = sprite;
        this.spawnX = sprite.x;
        this.spawnY = sprite.y;
        this.stats.hp = this.hp;
        this.stats.maxHp = this.maxHp;
        this.patrolTargets = this.generatePatrolPoints();
        this.patrolIndex = 0;
    }

    generatePatrolPoints() {
        const points = [];
        const radius = this.config.leashRange * 0.6;
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5;
            points.push({
                x: this.spawnX + Math.cos(angle) * radius,
                y: this.spawnY + Math.sin(angle) * radius
            });
        }
        return points;
    }

    setState(newState) {
        if (!this.sprite || !this.sprite.active) return;
        this.onExitState(this.state);
        this.state = newState;
        this.onEnterState(newState);
    }

    getStateTint(state) {
        switch (state) {
            case 'IDLE': return this.config.idleColor;
            case 'PATROL': return this.config.patrolColor;
            case 'CHASE': return this.config.chaseColor;
            case 'ATTACK': return this.config.attackColor;
            case 'COOLDOWN': return this.config.cooldownColor;
            case 'RETREAT': return this.config.retreatColor;
            case 'HIT': return 0xffffff;
            default: return this.config.idleColor;
        }
    }

    getRecoveryStateForHit() {
        if (this.state === 'RETREAT') return 'RETREAT';
        return 'CHASE';
    }

    onEnterState(state) {
        if (!this.sprite || !this.sprite.body) return;

        switch (state) {
            case 'IDLE':
                this.sprite.body.setVelocity(0);
                this.sprite.setTint(this.getStateTint(state));
                this.stateTimer = 1500 + Math.random() * 1000;
                break;
            case 'PATROL':
                this.sprite.body.setVelocity(0);
                this.sprite.setTint(this.getStateTint(state));
                break;
            case 'CHASE':
                this.sprite.setTint(this.getStateTint(state));
                break;
            case 'ATTACK':
                this.sprite.body.setVelocity(0);
                this.sprite.setTint(this.getStateTint(state));
                this.showTelegraph();
                this.stateTimer = this.config.attackDuration;
                break;
            case 'COOLDOWN':
                this.sprite.body.setVelocity(0);
                this.sprite.setTint(this.getStateTint(state));
                this.stateTimer = this.config.attackCooldown;
                break;
            case 'RETREAT':
                this.sprite.setTint(this.getStateTint(state));
                break;
            case 'HIT':
                this.sprite.body.setVelocity(0, 0);
                this.sprite.setTint(this.getStateTint(state));
                this.sprite.setAlpha(0.85);
                this.stateTimer = this.config.hitStunDuration;
                break;
        }
    }

    onExitState(_state) {
        // Cleanup hooks for future use.
    }

    update(time, delta, player) {
        if (!this.sprite || !this.sprite.active) return;

        switch (this.state) {
            case 'IDLE':
                this.updateIdle(player, delta);
                break;
            case 'PATROL':
                this.updatePatrol(player);
                break;
            case 'CHASE':
                this.updateChase(player);
                break;
            case 'ATTACK':
                this.updateAttack(player, delta);
                break;
            case 'COOLDOWN':
                this.updateCooldown(delta);
                break;
            case 'RETREAT':
                this.updateRetreat();
                break;
            case 'HIT':
                this.updateHit(delta);
                break;
        }
    }

    updateIdle(player, delta) {
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
            this.setState('PATROL');
            return;
        }

        const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, player.x, player.y);
        if (dist < this.config.sightRange) {
            this.setState('CHASE');
        }
    }

    updatePatrol(player) {
        const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, player.x, player.y);
        if (dist < this.config.sightRange) {
            this.setState('CHASE');
            return;
        }

        const target = this.patrolTargets[this.patrolIndex];
        const angle = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, target.x, target.y);
        this.sprite.body.setVelocity(
            Math.cos(angle) * this.config.speed * 0.5,
            Math.sin(angle) * this.config.speed * 0.5
        );

        const distToTarget = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
        if (distToTarget < 10) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolTargets.length;
            this.setState('IDLE');
        }
    }

    updateChase(player) {
        const distToSpawn = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, this.spawnX, this.spawnY);
        if (distToSpawn > this.config.leashRange) {
            this.setState('RETREAT');
            return;
        }

        const distToPlayer = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, player.x, player.y);
        if (distToPlayer < this.config.attackRange) {
            this.setState('ATTACK');
            return;
        }

        const angle = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, player.x, player.y);
        this.sprite.body.setVelocity(
            Math.cos(angle) * this.config.speed,
            Math.sin(angle) * this.config.speed
        );
    }

    updateAttack(player, delta) {
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
            const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, player.x, player.y);
            if (dist < this.config.attackRange + 20) {
                const direction = this.getAttackDirection(player);
                this.scene.events.emit('enemy-attack', {
                    damage: this.config.attackDamage,
                    source: this,
                    sprite: this.sprite,
                    direction
                });
            }
            this.setState('COOLDOWN');
        }
    }

    updateCooldown(delta) {
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
            this.setState('CHASE');
        }
    }

    updateRetreat() {
        const distToSpawn = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, this.spawnX, this.spawnY);
        if (distToSpawn < 10) {
            this.hp = this.maxHp;
            this.stats.hp = this.hp;
            this.sprite.body.setVelocity(0);
            this.sprite.setAlpha(1);
            this.setState('IDLE');
            this.scene.events.emit('enemy-hp-changed', this.hp, this.maxHp, this);
            return;
        }

        const angle = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.spawnX, this.spawnY);
        this.sprite.body.setVelocity(
            Math.cos(angle) * this.config.speed,
            Math.sin(angle) * this.config.speed
        );
    }

    updateHit(delta) {
        this.stateTimer -= delta;
        if (this.stateTimer > 0) return;

        if (!this.sprite || !this.sprite.active) return;

        this.isInvulnerable = false;
        this.sprite.setAlpha(1);

        if (this.hp <= 0) return;

        this.setState(this.hitReturnState || this.getRecoveryStateForHit());
    }

    getAttackDirection(player) {
        const angle = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, player.x, player.y);
        return {
            x: Math.cos(angle),
            y: Math.sin(angle)
        };
    }

    takeDamage(amount, options = {}) {
        if (this.isInvulnerable || !this.sprite || !this.sprite.active) return false;

        this.hp = Math.max(0, this.hp - amount);
        this.stats.hp = this.hp;
        this.stats.maxHp = this.maxHp;
        this.stateBeforeHit = this.state;
        this.hitReturnState = options.returnState || this.getRecoveryStateForHit();
        this.isInvulnerable = true;

        if (this.sprite.body) {
            this.sprite.body.setVelocity(0, 0);
        }

        this.setState('HIT');
        this.sprite.setTint(0xffffff);

        this.scene.tweens.add({
            targets: this.sprite,
            alpha: 0.5,
            duration: this.config.invulnerabilityDuration,
            yoyo: true,
            repeat: 1,
            onComplete: () => {
                if (!this.sprite || !this.sprite.active) return;
                this.sprite.setAlpha(1);
                if (this.hp > 0) {
                    this.isInvulnerable = false;
                    this.sprite.setTint(this.getStateTint(this.state));
                }
            }
        });

        this.scene.events.emit('enemy-hp-changed', this.hp, this.maxHp, this);

        if (this.hp <= 0) {
            this.isInvulnerable = false;
            this.scene.events.emit('enemy-died', this);
        }

        return true;
    }

    showTelegraph() {
        const telegraph = this.scene.add.circle(this.sprite.x, this.sprite.y, 20, 0xff0000, 0.4);
        this.scene.tweens.add({
            targets: telegraph,
            alpha: 0,
            scale: 2,
            duration: 400,
            onComplete: () => telegraph.destroy()
        });
    }
}
