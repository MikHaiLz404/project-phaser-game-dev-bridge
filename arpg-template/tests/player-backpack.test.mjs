import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import createCharacter from '../src/threejs/models/createCharacter.js';

const EPSILON = 1e-9;
const TORSO_BACK_Z = -0.14;
const MIN_BACK_GAP = 0.02;
const EXPECTED_PART_NAMES = [
    'backpack',
    'backpackBody',
    'backpackFlap',
    'backpackStrapL',
    'backpackStrapR',
];
const WRIST_LOCAL = new THREE.Vector3(0, -0.55, 0);

function readBackpack(character) {
    const parts = character.userData.parts;
    for (const name of EXPECTED_PART_NAMES) {
        assert.ok(parts[name], `production createCharacter() must expose parts.${name}`);
        assert.equal(parts[name].name, name, `${name} must have a stable scene-graph name`);
    }
    return Object.fromEntries(EXPECTED_PART_NAMES.map((name) => [name, parts[name]]));
}

function rootLocalBounds(object, root) {
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    const corner = new THREE.Vector3();

    object.traverse((child) => {
        if (!child.isMesh || !child.visible || !child.geometry) return;
        child.geometry.computeBoundingBox();
        const box = child.geometry.boundingBox;
        for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
                for (const z of [box.min.z, box.max.z]) {
                    corner.set(x, y, z).applyMatrix4(child.matrixWorld).applyMatrix4(rootInverse);
                    bounds.expandByPoint(corner);
                }
            }
        }
    });
    return bounds;
}

function worldBounds(object) {
    object.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(object, true);
}

function assertNear(actual, expected, message, epsilon = EPSILON) {
    assert.ok(
        Math.abs(actual - expected) <= epsilon,
        `${message}: expected ${expected}, got ${actual}`,
    );
}

function assertSwordTracksArmLWrist(character, label) {
    const { armL, armR } = character.userData.parts;
    const swordPivot = character.getObjectByName('swordPivot');
    character.updateMatrixWorld(true);
    const expectedWeaponWrist = WRIST_LOCAL.clone().applyMatrix4(armL.matrix);
    const expectedNonWeaponWrist = WRIST_LOCAL.clone().applyMatrix4(armR.matrix);
    assert.ok(
        swordPivot.position.distanceTo(expectedWeaponWrist) <= EPSILON,
        `${label}: swordPivot stopped tracking the project weapon armL wrist`,
    );
    assert.ok(
        swordPivot.position.distanceTo(expectedNonWeaponWrist) > 0.5,
        `${label}: swordPivot overlaps the non-weapon armR wrist`,
    );
}

function poseCharacter(state) {
    const character = createCharacter({ attackDuration: 1 });
    character.position.set(3, 1.5, -4);
    character.rotation.y = 0.41;
    character.scale.set(1.2, 0.9, 1.35);
    character.userData.setState(state);
    character.userData.update(state === 'attack' ? 0.5 : 0.31);
    character.updateMatrixWorld(true);
    return character;
}

test('PAT-21 exposes the named backpack hierarchy and parents it to the animated torso', () => {
    const character = createCharacter();
    const { torso } = character.userData.parts;
    const { backpack, backpackBody, backpackFlap, backpackStrapL, backpackStrapR } = readBackpack(character);

    assert.equal(backpack.parent, torso, 'backpack must be a torso child so bob, breathing, and attack lean propagate');
    for (const mesh of [backpackBody, backpackFlap, backpackStrapL, backpackStrapR]) {
        assert.ok(mesh.isMesh, `${mesh.name} must be a visible mesh`);
        assert.equal(mesh.parent, backpack, `${mesh.name} must be a direct child of backpack`);
    }
});

test('PAT-21 keeps every visible backpack mesh fully behind the torso with clearance', () => {
    for (const state of ['idle', 'walk', 'run', 'attack']) {
        const character = poseCharacter(state);
        const { backpack } = readBackpack(character);
        const bounds = rootLocalBounds(backpack, character);
        const gap = TORSO_BACK_Z - bounds.max.z;
        assert.ok(
            bounds.max.z < TORSO_BACK_Z,
            `${state}: backpack crossed torso back z=${TORSO_BACK_Z}; root-local maxZ=${bounds.max.z}`,
        );
        assert.ok(
            gap >= MIN_BACK_GAP,
            `${state}: backpack gap ${gap} is below non-z-fighting minimum ${MIN_BACK_GAP}`,
        );
    }
});

