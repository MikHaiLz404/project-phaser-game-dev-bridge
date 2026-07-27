import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super('Preload');
    }

    preload() {
        // Placeholder assets (replace with real ones)
        // this.load.spritesheet('player', 'assets/player.png', { frameWidth: 32, frameHeight: 48 });
        // this.load.spritesheet('slime', 'assets/slime.png', { frameWidth: 32, frameHeight: 32 });
        // this.load.tilemapTiledJSON('level1', 'assets/level1.json');
        // this.load.image('tiles', 'assets/tileset.png');
        // this.load.json('items', 'data/items.json');
        // this.load.json('enemies', 'data/enemies.json');
    }

    create() {
        // Route to CombatTest scene (default for POC testing)
        // Switch to 'Game' when combat integration is complete
        this.scene.start('CombatTest');
    }
}
