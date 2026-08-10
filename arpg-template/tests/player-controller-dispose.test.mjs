import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import createPlayerController from '../src/threejs/models/createPlayerController.js';

function createEventTargetStub() {
    const active = new Map();
    const removals = new Map();
    return {
        style: {},
        contains: () => true,
        addEventListener(type, listener) {
            active.set(`${type}:${listener.name}`, listener);
        },
        removeEventListener(type, listener) {
            const key = `${type}:${listener.name}`;
            removals.set(key, (removals.get(key) ?? 0) + 1);
            active.delete(key);
        },
        activeCount: () => active.size,
        removalCounts: () => [...removals.values()],
    };
}

function collectUniqueResources(root) {
    const geometries = new Set();
    const materials = new Set();
    root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) {
            if (material) materials.add(material);
        }
    });
    return { geometries, materials };
}

function instrumentDisposals(resources) {
    const calls = new Map();
    for (const resource of resources) {
        calls.set(resource, 0);
        const originalDispose = resource.dispose.bind(resource);
        resource.dispose = () => {
            calls.set(resource, calls.get(resource) + 1);
            originalDispose();
        };
    }
    return calls;
}

test('player controller owns removed character resources and disposes each unique resource once', () => {
    const windowStub = createEventTargetStub();
    const domElement = createEventTargetStub();
    const previousWindow = globalThis.window;
    globalThis.window = windowStub;

    try {
        const scene = new THREE.Group();
        let removeCalls = 0;
        const originalRemove = scene.remove.bind(scene);
        scene.remove = (...objects) => {
            removeCalls += 1;
            return originalRemove(...objects);
        };

        const camera = new THREE.PerspectiveCamera();
        const controls = { target: new THREE.Vector3(), update() {} };
        const controller = createPlayerController({ camera, controls, domElement, scene });
        const { player } = controller;
        const { backpackBody, backpackFlap, backpackStrapL, backpackStrapR } = player.userData.parts;

        // Exercise material-array cleanup and duplicate identity handling without
        // replacing the production-imported character/controller path.
        const extraMaterial = new THREE.MeshStandardMaterial({ color: 0x123456 });
        backpackFlap.material = [backpackFlap.material, backpackFlap.material, extraMaterial];

        const { geometries, materials } = collectUniqueResources(player);
        const geometryCalls = instrumentDisposals(geometries);
        const materialCalls = instrumentDisposals(materials);
        const backpackGeometries = new Set([
            backpackBody.geometry,
            backpackFlap.geometry,
            backpackStrapL.geometry,
            backpackStrapR.geometry,
        ]);
        const backpackMaterials = new Set([
            ...[backpackBody, backpackFlap, backpackStrapL, backpackStrapR]
                .flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]),
        ]);

        assert.equal(scene.getObjectByName('player'), player, 'precondition: player must be scene-owned');
        assert.ok(windowStub.activeCount() > 0, 'precondition: controller must own window listeners');
        assert.ok(domElement.activeCount() > 0, 'precondition: controller must own canvas listeners');

        controller.dispose();
        controller.dispose();

        for (const [geometry, calls] of geometryCalls) {
            assert.equal(calls, 1, `geometry ${geometry.uuid} dispose calls=${calls}, expected once`);
        }
        for (const [material, calls] of materialCalls) {
            assert.equal(calls, 1, `material ${material.uuid} dispose calls=${calls}, expected once`);
        }
        for (const geometry of backpackGeometries) {
            assert.equal(geometryCalls.get(geometry), 1, `backpack geometry ${geometry.uuid} was not disposed once`);
        }
        for (const material of backpackMaterials) {
            assert.equal(materialCalls.get(material), 1, `backpack material ${material.uuid} was not disposed once`);
        }
        assert.equal(removeCalls, 1, 'repeated dispose must remove the player only once');
        assert.equal(scene.getObjectByName('player'), undefined, 'disposed player must be removed from scene');
        assert.equal(windowStub.activeCount(), 0, 'window listeners must be removed');
        assert.equal(domElement.activeCount(), 0, 'canvas listeners must be removed');
        assert.ok(windowStub.removalCounts().every((count) => count === 1), 'window listeners were removed repeatedly');
        assert.ok(domElement.removalCounts().every((count) => count === 1), 'canvas listeners were removed repeatedly');
    } finally {
        globalThis.window = previousWindow;
    }
});