test('PAT-21 centers the pack, mirrors the straps, and stays inside the neutral arm silhouette', () => {
    const character = createCharacter();
    const { torso, armL, armR } = character.userData.parts;
    const { backpack, backpackBody, backpackStrapL, backpackStrapR } = readBackpack(character);
    character.userData.update(0);

    assert.equal(backpack.position.x, 0, 'backpack group must be centered on torso X');
    assert.equal(backpackBody.position.x, 0, 'main pack body must be centered on X');
    assert.ok(backpackStrapL.position.x < 0, 'left strap must use negative local X');
    assert.ok(backpackStrapR.position.x > 0, 'right strap must use positive local X');
    assertNear(backpackStrapL.position.x + backpackStrapR.position.x, 0, 'strap anchors must mirror around X=0');

    const bounds = rootLocalBounds(backpack, character);
    const torsoWidth = torso.geometry.parameters.width;
    const packWidth = bounds.max.x - bounds.min.x;
    const shoulderMinX = Math.min(armL.position.x, armR.position.x);
    const shoulderMaxX = Math.max(armL.position.x, armR.position.x);
    assert.ok(packWidth <= torsoWidth + EPSILON, `pack width ${packWidth} exceeds torso width ${torsoWidth}`);
    assert.ok(bounds.min.x > shoulderMinX + 0.07, 'pack overlaps the neutral negative-X arm envelope');
    assert.ok(bounds.max.x < shoulderMaxX - 0.07, 'pack overlaps the neutral positive-X arm envelope');
});

test('PAT-21 shoulder straps climb from the pack and wrap toward both shoulder regions', () => {
    const character = createCharacter();
    const { armL, armR } = character.userData.parts;
    const { backpackStrapL, backpackStrapR } = readBackpack(character);

    for (const [strap, shoulder] of [
        [backpackStrapL, armL],
        [backpackStrapR, armR],
    ]) {
        const bounds = rootLocalBounds(strap, character);
        const shoulderGap = shoulder.position.y - bounds.max.y;
        const backPlaneGap = TORSO_BACK_Z - bounds.max.z;
        const forwardTravel = bounds.max.z - bounds.min.z;

        assert.ok(
            bounds.max.y >= shoulder.position.y,
            `${strap.name}: top stops ${shoulderGap} below shoulder y=${shoulder.position.y}`,
        );
        assert.ok(
            backPlaneGap <= 0.06,
            `${strap.name}: nearest point remains ${backPlaneGap} behind torso instead of wrapping toward it`,
        );
        assert.ok(
            forwardTravel >= 0.2,
            `${strap.name}: z travel ${forwardTravel} reads as a rear-face band, not a shoulder path`,
        );
    }
});

test('PAT-21 follows torso bob, breathing scale, and attack lean without breaking sword tracking', () => {
    for (const state of ['idle', 'walk', 'run', 'attack']) {
        const character = poseCharacter(state);
        const { torso } = character.userData.parts;
        const { backpack } = readBackpack(character);
        const expectedWorld = backpack.position.clone().applyMatrix4(torso.matrixWorld);
        const actualWorld = backpack.getWorldPosition(new THREE.Vector3());
        assert.ok(
            actualWorld.distanceTo(expectedWorld) <= EPSILON,
            `${state}: backpack attachment drifted from torso transform`,
        );
        assert.ok(worldBounds(backpack).isEmpty() === false, `${state}: backpack has no world-space bounds`);
        assertSwordTracksArmLWrist(character, state);
    }

    const idle = poseCharacter('idle');
    assert.notEqual(idle.userData.parts.torso.scale.x, 1, 'idle probe must exercise torso X/Z breathing scale');
    assertNear(
        idle.userData.parts.torso.scale.x,
        idle.userData.parts.torso.scale.z,
        'idle torso breathing must scale attached pack consistently in X/Z',
    );
});

test('PAT-21 uses a low-poly brown palette, casts shadows, and is reachable by disposal traversal', () => {
    const character = createCharacter();
    const { backpack, backpackBody, backpackFlap, backpackStrapL, backpackStrapR } = readBackpack(character);
    const meshes = [backpackBody, backpackFlap, backpackStrapL, backpackStrapR];
    const colors = meshes.map((mesh) => mesh.material.color.getHex());

    assert.ok(new Set(colors).size >= 3, `expected at least three brown palette tones, got ${colors.map((c) => c.toString(16))}`);
    for (const mesh of meshes) {
        const { r, g, b } = mesh.material.color;
        assert.ok(r > g && g > b, `${mesh.name} material is not a brown tone`);
        assert.equal(mesh.castShadow, true, `${mesh.name} must cast shadows`);
        assert.ok(mesh.geometry.attributes.position.count <= 100, `${mesh.name} is not low-poly`);
    }

    const reached = new Set();
    character.traverse((object) => {
        if (object.geometry?.dispose && object.material?.dispose && object.getObjectByName) {
            if (meshes.includes(object)) reached.add(object.name);
        }
    });
    assert.deepEqual([...reached].sort(), meshes.map((mesh) => mesh.name).sort(), 'root disposal traversal cannot reach every backpack mesh');
    assert.equal(backpack.children.length, 4, 'backpack hierarchy contains unexpected visible pieces');
});
