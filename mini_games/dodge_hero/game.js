// 1. Class Definition (RunnerScene)
class RunnerScene extends Phaser.Scene {
    constructor() {
        super('runner');
    }

    create() {
        // Background & Aesthetics
        this.add.rectangle(400, 225, 800, 450, 0x1a1a2e);
        this.grid = this.add.grid(400, 225, 800, 450, 40, 40, 0x3333ff, 0.05).setOutlineStyle(0x3333ff);
        
        // Score System
        this.score = 0;
        this.scoreText = this.add.text(16, 16, 'Score: 0', {
            fontFamily: 'Arial',
            fontSize: '24px',
            fill: '#ffffff'
        });

        // Character Initialization
        this.player = this.add.existing(200, 225);
        const circle = this.add.circle(0, 0, 12, 0x00ffff);
        circle.setContext(this.player);
        circle.setOutlineStyle(0xffffff);
        this.physics.add.gameObject(this.player);
        
        // Game State & Systems
        this.obstacles = this.physics.arcade.group();
        this.gameRunning = true;

        // Input Logic
        this.cursors = this.input.keyboard.createCursorKeys();

        // Spawn Routine
        this.time.addEvent({
            delay: 800,
            callback: this.spawnObstacle,
            callbackScope: this,
            loop: true
        });

        // Collision Management
        this.physics.add.collider(this.player, this.obstacles);
        this.physics.add.overlap(this.player, this.obstacles, this.gameOver, null, this);
    }

    update() {
        if (!this.gameRunning) return;

        const speed = 300;
        let moved = false;

        // Handle Inputs
        if (this.cursors.left.isDown) {
            this.player.body.setVelocityX(-speed);
            moved = true;
        } else if (this.cursors.right.isDown) {
            this.player.body.setVelocityX(speed);
            moved = true;
        } else {
            this.player.body.setVelocityX(0);
        }

        if (this.cursors.up.isDown) {
            this.player.body.setVelocityY(-speed);
            moved = true;
        } else if (this.cursors.down.isDown) {
            this.player.body.setVelocityY(speed);
            moved = true;
        } else if (!moved) {
           // Smooth damping for the character
           this.player.body.velocity.x *= 0.95;
           this.player.body.velocity.y *= 0.95;
        }

        // Boundaries
        if (this.player.x < 20) this.player.x = 20;
        if (this.player.x > 780) this.player.x = 780;
        if (this.player.y < 20) this.player.y = 20;
        if (this.player.y > 430) this.player.y = 430;
    }

    spawnObstacle() {
        if (!this.gameRunning) return;

        const x = 850;
        const y = Phaser.Math.Between(50, 400);
        const speedFactor = Math.min(1 + (this.score / 1000), 3);

        const rect = this.add.rectangle(x, y, 40, 30, 0xffbb00);
        this.physics.add.gameObject(rect);
        
        rect.body.setVelocityX(-200 * speedFactor);
        rect.body.setAllowGravity(false);

        // Lifecycle of obstacles
        this.tweens.add({
            targets: rect,
            x: -100,
            y: y,
            duration: 3000 / speedFactor,
            onComplete: () => {
                if (rect.active) {
                    rect.destroy();
                    this.score += 10;
                    this.scoreText.setText(`Score: ${this.score}`);
                }
            }
        });
    }

    gameOver() {
        if (!this.gameRunning) return; // Guard against multiple calls
        this.gameRunning = false;
        this.physics.pause();
        this.player.body.setVelocity(0, 0);
        
        // Score Overlay
        this.add.text(250, 180, 'GAME OVER', {
            fontFamily: 'Arial',
            fontSize: '64px',
            fill: '#ff0000'
        });

        this.add.text(300, 250, `Final Score: ${this.score}`, {
            fontFamily: 'Arial',
            fontSize: '32px',
            fill: '#ffffff'
        });

        this.time.timeScale = 0; 
    }
}

// initialization occurs at the very end of file to ensure all classes are loaded into global scope
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 800,
    height: 450,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        runner: RunnerScene
    }
};

const game = new Phaser.Game(config);
