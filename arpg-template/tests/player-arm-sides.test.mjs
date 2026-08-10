import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import createCharacter from '../src/threejs/models/createCharacter.js';

const EPSILON = 1e-9;
const WRIST_LOCAL = new THREE.Vector3(0, -0.55, 0);
const SIDE_CONTRACT = Object.freeze({
    armL: Object.freeze({ x: +0.32, ownsWeapon: true }),
    armR: Object.freeze({ x: -0.32, ownsWeapon: false }),
    forwardZ: +1,
    backpackZ: -1,
});

function assertNear(actual, expected, message, epsilon = EPSILON) {
    assert.ok(
        Math.abs(actual - expected) <= epsilon,
        `${message}: expected ${expected}, got ${actual}`,
    );
}

function assertVectorNear(actual, expected, message) {
    assert.ok(
        actual.distanceTo(expected) <= EPSILON,
        `${message}: expected ${expected.toArray().join(', ')}, got ${actual.toArray().join(', ')}`,
    );
}

function readParts(character) {
    const {
        torso, armL, armR, backpack,
    } = character.userData.parts;
    const swordPivot = character.getObjectByName('swordPivot');
    assert.ok(torso, 'production createCharacter() must expose torso');
    assert.ok(armL, 'production createCharacter() must expose armL');
    assert.ok(armR, 'production createCharacter() must expose armR');
    assert.ok(backpack, 'production createCharacter() must expose backpack as a rear landmark');
    assert.ok(swordPivot, 'production createCharacter() must create swordPivot');
    return {
        torso, armL, armR, backpack, swordPivot,
    };
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

function poseCharacter(state, dt, { transformed = false } = {}) {
    const parent = new THREE.Group();
    const character = createCharacter({ attackDuration: 1 });
    parent.add(character);

    if (transformed) {
        parent.position.set(-6, 3, 8);
        parent.rotation.set(0.18, -0.43, 0.11);
        parent.scale.set(0.75, 1.6, 1.25);
        character.position.set(4, 2, -3);
        character.rotation.set(-0.09, Math.PI * 0.37, 0.14);
        character.scale.set(1.4, 0.85, 1.2);
    }

    character.userData.setState(state);
    character.userData.update(dt);
    parent.updateMatrixWorld(true);
    return { parent, character };
}

function assertSwordTracksArmLWrist(character, label) {
    const { armL, armR, swordPivot } = readParts(character);
    character.updateWorldMatrix(true, true);

    const expectedArmLLocal = WRIST_LOCAL.clone().applyMatrix4(armL.matrix);
    const armRLocal = WRIST_LOCAL.clone().applyMatrix4(armR.matrix);
    assertVectorNear(swordPivot.position, expectedArmLLocal, `${label}: swordPivot root-local armL wrist`);
    assert.ok(
        swordPivot.position.distanceTo(armRLocal) > 0.5,
        `${label}: swordPivot overlapped non-weapon armR wrist`,
    );

    const expectedArmLWorld = WRIST_LOCAL.clone().applyMatrix4(armL.matrixWorld);
    const armRWorld = WRIST_LOCAL.clone().applyMatrix4(armR.matrixWorld);
    const actualWorld = swordPivot.getWorldPosition(new THREE.Vector3());
    assertVectorNear(actualWorld, expectedArmLWorld, `${label}: swordPivot world armL wrist`);
    assert.ok(
        actualWorld.distanceTo(armRWorld) > 0.25,
        `${label}: transformed swordPivot did not stay separated from armR`,
    );
}

function expectedAttackCurve(t) {
    if (t < 0.30) {
        const w = t / 0.30;
        return { x: -2.6 * w, z: -0.4 * w };
    }
    if (t < 0.65) {
        const w = (t - 0.30) / 0.35;
        return { x: -2.6 + 3.6 * w, z: -0.4 + 0.5 * w };
    }
    const w = (t - 0.65) / 0.35;
    return { x: 1.0 * (1 - w), z: 0.1 * (1 - w) };
}

test('PAT-22 declares the project-authored side contract explicitly', () => {
    assert.deepEqual(SIDE_CONTRACT, {
        armL: { x: +0.32, ownsWeapon: true },
        armR: { x: -0.32, ownsWeapon: false },
        forwardZ: +1,
        backpackZ: -1,
    });
});

test('PAT-22 names the +X shoulder armL and the -X shoulder armR symmetrically', () => {
    const character = createCharacter();
    const { torso, armL, armR } = readParts(character);

    assertNear(armL.position.x, SIDE_CONTRACT.armL.x, 'armL project-local X');
    assertNear(armR.position.x, SIDE_CONTRACT.armR.x, 'armR project-local X');
    assert.ok(armL.position.x > torso.position.x, 'armL must remain on physical +X');
    assert.ok(armR.position.x < torso.position.x, 'armR must remain on physical -X');
    assertNear(armL.position.x + armR.position.x, 2 * torso.position.x, 'shoulders must mirror around torso');
    assertNear(armL.position.distanceTo(armR.position), 0.64, 'shoulder separation');
});

test('PAT-22 keeps +Z forward and the backpack entirely on the opposite -Z side', () => {
    const character = createCharacter();
    const { backpack } = readParts(character);
    const bounds = rootLocalBounds(backpack, character);

    assert.equal(SIDE_CONTRACT.forwardZ, +1);
    assert.equal(SIDE_CONTRACT.backpackZ, -1);
    assert.ok(
        bounds.max.z * SIDE_CONTRACT.forwardZ < 0,
        `backpack crossed the rear half-space; root-local maxZ=${bounds.max.z}`,
    );
});

test('PAT-22 sword follows armL and stays separated from armR in every state and transformed root', () => {
    const samples = [
        ['idle', 0.125],
        ['walk', 0.125],
        ['run', 0.125],
        ['attack', 0.15],
        ['attack', 0.50],
        ['attack', 0.85],
    ];

    for (const [state, dt] of samples) {
        for (const transformed of [false, true]) {
            const { character } = poseCharacter(state, dt, { transformed });
            assert.equal(character.userData.getState(), state, `${state}: animation state changed unexpectedly`);
            assertSwordTracksArmLWrist(character, `${state}@${dt}${transformed ? ' transformed' : ''}`);
        }
    }
});

test('PAT-22 preserves base physical +X and -X phases for idle, walk, and run', () => {
    const samples = [
        ['idle', 0.37, -Math.sin(0.37 * 0.8) * 0.03, Math.sin(0.37 * 0.8) * 0.03],
        ['walk', 0.19, Math.sin(0.19 * 8) * 0.6 * 0.5, -Math.sin(0.19 * 8) * 0.6 * 0.5],
        ['run', 0.11, Math.sin(0.11 * 12) * 0.9 * 0.8, -Math.sin(0.11 * 12) * 0.9 * 0.8],
    ];

    for (const [state, dt, expectedPositiveX, expectedNegativeX] of samples) {
        const { character } = poseCharacter(state, dt);
        const { armL, armR } = readParts(character);
        assertNear(armL.rotation.x, expectedPositiveX, `${state}: +X armL must keep base +X/old-armR phase`);
        assertNear(armR.rotation.x, expectedNegativeX, `${state}: -X armR must keep base -X/old-armL phase`);
        assertSwordTracksArmLWrist(character, `${state} phase preservation`);
    }
});

test('PAT-22 gives only armL the base weapon attack curve while armR keeps phase-aligned non-weapon sway', () => {
    for (const phase of [0.15, 0.50, 0.85]) {
        const { character } = poseCharacter('attack', phase, { transformed: true });
        const { armL, armR } = readParts(character);
        const expectedWeapon = expectedAttackCurve(phase);
        const expectedNonWeaponX = Math.sin(phase * 0.8) * 0.03;

        assertNear(armL.rotation.x, expectedWeapon.x, `attack@${phase}: armL weapon swing X`);
        assertNear(armL.rotation.z, expectedWeapon.z, `attack@${phase}: armL weapon elbow Z`);
        assertNear(armR.rotation.x, expectedNonWeaponX, `attack@${phase}: armR non-weapon idle sway`);
        assertNear(armR.rotation.z, 0, `attack@${phase}: armR must not receive weapon elbow flare`);
        assertSwordTracksArmLWrist(character, `attack@${phase}`);
    }

    const { character } = poseCharacter('attack', 0.15);
    character.userData.setState('walk');
    assert.equal(character.userData.getState(), 'attack', 'locomotion interrupted the attack state');
    character.userData.update(0.85);
    assert.equal(character.userData.getState(), 'idle', 'attack did not return to idle after recovery');
});
