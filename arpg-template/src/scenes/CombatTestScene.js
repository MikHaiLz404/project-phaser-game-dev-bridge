import Phaser from 'phaser';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyAI } from '../systems/EnemyAI';
import { InventoryManager } from '../systems/InventoryManager.js';

export class CombatTestScene extends Phaser.Scene {
    constructor() {
        super('CombatTest');
        this.player = null;
        this.enemy = null;
        this.combatSystem = null;
        this.enemyAI = null;
        this.inventory = null;
    }

    preload() {
        // Phase 1 Option A: generate sprites procedurally via Phaser Graphics → Texture
        // Player: green humanoid (head + body + arm holding sword)
        const pg = this.make.graphics({ x: 0, y: 0, add: false });
        // body
        pg.fillStyle(0x00cc44, 1); pg.fillRect(10, 14, 12, 22);
        // head
        pg.fillStyle(0xffd39a, 1); pg.fillRect(11, 6, 10, 10);
        // eyes
        pg.fillStyle(0x000000, 1); pg.fillRect(13, 9, 2, 2); pg.fillRect(17, 9, 2, 2);
        // sword
        pg.fillStyle(0xcccccc, 1); pg.fillRect(24, 16, 3, 12);
        pg.fillStyle(0xffdd00, 1); pg.fillRect(22, 16, 7, 2);
        pg.generateTexture('player', 32, 48);
        pg.destroy();

        // Enemy: red slime (rounded blob with eyes)
        const eg = this.make.graphics({ x: 0, y: 0, add: false });
        eg.fillStyle(0xff4444, 1);
        eg.fillRoundedRect(2, 8, 28, 20, 6);
        eg.fillStyle(0xffffff, 1); eg.fillRect(8, 12, 5, 5); eg.fillRect(19, 12, 5, 5);
        eg.fillStyle(0x000000, 1); eg.fillRect(10, 14, 2, 2); eg.fillRect(21, 14, 2, 2);
        eg.fillStyle(0xaa0000, 1); eg.fillRect(12, 20, 8, 2);
        eg.generateTexture('enemy', 32, 32);
        eg.destroy();
    }

    create() {
        // LAYER 3: opaque background so we can verify Phaser renders anything at all
        this.cameras.main.setBackgroundColor('#0a0a14');

        // 1. Create Player (Sprite — supports setTint for AI feedback)
        this.player = this.add.sprite(200, 300, 'player');
        this.player.setDepth(100);
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

        // 2. Create Enemy from the canonical catalog loaded by PreloadScene.
        const enemyId = 'slime';
        const enemyData = this.cache.json.get('enemies')?.[enemyId];
        if (!enemyData) {
            throw new Error(`Enemy data is not loaded for "${enemyId}"`);
        }
        const enemyColors = Object.fromEntries(
            Object.entries(enemyData.colors).map(([key, value]) => [key, Number(value)]),
        );
        this.enemy = this.add.sprite(enemyData.spawnX, enemyData.spawnY, 'enemy');
        this.enemy.setDisplaySize(enemyData.displayWidth, enemyData.displayHeight);
        this.enemy.setDepth(100);
        this.physics.add.existing(this.enemy);
        this.enemy.body.setAllowGravity(false);
        this.enemy.body.setCollideWorldBounds(true);
        
        this.enemy.enemyId = enemyId;
        this.enemy.enemyData = enemyData;
        this.enemy.hp = enemyData.hp;
        this.enemy.maxHp = enemyData.hp;
        this.enemy.isInvulnerable = false;
        this.enemy.isAttacking = false;
        this.enemy.isGuarding = false;
        this.enemy.isDodging = false;
        
        // 3. Initialize Systems — after both sprites are ready
        this.combatSystem = new CombatSystem(this);
        this.enemyAI = new EnemyAI(this, this.enemy, { ...enemyData, ...enemyColors });
        this.inventory = new InventoryManager(this, 20);

        // 4. Physics Overlaps
        this.physics.add.overlap(this.player, this.enemy, this.handleCollision, null, this);

        // 5. HUD / UI
        this.add.text(10, 10, 'POC: ARPG with Phaser', { fontSize: '24px', fill: '#ffffff' });
        this.add.text(10, 40, 'WASD: Move | Space: Attack | G: Guard | D: Dodge', { fontSize: '16px', fill: '#ffffff' });
        
        this.hpBarBg = this.add.rectangle(100, 30, 200, 20, 0x333333);
        this.hpBar = this.add.rectangle(100, 30, 200, 20, 0x00ff00);
        this.hpBar.setOrigin(0.5);
        this.hpBarBg.setOrigin(0.5);

        // 6. Input Handling — use Phaser keyboard API for reliable key tracking
        this.keys = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
            G: Phaser.Input.Keyboard.KeyCodes.G,
        });

        // Initial HUD Update
        this.updateHUD();

        console.log("✅ CombatTestScene Initialized with Visual Proxies.");
    }

    handleInput() {
        // Movement (held keys — continuous)
        const speed = 200;
        let vx = 0, vy = 0;

        if (this.keys.A.isDown) vx = -speed;
        else if (this.keys.D.isDown) vx = speed;
        if (this.keys.W.isDown) vy = -speed;
        else if (this.keys.S.isDown) vy = speed;

        // Normalize diagonal
        if (vx !== 0 && vy !== 0) {
            const norm = Math.SQRT1_2;
            vx *= norm;
            vy *= norm;
        }

        if (!this.player.isAttacking && !this.player.isGuarding && !this.player.isDodging) {
            this.player.body.setVelocity(vx, vy);
        }

        // Actions (single-press)
        if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
            if (!this.player.isAttacking) this.performAttack();
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.G)) {
            this.player.isGuarding = !this.player.isGuarding;
            this.player.setTint(this.player.isGuarding ? 0x0000ff : 0xffffff);
        }
    }

    performAttack() {
        if (this.player.isAttacking) return;
        this.player.isAttacking = true;
        this.player.setTint(0xffffff); // Visual feedback for attack

        // Call Combat System — uses startPlayerAttack(player, enemy) to
        // match the actual CombatSystem API (no .attack method exists).
        this.combatSystem.startPlayerAttack(this.player, this.enemy);
    }

    handleCollision(attacker, target) {
        // The CombatSystem handles the heavy lifting of resolution
        if (attacker === this.player && target === this.enemy) {
            this.combatSystem.startPlayerAttack(this.player, this.enemy);
        }
    }

    update() {
        const time = this.time.now;
        const delta = this.game.loop.delta;

        // Read input every frame
        this.handleInput();

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
