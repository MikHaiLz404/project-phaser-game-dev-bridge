import Phaser from 'phaser';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyAI } from '../systems/EnemyAI';

export class CombatTestScene extends Phaser.Scene {
    constructor() {
        super('CombatTest');
        this.player = null;
        this.enemy = null;
        this.combatSystem = null;
        this.enemyAI = null;
    }

    create() {
        // Background
        this.cameras.main.setBackgroundColor('#1a1a2e');
        
        // 1. Create Player (Using Graphics for guaranteed visual)
        // We use a green rectangle to represent the player
        this.player = this.add.rectangle(200, 300, 32, 48, 0x00ff00);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setDrag(1000);
        
        // Player Stats — must be set before systems reference them
        this.player.hp = 100;
        this.player.maxHp = 100;
        this.player.isInvulnerable = false;
        this.player.comboCount = 0;
        this.player.isAttacking = false;
        this.player.isGuarding = false;
        this.player.isDodging = false;

        // 2. Create Enemy (Using Graphics for guaranteed visual)
        // We use a red rectangle to represent the enemy
        const enemyData = {
            type: 'slime',
            hp: 50,
            maxHp: 50,
            speed: 100,
            color: 0xff0000
        };
        this.enemy = this.add.rectangle(600, 300, 32, 32, enemyData.color);
        this.physics.add.existing(this.enemy);
        this.enemy.body.setAllowGravity(false);
        this.enemy.body.setCollideWorldBounds(true);
        
        this.enemy.hp = enemyData.hp;
        this.enemy.maxHp = enemyData.maxHp;
        this.enemy.isInvulnerable = false;
        this.enemy.isAttacking = false;
        this.enemy.isGuarding = false;
        this.enemy.isDodging = false;
        
        // 3. Initialize Systems — after both sprites are ready
        this.combatSystem = new CombatSystem(this);
        this.enemyAI = new EnemyAI(this, this.enemy);

        // 4. Physics Overlaps
        this.physics.add.overlap(this.player, this.enemy, this.handleCollision, null, this);

        // 5. HUD / UI
        this.add.text(10, 10, 'POC: ARPG with Phaser', { fontSize: '24px', fill: '#ffffff' });
        this.add.text(10, 40, 'WASD: Move | Space: Attack | G: Guard | D: Dodge', { fontSize: '16px', fill: '#ffffff' });
        
        this.hpBarBg = this.add.rectangle(100, 30, 200, 20, 0x333333);
        this.hpBar = this.add.rectangle(100, 30, 200, 20, 0x00ff00);
        this.hpBar.setOrigin(0.5);
        this.hpBarBg.setOrigin(0.5);

        // 6. Input Handling
        this.cursors = this.input.keyboard.createCursorKeys();
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.guardKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
        this.dodgeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

        this.input.on('keydown', (key) => this.handleInput(key));
        this.input.on('keyup', (key) => this.handleInput(key));

        // Initial HUD Update
        this.updateHUD();

        console.log("✅ CombatTestScene Initialized with Visual Proxies.");
    }

    handleInput(key) {
        const speed = 200;
        const velocity = { x: 0, y: 0 };

        if (key === 'w' && !this.player.isAttacking && !this.player.isGuarding) velocity.y = -speed;
        if (key === 's' && !this.player.isAttacking && !this.player.isGuarding) velocity.y = speed;
        if (key === 'a' && !this.player.isAttacking && !this.player.isGuarding) velocity.x = -speed;
        if (key === 'd' && !this.player.isAttacking && !this.player.isGuarding) velocity.x = speed;

        this.player.body.setVelocity(velocity.x, velocity.y);

        if (key === ' ') {
            if (!this.player.isAttacking) this.performAttack();
        }
        if (key === 'g') {
            this.player.isGuarding = !this.player.isGuarding;
            this.player.setTint(this.player.isGuarding ? 0x0000ff : 0x00cc44);
        }
        if (key === 'd') {
            if (!this.player.isAttacking && !this.player.isGuarding) {
                this.player.isDodging = true;
                this.player.setTint(0x00ffff);
                this.time.delayedCall(300, () => {
                    this.player.isDodging = false;
                    this.player.setTint(0x00cc44);
                });
            }
        }
    }

    performAttack() {
        if (this.player.isAttacking) return;
        this.player.isAttacking = true;
        this.player.setTint(0xffffff); // Visual feedback for attack
        
        // Call Combat System
        this.combatSystem.attack(this.player, this.enemy);
    }

    handleCollision(attacker, target) {
        // The CombatSystem handles the heavy lifting of resolution
        if (attacker === this.player && target === this.enemy) {
            this.combatSystem.attack(this.player, this.enemy);
        }
    }

    update() {
        const time = this.time.now;
        const delta = this.game.loop.delta;

        // Update HUD
        if (this.hpBar) {
            const hpPercent = (this.enemy.hp / this.enemy.maxHp) * 200;
            this.hpBar.width = Math.max(0, hpPercent);
            
            if (this.enemy.hp <= 0) {
                this.add.text(400, 300, 'VICTORY', { fontSize: '64px', fill: '#00ff00' });
                this.scene.pause();
            }
        }

        // Delegate AI to EnemyAI system (state-machine driven)
        if (this.enemyAI) {
            this.enemyAI.update(time, delta, this.player);
        }
    }

    updateHUD() {
        if (this.hpBar) {
            const hpPercent = (this.enemy.hp / this.enemy.maxHp) * 200;
            this.hpBar.width = Math.max(0, hpPercent);
        }
    }
}
