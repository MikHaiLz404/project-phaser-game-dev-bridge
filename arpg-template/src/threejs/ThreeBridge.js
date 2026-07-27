/**
 * ThreeBridge.js — the event bus between the Phaser 2D layer and the
 * Three.js 3D layer. Replaces direct coupling: scenes/systems in Phaser
 * talk to the 3D world via ThreeBridge.emit(), and the 3D world talks
 * back via ThreeBridge.on().
 *
 * Design constraints:
 *   - No Phaser imports here — ThreeBridge stays usable from pure Three.js
 *     code (ModelLoader, raycast handlers) without dragging in Phaser.
 *   - Synchronous emit (no promises). 3D events are dispatched on the next
 *     animation frame, so ordering is preserved by the browser loop.
 *   - Listeners are matched by string `topic` ('pointer-move', 'pick-result',
 *     'model-loaded', etc). Wildcards '*' match everything.
 *
 * Topics in current use:
 *   - 'model-loaded'    { url, group, took }         3D → Phaser
 *   - 'model-load-fail' { url, error }              3D → Phaser
 *   - 'pick-result'     { ray, hits: Object3D[] }   3D → Phaser (raycast hits)
 *   - 'camera-sync'     { x, y, zoom }              Phaser → 3D (camera follow)
 *   - 'pause-3d' / 'resume-3d'                      Phaser → 3D
 */

const listeners = new Map(); // topic → Set<fn>

export const ThreeBridge = {
    /**
     * Subscribe to a topic. Returns an unsubscribe handle.
     * @param {string} topic — event name, or '*' for everything
     * @param {(payload: any) => void} fn
     * @returns {() => void}
     */
    on(topic, fn) {
        if (typeof topic !== 'string' || typeof fn !== 'function') {
            console.warn('[ThreeBridge] on() needs (string, function)');
            return () => {};
        }
        if (!listeners.has(topic)) listeners.set(topic, new Set());
        listeners.get(topic).add(fn);
        return () => listeners.get(topic)?.delete(fn);
    },

    /**
     * Publish a topic with a payload. Synchronous — all listeners run
     * in registration order before this function returns.
     * @param {string} topic
     * @param {any} payload
     */
    emit(topic, payload) {
        const fns = listeners.get(topic);
        if (fns) for (const fn of fns) {
            try { fn(payload); }
            catch (err) { console.error(`[ThreeBridge] listener for "${topic}" threw:`, err); }
        }
        const wild = listeners.get('*');
        if (wild) for (const fn of wild) {
            try { fn({ topic, payload }); }
            catch (err) { console.error('[ThreeBridge] wildcard listener threw:', err); }
        }
    },

    /** Drop every listener — call from full game teardown. */
    clear() { listeners.clear(); },

    /** Debug helper. */
    get topics() { return [...listeners.keys()]; },
};