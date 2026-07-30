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
    // attackDuration is mutable so live-tunable via setAttackDuration() —
    // the GUI slider or external callers can change the swing length
    // without recreating the character. Use Math.max() at the consumer to
    // keep it positive; a 0 here would freeze the animation.
    let attackDuration = spec.attackDuration ?? 0.55;   // seconds, full swing (overhead slash)
    const attackActiveFraction = 0.50;                  // active window at swing midpoint
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
    // The dominant in-game camera (ThreeWorld.js) looks from +Z toward -Z,
    // so the player appears with their BACK to the viewer by default (spawn
    // at world z=-12, camera at world z=+32). In that orientation, the
    // viewer's RIGHT side maps to the character's LEFT side — meaning a
    // sword on character-local +X arm appears on the viewer's LEFT, which
    // reads as "they're holding it backwards".
    //
    // Conventional third-person ARPG UX favors having the sword on the
    // viewer's right (so it's not culled by the player body silhouette).
    // We mirror the arm positions: armR is at character-local -X (left
    // side of the body) but visually presents on the viewer's RIGHT due
    // to the default camera orientation.
    armR.position.set(-0.32, 1.1, 0);
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
    // Right-hand weapon — a low-poly sword that attaches to the wrist of
    // armR, with per-frame counter-rotation so it always points in a
    // intuitive direction regardless of armR rotation.
    //
    // Why a counter-rotation: armR.rotation.x drives the swing. As that
    // value grows past 90°, the local +Y axis of armR sweeps PAST the
    // character's body. If we mounted the sword with its blade pointing
    // along armR's local +Y, it would flip to point DOWNWARD when the arm
    // swings overhead — the exact opposite of what an overhead slash wants.
    //
    // Instead, the sword lives in its own `swordPivot` group attached to
    // armR at the wrist. Each frame we orient the pivot so its local +Y
    // points at the character's facing +Z (toward the camera/front). The
    // sword's blade extends along that axis. Result: the sword always
    // presents as "held forward" regardless of how the arm rotates, while
    // the wrist tracking still gives it natural motion.
    //
    // Dimensions:
    //   hilt    0.20 long — grip (cylinder)
    //   guard   0.18 wide — brass cross-piece
    //   blade   0.55 long — extends from the wrist toward the tip
    //   tip     0.10 cone — sharp leading edge
    //   pommel  0.06 ball — bottom of the grip
    //
    // Total length ≈ 0.85 — about half the character's height, reads as a
    // "short sword" from any camera distance.
    // -----------------------------------------------------------------
    const matHilt = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7, metalness: 0.2 });   // wood-tone grip
    const matGuard = new THREE.MeshStandardMaterial({ color: 0xc8b878, roughness: 0.4, metalness: 0.6 });  // brass guard
    const matBlade = new THREE.MeshStandardMaterial({ color: 0xdde7f0, roughness: 0.2, metalness: 0.9 });  // polished steel
    const matPommel = new THREE.MeshStandardMaterial({ color: 0xc8b878, roughness: 0.4, metalness: 0.6 });

    // -----------------------------------------------------------------
    // Right-hand weapon — sword
    //
    // Visibility flag: spec.equipSword (default true when omitted) builds
    // the sword meshes. Set to false to skip — useful for NPCs that
    // shouldn't be visibly carrying a sword.
    //
    // We still ALWAYS create the empty swordPivot group on root (so the
    // player-controller wrist-tracking code can find it without checking
    // for null) — just skip the meshes inside.
    const equipSword = spec.equipSword !== false;

    // swordPivot — see the big comment block earlier for why this lives
    // on root and not on armR.
    const swordPivot = new THREE.Group();
    swordPivot.name = 'swordPivot';
    root.add(swordPivot);

    // Sword mesh group — null when equipSword is false (NPCs).
    let sword = null;
    if (equipSword) {
        sword = new THREE.Group();
        sword.name = 'sword';
    }

    if (equipSword) {
        // Visible long-sword dimensions — the blade is fat enough to read
        // from a third-person camera distance (≈0.06 × 0.10 cross-section,
        // ~6cm thick on a 1.55m tall character — proportional to a
        // western arming sword).
        //
        //   pommel  (sphere)         — z=-0.16  behind the grip
        //   hilt    (cylinder 0.22)  — z=-0.05  in the hand
        //   guard   (box 0.22 × 0.06)— z=+0.06  cross-piece
        //   blade   (box 0.06 × 0.10 cross × 0.75 long)
        //                          — z=+0.46  center; extends to z ≈ +0.84
        //   tip     (cone 0.07 base × 0.12 long)
        //                          — z=+0.88  sharp leading edge
        //
        // Total length ≈ 1.05 — slightly over half the character's height,
        // reads as a 'long sword' from any camera distance.
        //
        // Note: in Worldspace, +Z = forward when the player faces away from the
        // camera (character's local +Z); if the player rotates 180°, the local
        // rotation.y update we apply below keeps the blade pointing in the new
        // forward direction automatically.
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), matPommel);
        pommel.position.set(0, 0, -0.16);
        pommel.castShadow = true;
        sword.add(pommel);

        const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.22, 8), matHilt);
        hilt.rotation.x = Math.PI / 2;  // rotate cylinder so length axis = Z
        hilt.position.set(0, 0, -0.05);
        hilt.castShadow = true;
        sword.add(hilt);

        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), matGuard);
        guard.position.set(0, 0, 0.06);
        guard.castShadow = true;
        sword.add(guard);

        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.10), matBlade);
        blade.position.set(0, 0, 0.46);  // blade center at z=0.46, length 0.75 → extends z=0.085..0.835
        blade.castShadow = true;
        sword.add(blade);

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), matBlade);
        tip.rotation.x = -Math.PI / 2;  // cone default +Y → rotate to +Z
        tip.position.set(0, 0, 0.88);  // sits at far end of the blade, pointing further forward
        tip.castShadow = true;
        sword.add(tip);

        swordPivot.add(sword);
    }

    // Reusable vector (always declared — wrist tracking uses it regardless
    // of whether the sword meshes exist).
    const swordTrack = new THREE.Vector3();

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
     * Live-tune the swing duration from outside (e.g., the player controller
     * exposing a GUI slider). Mutates the closure-local attackDuration so
     * the animation curve changes mid-game without recreating the character.
     */
    function setAttackDuration(seconds) {
        attackDuration = Math.max(0.05, seconds);
    }
    function getAttackDuration() {
        return attackDuration;
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
            // Overhead-slash swing: arm lifts the sword ABOVE the head, then
            // brings it down in a powerful arc, then returns to rest.
            //
            //   windup   (0..0.30)  — armR.x sweeps from 0 → -2.6 rad
            //                         ≈ arm rotated ~150° backward, sword
            //                         ends up overhead.
            //   active   (0.30..0.65) — armR.x slashes from -2.6 → +1.0 rad.
            //                         Sword arcs OVERHEAD then DOWN through
            //                         the front of the body. Hits between
            //                         t=0.45–0.55 (mid-swing).
            //   recovery (0.65..1.0) — armR.x returns to 0 + armR.z decays.
            //
            // armR.z adds a subtle outward elbow flare so the arc looks like
            // it actually swings "around" the body rather than sliding in
            // a flat plane.
            const t = Math.min(1, animTime / attackDuration);

            let swingX = 0;
            let elbowZ = 0;
            if (t < 0.30) {
                // Windup — arm reaches overhead. Linear lerp for predictability.
                const w = t / 0.30;
                swingX = -2.6 * w;
                elbowZ = -0.4 * w;   // elbow flares out slightly
            } else if (t < 0.65) {
                // Active — fast downward slash. Curve biased toward the
                // start (when the sword is at apex) so the tip travels
                // FAST through the hit point.
                const w = (t - 0.30) / 0.35;
                swingX = -2.6 + (1.0 - -2.6) * w;
                elbowZ = -0.4 + 0.5 * w;   // elbow recovers inward during slash
            } else {
                // Recovery — arm returns to rest pose.
                const w = (t - 0.65) / 0.35;
                swingX = 1.0 * (1 - w);
                elbowZ = 0.1 * (1 - w);
            }
            armR.rotation.x = swingX;
            armR.rotation.z = elbowZ;

            // Left arm stays in IDLE pose during the swing — the user only
            // asked for the right arm (swinging arm) to move. Keeping the
            // left arm still gives the animation a cleaner read: one limb
            // moves with purpose, the other anchors the silhouette.
            armL.rotation.x = Math.sin(animTime * 0.8) * 0.03;  // match idle sway
            armL.rotation.z = 0;

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

        // -----------------------------------------------------------------
        // Track the right wrist so the swordPivot follows wherever armR ends
        // up while the player swings.
        //
        // swordPivot lives on root, so its position is in ROOT-LOCAL space.
        // We transform the wrist local position (0,-0.55,0 in armR space)
        // through armR.matrixWorld, then undo root's transform via
        // root.matrixWorld.invert() to get back into root-local coordinates.
        //
        // Critical: the player's facing rotation (root.rotation.y = facingYaw)
        // is applied to the pivot INTERNALLY because it's a child of root.
        // So if the player turns 180° the pivot's transform auto-orients with
        // them — the blade still points in the new forward direction.
        //
        // Two stage update:
        //   1) root.updateMatrixWorld() to push the parent's world matrix
        //      through the chain so armR.matrixWorld is fresh
        //   2) invert root.matrixWorld so we can convert wrist back to local
        // -----------------------------------------------------------------
        root.updateMatrixWorld(true);   // parent-to-child chain
        swordTrack.set(0, -0.55, 0).applyMatrix4(armR.matrixWorld);
        // Convert world → root-local by undoing root.matrixWorld
        const rootInv = root.matrixWorld.clone().invert();
        swordTrack.applyMatrix4(rootInv);
        swordPivot.position.copy(swordTrack);
        // Keep pivot rotation zero so it inherits root's facing rotation
        // purely from the parent chain (no fighting the inheritance).
        swordPivot.rotation.set(0, 0, 0);
    }

    root.userData = {
        setState,
        setSwingReturn,
        update,
        getState: () => state,
        parts: { torso, head, hairCap, armL, armR, legL, legR, shoeL, shoeR, sword },
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
        // Live-tune hook for the swing curve
        setAttackDuration,
        getAttackDuration,
        // Useful metadata for game logic (height, ground offset)
        height: 1.55 * scale,
        groundY: 0,
    };

    return root;
}
