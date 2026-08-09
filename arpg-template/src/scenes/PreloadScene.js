import Phaser from 'phaser';
import { validateEnemyCatalog, validateItemCatalog } from '../data/validateGameData.js';

export const GAME_DATA_ASSETS = Object.freeze({
    enemies: new URL('../data/enemies.json', import.meta.url).href,
    items: new URL('../data/items.json', import.meta.url).href,
});

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super('Preload');
    }

    preload() {
        // src/data is the single canonical data location. Vite resolves these
        // module-relative URLs in development and emits the same files as
        // hashed build assets in production; no public/data mirror is needed.
        this.load.json('enemies', GAME_DATA_ASSETS.enemies);
        this.load.json('items', GAME_DATA_ASSETS.items);

        // Placeholder assets (replace with real ones)
        // this.load.spritesheet('player', 'assets/player.png', { frameWidth: 32, frameHeight: 48 });
        // this.load.spritesheet('slime', 'assets/slime.png', { frameWidth: 32, frameHeight: 32 });
        // this.load.tilemapTiledJSON('level1', 'assets/level1.json');
        // this.load.image('tiles', 'assets/tileset.png');
    }

    create() {
        validateEnemyCatalog(this.cache.json.get('enemies'));
        validateItemCatalog(this.cache.json.get('items'));

        // Phase 1: Boot Three.js 3D background layer first, then route to CombatTest
        this.scene.launch('ThreeOverlayScene', {});
        this.scene.start('CombatTest');
    }
}
