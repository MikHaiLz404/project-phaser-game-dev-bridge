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
 *   - One in-flight canonical-template Promise per URL — concurrent calls share import/factory work.
 *   - Successful templates are cached; every caller receives an independent clone.
 *   - Placement and bridge events are caller-local and run after the shared task resolves.
 *
 * Errors:
 *   - Emits 'model-load-fail' on ThreeBridge so the UI can show a fallback.
 */

import { threeWorld } from './ThreeWorld.js';
import { ThreeBridge } from './ThreeBridge.js';

const inflight = new Map();   // url → Promise<detached canonical THREE.Group>
const cache = new Map();      // url → detached canonical THREE.Group (clone-safe)

function loadTemplate(url, spec, options) {
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    if (inflight.has(url)) return inflight.get(url);

    // A factory can itself support addToWorld. Never allow its first caller to
    // decide that side effect for every concurrent caller; the loader owns
    // placement after the shared construction task resolves.
    const factoryOptions = { ...options, addToWorld: false };
    delete factoryOptions.emitEvents;

    const task = (async () => {
        const mod = await import(/* @vite-ignore */ url);
        const factory = mod.default ?? mod.createXxxModel ?? mod.createModel;
        if (typeof factory !== 'function') {
            throw new Error(`Model factory at ${url} did not export a function`);
        }
        const template = factory(spec, factoryOptions);
        if (!template || !(template.isObject3D)) {
            throw new Error(`Model factory at ${url} returned non-Object3D`);
        }
        cache.set(url, template);
        return template;
    })();

    inflight.set(url, task);
    // Delete the in-flight entry on either outcome without creating an ignored
    // rejecting promise from finally(). Each caller handles its own event path.
    task.then(
        () => inflight.delete(url),
        () => inflight.delete(url),
    );
    return task;
}

/**
 * Load a model instance. Import/factory work is shared by URL, but each caller
 * receives its own clone and independently applies addToWorld/event behavior.
 *
 * @param {string} url — path to the factory module (e.g. '/models/createKnifeModel.js')
 * @param {object} [spec] — passed to the factory as first argument on cache miss
 * @param {object} [options] — caller-local placement/event options
 * @returns {Promise<THREE.Group>}
 */
export async function loadModel(url, spec = {}, options = {}) {
    const emitEvents = options.emitEvents !== false;
    const started = performance.now();
    let template;
    try {
        template = await loadTemplate(url, spec, options);
    } catch (err) {
        if (emitEvents) ThreeBridge.emit('model-load-fail', { url, error: err });
        throw err;
    }

    // The cache remains detached and immutable to caller placement. Every
    // caller gets an independent Object3D tree, including the first caller.
    const group = template.clone(true);
    if (emitEvents) {
        ThreeBridge.emit('model-loaded', {
            url,
            group,
            took: performance.now() - started,
        });
    }
    if (options.addToWorld !== false) {
        threeWorld.add(group);
    }
    return group;
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