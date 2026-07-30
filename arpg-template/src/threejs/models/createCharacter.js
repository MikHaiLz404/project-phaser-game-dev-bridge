/**
 * createCharacter.js — low-poly humanoid character factory.
 *
 * Builds a stylised, low-poly humanoid suitable for an indie ARPG.
 * No external assets — every body part is a primitive mesh (BoxGeometry,
 * SphereGeometry, CylinderGeometry). The character exposes a small
 * animation API:
 *
 *   • setState('idle' | 'walk' | 'run')  — drives procedural animation
 *   • update(dt)                          — call each frame to animate
 *
 * Body parts (all pivot at the root for easy placement):
 *   • body   (torso, box)
 *   • head   (sphere)
 *   • armL / armR (boxes that swing)
 *   • legL / legR (boxes that swing)
 *
 * The character is ~1.6 units tall (y=0 ground), so it fits cleanly into
 * a 50-unit ground plane and reads well from a third-person camera.
 *
 * @param {object} spec — { skinColor, shirtColor, pantsColor, hairColor, scale }
 * @returns {THREE.Group} — root group with userData: { setState, update, parts }
 */

import * as THREE from 'three';

export default function createCharacter(spec = {}) {
    const root = new THREE.Group();
    root.name = spec.name || 'character';

    const skin = spec.skinColor ?? 0xe8b89a;
    const shirt = spec.shirtColor ?? 0x6b8aa6;
    const pants = spec.pantsColor ?? 0x3a4a5e;
    const hair = spec.hairColor ?? 0x3a2a1a;
    const shoes = spec.shoesColor ?? 0x2a1a0a;

    const scale = spec.scale ?? 1.0;

    // -----------------------------------------------------------------
    // Materials
    // -----------------------------------------------------------------
    const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
    const matShirt = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
    const matPants = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    const matHair = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
    const matShoes = new THREE.MeshStandardMaterial({ color: shoes, roughness: 0.95 });

    // -----------------------------------------------------------------
    // Body parts (units: meters, y=0 ground)
    // -----------------------------------------------------------------
    // Torso (slightly tapered box)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), matShirt);
    torso.position.y = 0.85;  // sits on hip (y=0.55) — center at 0.85 (top of leg = 0.55, bottom of torso at 0.55)
    torso.castShadow = true;
    torso.name = 'torso';
    root.add(torso);

    // Head (sphere) — sits on top of torso
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), matSkin);
    head.position.y = 1.25;
    head.castShadow = true;
    head.name = 'head';
    root.add(head);

    // Hair cap (small flattened sphere on top)
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), matHair);
    hairCap.position.y = 1.28;
    hairCap.castShadow = true;
    hairCap.name = 'hair';
    root.add(hairCap);

    // Arms (boxes) — pivots at shoulder (top of arm)
    const armGeom = new THREE.BoxGeometry(0.14, 0.55, 0.14);

    // Left arm — pivot at right edge of torso (relative)
    const armL = new THREE.Group();
    armL.name = 'armL';
    armL.position.set(-0.32, 1.1, 0);  // shoulder position (top of torso)
    const armLMesh = new THREE.Mesh(armGeom, matShirt);
    armLMesh.position.y = -0.275;  // mesh hangs below pivot
    armLMesh.castShadow = true;
    armL.add(armLMesh);
    root.add(armL);

    const armR = new THREE.Group();
    armR.name = 'armR';
    armR.position.set(0.32, 1.1, 0);
    const armRMesh = new THREE.Mesh(armGeom, matShirt);
    armRMesh.position.y = -0.275;
    armRMesh.castShadow = true;
    armR.add(armRMesh);
    root.add(armR);

    // Legs (boxes) — pivots at hip
    const legGeom = new THREE.BoxGeometry(0.18, 0.55, 0.2);

    const legL = new THREE.Group();
    legL.name = 'legL';
    legL.position.set(-0.13, 0.55, 0);  // hip — lowered so feet touch ground
    const legLMesh = new THREE.Mesh(legGeom, matPants);
    legLMesh.position.y = -0.275;
    legLMesh.castShadow = true;
    legL.add(legLMesh);
    root.add(legL);

    const legR = new THREE.Group();
    legR.name = 'legR';
    legR.position.set(0.13, 0.55, 0);  // hip — lowered so feet touch ground
    const legRMesh = new THREE.Mesh(legGeom, matPants);
    legRMesh.position.y = -0.275;
    legRMesh.castShadow = true;
    legR.add(legRMesh);
    root.add(legR);

    // Shoes (small dark boxes at bottom of legs)
    // Sit at y=0.04 so the shoe box (height 0.08) rests on the ground plane (y=0).
    const shoeGeom = new THREE.BoxGeometry(0.2, 0.08, 0.26);
    const shoeL = new THREE.Mesh(shoeGeom, matShoes);
    shoeL.position.set(-0.13, 0.04, 0.04);
    shoeL.castShadow = true;
    root.add(shoeL);
    const shoeR = new THREE.Mesh(shoeGeom, matShoes);
    shoeR.position.set(0.13, 0.04, 0.04);
    shoeR.castShadow = true;
    root.add(shoeR);

    // Apply scale to root
    root.scale.setScalar(scale);

    // -----------------------------------------------------------------
    // Animation state
    // -----------------------------------------------------------------
    let state = 'idle';
    let animTime = 0;
    let bobAmount = 0;  // vertical head bob

    function setState(next) {
        if (next === state) return;
        state = next;
        animTime = 0;
    }

    function update(dt) {
        animTime += dt;
        if (state === 'idle') {
            // Subtle breathing: torso scale 1±2%
            const breathe = 1 + Math.sin(animTime * 1.5) * 0.015;
            torso.scale.set(breathe, 1, breathe);
            // Tiny arm sway
            armL.rotation.x = Math.sin(animTime * 0.8) * 0.03;
            armR.rotation.x = -Math.sin(animTime * 0.8) * 0.03;
            // Legs straight
            legL.rotation.x = 0;
            legR.rotation.x = 0;
            // No vertical bob — character stands firmly on ground when idle
            bobAmount = 0;
        } else if (state === 'walk') {
            // Walk cycle: legs swing forward/back, arms counter-swing
            const swing = Math.sin(animTime * 8) * 0.6;
            legL.rotation.x = swing;
            legR.rotation.x = -swing;
            armL.rotation.x = -swing * 0.5;
            armR.rotation.x = swing * 0.5;
            // Body bob
            bobAmount = Math.abs(Math.sin(animTime * 8)) * 0.04;
            torso.scale.set(1, 1, 1);
        } else if (state === 'run') {
            const swing = Math.sin(animTime * 12) * 0.9;
            legL.rotation.x = swing;
            legR.rotation.x = -swing;
            armL.rotation.x = -swing * 0.8;
            armR.rotation.x = swing * 0.8;
            bobAmount = Math.abs(Math.sin(animTime * 12)) * 0.07;
            torso.scale.set(1, 1, 1);
        }
        // Apply bob to head/hair/torso (skip legs — they touch ground)
        const baseY = {
            torso: 0.85,
            head: 1.25,
            hair: 1.28,
            armL: 1.1,
            armR: 1.1,
        };
        head.position.y = baseY.head + bobAmount;
        hairCap.position.y = baseY.hair + bobAmount;
        torso.position.y = baseY.torso + bobAmount;
        armL.position.y = baseY.armL + bobAmount;
        armR.position.y = baseY.armR + bobAmount;
    }

    root.userData = {
        setState,
        update,
        getState: () => state,
        parts: { torso, head, hairCap, armL, armR, legL, legR, shoeL, shoeR },
        // Useful metadata for game logic (height, ground offset)
        height: 1.55 * scale,
        groundY: 0,
    };

    return root;
}
