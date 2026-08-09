import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { GameScene } from './scenes/GameScene.js';
import { CombatTestScene } from './scenes/CombatTestScene.js';
import { UIScene } from './scenes/UIScene.js';
import { ThreeOverlayScene } from './scenes/ThreeOverlayScene.js';

const config = {
    type: Phaser.AUTO,
    // Phaser canvas is appended inside #game-container (see index.html).
    // parent lets Phaser attach its canvas to our stacking layer.
    parent: 'game-container',
    width: 960,
    height: 540,
    pixelArt: false,
    transparent: false,         // LAYER 3: opaque so sprites render visibly (test Phaser layer first)
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },   // gravity handled in 3D world — keep 2D zero-g for HUD/UI
            debug: false,
        },
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // ThreeOverlayScene is registered BEFORE GameScene so it can be launched
    // as a parallel scene without affecting the active scene chain.
    scene: [BootScene, PreloadScene, ThreeOverlayScene, GameScene, CombatTestScene, UIScene],
};

const game = new Phaser.Game(config);

if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
    window.__game = game;
    // Keep every debug-only capability under the documented window.__three
    // hook. Merging into one shared object prevents the async world import
    // from replacing the overlay lifecycle seam.
    const debugApi = window.__three ?? {};
    window.__three = debugApi;
    import('./threejs/ThreeWorld.js').then(({ threeWorld }) => {
        debugApi.world = threeWorld;
    });

    // Live debug overlay (only when ?debug=1 in URL).
    const overlay = document.getElementById('debug-overlay');
    if (overlay) {
        overlay.style.display = 'block';
        const fpsEl = document.getElementById('dbg-fps');
        const objEl = document.getElementById('dbg-objects');
        const sceneEl = document.getElementById('dbg-scene');
        let dbgTimer = window.setInterval(() => {
            fpsEl.textContent = String(Math.round(game.loop.actualFps));
            objEl.textContent = String(debugApi.world?.stats?.objects ?? 0);
            const active = game.scene.getScenes(true)[0];
            sceneEl.textContent = active?.scene?.key ?? '--';
        }, 250);
        let disposed = false;

        const disposeDebugOverlay = () => {
            if (disposed) return;
            disposed = true;

            if (dbgTimer !== null) {
                window.clearInterval(dbgTimer);
                dbgTimer = null;
            }
            window.removeEventListener('beforeunload', disposeDebugOverlay);
            game.events.off('destroy', disposeDebugOverlay);
            overlay.style.display = 'none';

            if (debugApi.debugOverlay?.dispose === disposeDebugOverlay) {
                delete debugApi.debugOverlay;
            }
        };

        window.addEventListener('beforeunload', disposeDebugOverlay);
        game.events.once('destroy', disposeDebugOverlay);
        import.meta.hot?.dispose(disposeDebugOverlay);

        // Gated runtime seam for lifecycle acceptance. It stays under the
        // existing documented debug hook and removes itself on disposal.
        debugApi.debugOverlay = { dispose: disposeDebugOverlay };
    }
}