/**
 * ModelLoader.js — async loader for img2threejs-generated THREE.Group
 * factories. A factory is a JS module that exports a default function:
 *
 *   export default function createXxxModel(spec, options) {
 *       return new THREE.Group(); // fully built, lit, ready to add
 *   }
 *
 * img2threejs outputs exactly this shape (see ~/GitHub/img2threejs/SKILL.md
 * step 6 — `forge/stage3_build/generate_threejs_factory.py`). Drop the
 * generated factory into /public/models/ and reference it by URL.
 *
 * Caching:
 *   - One in-flight Promise per URL — concurrent calls share the same load.
 *   - Successful loads cached so repeat spawns are free.
 *
 * Errors:
 *   - Emits 'model-load-fail' on ThreeBridge so the UI can show a fallback.
 */

import { threeWorld } from './ThreeWorld.js';
import { ThreeBridge } from './ThreeBridge.js';

const inflight = new Map();   // url → Promise<THREE.Group>
const cache = new Map();      // url → THREE.Group (clone-safe)

/**
 * @param {string} url — path to the factory module (e.g. '/models/createKnifeModel.js')
 * @param {object} [spec] — passed to the factory as first argument
 * @param {object} [options] — passed to the factory as second argument
 * @returns {Promise<THREE.Group>}
 */
export async function loadModel(url, spec = {}, options = {}) {
    const emitEvents = options.emitEvents !== false;
    if (cache.has(url)) {
        // Clone so each consumer can position/rotate independently.
        return cache.get(url).clone(true);
    }
    if (inflight.has(url)) {
        return inflight.get(url);
    }

    const started = performance.now();
    const promise = (async () => {
        let mod;
        try {
            mod = await import(/* @vite-ignore */ url);
        } catch (err) {
            if (emitEvents) ThreeBridge.emit('model-load-fail', { url, error: err });
            throw err;
        }
        const factory = mod.default ?? mod.createXxxModel ?? mod.createModel;
        if (typeof factory !== 'function') {
            const err = new Error(`Model factory at ${url} did not export a function`);
            if (emitEvents) ThreeBridge.emit('model-load-fail', { url, error: err });
            throw err;
        }
        const group = factory(spec, options);
        if (!group || !(group.isObject3D)) {
            const err = new Error(`Model factory at ${url} returned non-Object3D`);
            if (emitEvents) ThreeBridge.emit('model-load-fail', { url, error: err });
            throw err;
        }
        cache.set(url, group);
        if (emitEvents) {
            ThreeBridge.emit('model-loaded', {
                url,
                group,
                took: performance.now() - started,
            });
        }
        // Auto-add to the world unless the caller asked to manage placement.
        if (options.addToWorld !== false) {
            threeWorld.add(group);
        }
        return group;
    })();

    inflight.set(url, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(url);
    }
}

/** Drop a single model from the cache (next load will refetch). */
export function evict(url) {
    cache.delete(url);
}

/** Drop every cached model — call between levels or on game teardown. */
export function clearCache() {
    cache.clear();
}

/** Debug — current cache size and in-flight count. */
export function stats() {
    return { cached: cache.size, inFlight: inflight.size };
}