/**
 * createCharacter.js — low-poly humanoid character factory.
 *
 * Builds a stylised, low-poly humanoid suitable for an indie ARPG.
 * No external assets — every body part is a primitive mesh (BoxGeometry,
 * SphereGeometry, CylinderGeometry). The character exposes a small
 * The character exposes a small animation API:
 *
 *   • setState('idle' | 'walk' | 'run' | 'attack')  — drives procedural animation
 *   • update(dt)                                     — call each frame to animate
 *
 * Attack animation: the right arm (armR) swings forward and down in an arc
 * over `attackDuration` seconds. The 'active' window (mid-swing, when a
 * hitbox would be live) is `attackActiveFraction` of the total. When the
 * animation ends the state returns to 'idle' — caller is expected to set
 * a new state ('walk'/'run'/etc.) on the next frame if needed.
 *
 * Future hook (Phase 4): a future aim pass can read `getState()` and
 * trigger damage / hitbox during the active window.
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
 * @param {object} spec — { skinColor, shirtColor, pantsColor, hairColor,
 *                         scale, attackDuration }
 * @returns {THREE.Group} — root group with userData: { setState, update, parts,
 *                         onAttackActive, getAttackTiming }
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
    const attackDuration = spec.attackDuration ?? 0.45;   // seconds, full swing
    const attackActiveFraction = 0.35;                    // 35% of swing = active window
    // Position where a melee hitbox would live — relative to root.
    // The active window fires when armR crosses y=0 axis at this x/z offset.
    // Forward = +Z (matches Three.js default forward); character faces +Z too,
    // so the hit origin sits in front of the body.
    const attackHitOffset = { x: 0, y: 1.0, z: 0.5 };

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
    // Listeners for the "active" window of an attack swing — fired once per
    // swing when the arm crosses the hit plane. Hitbox code (Phase 4)
    // subscribes to this to spawn damage / events. The active callback is
    // intentionally nullable so character keeps working without one.
    let onAttackActive = null;
    let attackActiveFired = false;        // latched true until the swing ends
    let swingReturnTo = 'idle';           // where to go after swing completes

    function setState(next) {
        if (next === state) return;
        // PROTECTING the attack state:
        //   When the character is mid-swing ('attack'), we IGNORE incoming
        //   setState calls for 'idle'/'walk'/'run' because the player
        //   controller's per-frame update() unconditionally calls one of
        //   those every tick to drive the locomotion blend. Letting those
        //   calls through would cancel the attack animation on the very next
        //   frame. Only same-state no-ops and a true cancel-out (calling
        //   setState again with 'attack') are permitted until the swing
        //   completes internally via animTime.
        if (state === 'attack' && next !== 'attack') {
            return;
        }
        // Leaving an attack (e.g., explicit cancel or end-of-swing state
        // set from outside) — clear the active latch.
        if (state === 'attack' && next === 'attack') {
            // Re-arming mid-swing — let callers do this to cancel-and-restart
            attackActiveFired = false;
        }
        state = next;
        animTime = 0;
    }

    /**
     * Schedule a one-shot state change for when the current attack ends.
     * Lets you chain ("attack" → "walk") without polling each frame.
     */
    function setSwingReturn(nextState) {
        swingReturnTo = nextState || 'idle';
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
        } else if (state === 'attack') {
            // Swing arc over attackDuration seconds. Right arm (armR) sweeps
            // from raised ("windup" — first 35%) through "active" (middle 30%,
            // hits here) into "recovery" (last 35%, returns to rest).
            //
            // Curve: half-cosine. At t=0 → cos(0)=1 → arm raised fully back.
            // At t=0.5 → cos(π)=−1 → arm forward at full extension.
            // At t=1 → cos(2π)=1 → arm back to rest.
            const t = Math.min(1, animTime / attackDuration);

            // Rotation on armR.x drives the swing.
            // windup   (0..0.35) — arm lifts back to −1.2 rad
            // active   (0.35..0.65) — arm swings forward to +1.6 rad
            // recovery (0.65..1.0) — arm returns to ~0
            let swingX = 0;
            if (t < 0.35) {
                // Windup: lerp from 0 → −1.2 rad (arm raised behind body)
                const w = t / 0.35;
                swingX = -1.2 * w;
            } else if (t < 0.65) {
                // Active: lerp from −1.2 → +1.6 rad (arm sweeps forward)
                const w = (t - 0.35) / 0.30;
                swingX = -1.2 + (1.6 - -1.2) * w;
            } else {
                // Recovery: lerp from +1.6 → 0 (arm back to neutral)
                const w = (t - 0.65) / 0.35;
                swingX = 1.6 * (1 - w);
            }
            armR.rotation.x = swingX;

            // Left arm tenses during active window for visual weight
            const tense = Math.max(0, 1 - Math.abs(t - 0.5) / 0.25) * 0.6;
            armL.rotation.x = -0.4 - tense * 0.4;

            // Torso twist — small lean into the swing at the active midpoint
            const lean = Math.sin(t * Math.PI) * 0.15;
            torso.rotation.y = lean;

            // Slight forward step during active — legs push player weight
            const legPush = Math.sin(t * Math.PI) * 0.2;
            legL.rotation.x = -legPush;
            legR.rotation.x = legPush;

            // Bob stays zero — anchored stance during attack
            bobAmount = 0;

            // Fire the active-window callback exactly once per swing when
            // t crosses attackActiveFraction (middle of the curve).
            if (!attackActiveFired && t >= attackActiveFraction) {
                attackActiveFired = true;
                if (typeof onAttackActive === 'function') {
                    try {
                        onAttackActive({
                            origin: attackHitOffset,
                            t,
                            facingYaw: 0, // root group rotation = facingYaw externally
                        });
                    } catch (err) {
                        // Defensive: never let listener bugs kill the animation
                        console.warn('[createCharacter] onAttackActive listener threw:', err);
                    }
                }
            }

            // Swing complete — hand back to caller-chosen return state
            if (t >= 1) {
                state = swingReturnTo;
                animTime = 0;
                attackActiveFired = false;
            }
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
        setSwingReturn,
        update,
        getState: () => state,
        parts: { torso, head, hairCap, armL, armR, legL, legR, shoeL, shoeR },
        // Attack metadata — exposed for hitbox / Phase 4 subscribers
        attack: {
            duration: attackDuration,
            activeFraction: attackActiveFraction,
            hitOffset: attackHitOffset,
        },
        setOnAttackActive(cb) { onAttackActive = cb; },
        getAttackTiming: () => ({
            duration: attackDuration,
            activeFraction: attackActiveFraction,
            hitOffset: attackHitOffset,
            state,
            animTime,
        }),
        // Useful metadata for game logic (height, ground offset)
        height: 1.55 * scale,
        groundY: 0,
    };

    return root;
}
