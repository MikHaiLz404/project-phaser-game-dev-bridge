import Phaser from 'phaser';
import { GAME_SCENE_KEY, UI_SCENE_KEY } from './sceneKeys.js';

export class UIScene extends Phaser.Scene {
    constructor() {
        super(UI_SCENE_KEY);
    }

    create() {
        // HP Bar
        this.hpBarBg = this.add.rectangle(100, 30, 200, 20, 0x333333);
        this.hpBar = this.add.rectangle(100, 30, 200, 20, 0x00ff00);
        this.hpBar.setOrigin(0.5);
        this.hpBarBg.setOrigin(0.5);

        this.add.text(100, 30, 'ENEMY HP', {
            fontSize: '10px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Listen for HP changes
        const gameScene = this.scene.get(GAME_SCENE_KEY);
        gameScene.events.on('enemy-hp-changed', (hp) => {
            this.updateHPBar(hp);
        });
    }

    updateHPBar(hp) {
        const percent = Math.max(0, hp / 100);
        this.hpBar.width = 200 * percent;

        if (percent > 0.5) {
            this.hpBar.setFillStyle(0x00ff00);
        } else if (percent > 0.25) {
            this.hpBar.setFillStyle(0xffff00);
        } else {
            this.hpBar.setFillStyle(0xff0000);
        }
    }
}
