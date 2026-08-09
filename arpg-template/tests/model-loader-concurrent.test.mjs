/**
 * model-loader-concurrent.test.mjs
 * =================================
 *
 * Regression for PR #3 P2: concurrent loadModel() callers must share only the
 * import/factory task. addToWorld and bridge event side effects belong to each
 * caller, not to the caller that created the in-flight Promise.
 */

import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.addEventListener = () => {};
global.removeEventListener = () => {};

const [{ threeWorld }, { ThreeBridge }, { clearCache, loadModel, stats }] = await Promise.all([
    import('../src/threejs/ThreeWorld.js'),
    import('../src/threejs/ThreeBridge.js'),
    import('../src/threejs/ModelLoader.js'),
]);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitFor(predicate, message) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(message);
}

const added = [];
const loadedEvents = [];
const originalAdd = threeWorld.add;
threeWorld.add = (group) => added.push(group);
let unsubscribe = () => {};

try {
    clearCache();
    ThreeBridge.clear();
    unsubscribe = ThreeBridge.on('model-loaded', (payload) => loadedEvents.push(payload));

    let releaseFactory;
    globalThis.__modelLoaderConcurrentGate = new Promise((resolve) => { releaseFactory = resolve; });
    globalThis.__modelLoaderConcurrentFixtureStarted = false;
    globalThis.__modelLoaderConcurrentFactoryCalls = 0;

    const fixtureUrl = `${pathToFileURL(new URL('./fixtures/concurrent-model-factory.mjs', import.meta.url).pathname).href}?case=${Date.now()}`;

    // The first caller is scene-owned and intentionally suppresses both side
    // effects. The concurrent default caller must still receive its own add +
    // event contract once the shared factory task resolves.
    const silentCaller = loadModel(fixtureUrl, {}, { addToWorld: false, emitEvents: false });
    await waitFor(
        () => globalThis.__modelLoaderConcurrentFixtureStarted,
        'fixture import did not enter its deferred factory gate',
    );
    const defaultCaller = loadModel(fixtureUrl);

    releaseFactory();
    const [silentGroup, defaultGroup] = await Promise.all([silentCaller, defaultCaller]);

    assert(globalThis.__modelLoaderConcurrentFactoryCalls === 1,
        `factory calls=${globalThis.__modelLoaderConcurrentFactoryCalls}, expected 1 shared construction`);
    assert(silentGroup !== defaultGroup,
        'concurrent callers received the same mutable group instead of independent instances');
    assert(added.length === 1,
        `default caller addToWorld side effect count=${added.length}, expected 1`);
    assert(added[0] === defaultGroup,
        'default caller did not add its own returned group');
    assert(loadedEvents.length === 1,
        `default caller model-loaded event count=${loadedEvents.length}, expected 1`);
    assert(loadedEvents[0].group === defaultGroup,
        'model-loaded event did not carry the default caller group');
    assert(silentGroup.parent === null,
        'silent caller group was unexpectedly auto-added');
    assert(stats().inFlight === 0, `inFlight=${stats().inFlight}, expected 0 after resolution`);

    console.log('PASS — ModelLoader preserves independent side-effect contracts for concurrent callers');
} finally {
    unsubscribe();
    threeWorld.add = originalAdd;
    ThreeBridge.clear();
    clearCache();
    delete globalThis.__modelLoaderConcurrentGate;
    delete globalThis.__modelLoaderConcurrentFixtureStarted;
    delete globalThis.__modelLoaderConcurrentFactoryCalls;
}
