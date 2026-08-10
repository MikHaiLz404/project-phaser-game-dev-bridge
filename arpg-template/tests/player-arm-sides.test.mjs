import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import createCharacter from '../src/threejs/models/createCharacter.js';

const EPSILON = 1e-9;
const WRIST_LOCAL = new THREE.Vector3(0, -0.55, 0);

function assertVectorNear(actual, expected, message) {
    assert.ok(
        actual.distanceTo(expected) <= EPSILON,
        `${message}: expected ${expected.toArray().join(', ')}, got ${actual.toArray().join(', ')}`,
    );
}

function readParts(character) {
    const { armL, armR } = character.userData.parts;
    const swordPivot = character.getObjectByName('swordPivot');
    assert.ok(armL, 'production createCharacter() must expose armL');
    assert.ok(armR, 'production createCharacter() must expose armR');
    assert.ok(swordPivot, 'production createCharacter() must create swordPivot');
    return { armL, armR, swordPivot };
}

function assertSwordTracksRightWrist(character, label) {
    const { armL, armR, swordPivot } = readParts(character);
    character.updateMatrixWorld(true);

    const expectedRightLocal = WRIST_LOCAL.clone().applyMatrix4(armR.matrix);
    const expectedLeftLocal = WRIST_LOCAL.clone().applyMatrix4(armL.matrix);
    assertVectorNear(swordPivot.position, expectedRightLocal, `${label}: swordPivot root-local position`);
    assert.ok(
        swordPivot.position.distanceTo(expectedLeftLocal) > 0.5,
        `${label}: swordPivot overlaps armL wrist instead of remaining on armR side`,
    );

    const expectedRightWorld = WRIST_LOCAL.clone().applyMatrix4(armR.matrixWorld);
    const actualWorld = swordPivot.getWorldPosition(new THREE.Vector3());
    assertVectorNear(actualWorld, expectedRightWorld, `${label}: swordPivot world position`);
}

test('PAT-20 assigns armL to negative local X', () => {
    const character = createCharacter();
    const { armL } = readParts(character);
    assert.ok(armL.position.x < 0, `expected armL.position.x < 0, got ${armL.position.x}`);
});

test('PAT-20 assigns armR to positive local X', () => {
    const character = createCharacter();
    const { armR } = readParts(character);
    assert.ok(armR.position.x > 0, `expected armR.position.x > 0, got ${armR.position.x}`);
});

test('PAT-20 shoulders are symmetric around the torso center', () => {
    const character = createCharacter();
    const { armL, armR } = readParts(character);
    const torso = character.userData.parts.torso;
    const shoulderMidpointX = (armL.position.x + armR.position.x) / 2;
    assert.ok(
        Math.abs(shoulderMidpointX - torso.position.x) <= EPSILON,
        `expected shoulder midpoint X=${torso.position.x}, got ${shoulderMidpointX}`,
    );
    assert.ok(
        Math.abs(Math.abs(armL.position.x - torso.position.x)
            - Math.abs(armR.position.x - torso.position.x)) <= EPSILON,
        `expected symmetric shoulder offsets, got armL=${armL.position.x}, armR=${armR.position.x}`,
    );
});

test('PAT-20 swordPivot follows armR in root-local and world transforms across locomotion states', () => {
    const character = createCharacter({ attackDuration: 1 });
    character.position.set(4, 2, -3);
    character.rotation.y = Math.PI * 0.37;
    character.scale.setScalar(1.4);

    for (const state of ['idle', 'walk', 'run']) {
        character.userData.setState(state);
        character.userData.update(0.125);
        assert.equal(character.userData.getState(), state, `${state}: animation state changed unexpectedly`);
        assertSwordTracksRightWrist(character, state);
    }
});

test('PAT-20 attack swings only armR while armL remains on its idle anchor', () => {
    const attack = createCharacter({ attackDuration: 1 });
    const idleReference = createCharacter({ attackDuration: 1 });
    const attackParts = readParts(attack);
    const idleParts = readParts(idleReference);
    const leftAnchorX = attackParts.armL.position.x;

    idleReference.userData.update(0.15);
    attack.userData.setState('attack');
    attack.userData.update(0.15);

    assert.equal(attack.userData.getState(), 'attack');
    assert.equal(attackParts.armL.position.x, leftAnchorX, 'attack moved armL off its shoulder anchor');
    assert.ok(
        Math.abs(attackParts.armL.rotation.x - idleParts.armL.rotation.x) <= EPSILON,
        `attack changed armL swing: expected idle ${idleParts.armL.rotation.x}, got ${attackParts.armL.rotation.x}`,
    );
    assert.equal(attackParts.armL.rotation.z, 0, 'attack flared armL instead of keeping it anchored');
    assert.ok(
        Math.abs(attackParts.armR.rotation.x - idleParts.armR.rotation.x) > 1,
        'attack did not produce a distinct armR swing',
    );
    assert.ok(Math.abs(attackParts.armR.rotation.z) > 0.1, 'attack did not flare armR');
    assertSwordTracksRightWrist(attack, 'attack');

    attack.userData.setState('walk');
    assert.equal(attack.userData.getState(), 'attack', 'locomotion interrupted the attack state');
    attack.userData.update(0.85);
    assert.equal(attack.userData.getState(), 'idle', 'attack did not return to idle after recovery');
});
