import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    create() {
        // Background
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Player placeholder
        this.player = this.add.rectangle(400, 300, 32, 48, 0x00ff00);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // Instructions
        this.add.text(400, 20, 'Arrow Keys: Move | SPACE: Attack', {
            fontSize: '14px',
            color: '#ffffff'
        }).setOrigin(0.5, 0);

        // Enemy placeholder
        this.enemy = this.add.rectangle(600, 300, 32, 32, 0xff0000);
        this.physics.add.existing(this.enemy);
        this.enemyHP = 100;

        // Attack cooldown
        this.isAttacking = false;

        // UI Scene
        this.scene.launch('UIScene');
    }

    update(time, delta) {
        // Player movement
        this.player.body.setVelocityX(0);

        if (this.cursors.left.isDown) {
            this.player.body.setVelocityX(-160);
        } else if (this.cursors.right.isDown) {
            this.player.body.setVelocityX(160);
        }

        if (this.cursors.up.isDown && this.player.body.blocked.down) {
            this.player.body.setVelocityY(-330);
        }

        // Attack
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.isAttacking) {
            this.attack();
        }
    }

    attack() {
        this.isAttacking = true;

        // Visual feedback
        this.tweens.add({
            targets: this.player,
            scaleX: 1.3,
            duration: 100,
            yoyo: true,
            onComplete: () => {
                // Check hit
                const dist = Phaser.Math.Distance.Between(
                    this.player.x, this.player.y,
                    this.enemy.x, this.enemy.y
                );

                if (dist < 50) {
                    this.hitEnemy(25);
                }

                this.time.delayedCall(200, () => {
                    this.isAttacking = false;
                });
            }
        });
    }

    hitEnemy(damage) {
        this.enemyHP -= damage;

        // Flash red
        this.enemy.setFillStyle(0xffffff);
        this.time.delayedCall(100, () => {
            this.enemy.setFillStyle(0xff0000);
        });

        // Knockback
        const angle = Phaser.Math.Angle.Between(
            this.player.x, this.player.y,
            this.enemy.x, this.enemy.y
        );
        this.enemy.body.setVelocity(
            Math.cos(angle) * 200,
            Math.sin(angle) * 200
        );

        // Damage number
        const text = this.add.text(this.enemy.x, this.enemy.y - 20, `-${damage}`, {
            fontSize: '16px',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.tweens.add({
            targets: text,
            y: text.y - 30,
            alpha: 0,
            duration: 800,
            onComplete: () => text.destroy()
        });

        // Check death
        if (this.enemyHP <= 0) {
            this.enemyDeath();
        }

        // Update UI
        this.events.emit('enemy-hp-changed', this.enemyHP);
    }

    enemyDeath() {
        // Explosion effect
        this.cameras.main.shake(200, 0.01);

        // Respawn after delay
        this.time.delayedCall(2000, () => {
            this.enemyHP = 100;
            this.enemy.setPosition(600, 300);
            this.events.emit('enemy-hp-changed', this.enemyHP);
        });
    }
}
