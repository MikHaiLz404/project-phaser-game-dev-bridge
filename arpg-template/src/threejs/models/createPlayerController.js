/**
 * createPlayerController.js — WASD player + third-person follow camera.
 *
 * Wires up a controllable character with:
 *   • WASD / arrow-key movement (8-directional)
 *   • Walk / run state driven by input
 *   • Y-axis rotation toward movement direction (smooth)
 *   • Third-person camera that follows behind the player, with mouse
 *     drag to orbit horizontally and scroll-zoom
 *   • Ground clamp (y always 0)
 *
 * The controller exposes:
 *   • update(dt)          — call each frame
 *   • player              — THREE.Group root of the character
 *   • cameraTarget        — Vector3 to follow (smoothed)
 *   • setEnabled(bool)    — toggle input handling
 *
 * Usage:
 *   import createPlayerController from './createPlayerController.js';
 *   const ctrl = createPlayerController({ camera, domElement, world, scene });
 *   // In game loop:
 *   ctrl.update(dt);
 */

import * as THREE from 'three';
import createCharacter from './createCharacter.js';

const ROTATION_SPEED = 8.0;     // radians/sec smooth-turn

// Live-tunable tunables. The Player Parameters lil-gui folder binds directly
// to these fields (via the public controller object below), so changes
// take effect immediately.
const tunables = {
    moveSpeed: 4.0,       // units / second walk
    runMultiplier: 1.8,   // Shift = walk × runMultiplier
    jumpVelocity: 5.5,    // initial upward velocity on Space
    gravity: 18.0,        // downward acceleration
    cameraDistance: 7.0,  // third-person orbit radius
    cameraHeight: 3.2,    // vertical offset above ground
    cameraSmoothing: 6.0, // exponential lerp speed
    attackDuration: 0.45, // seconds, full swing (must match createCharacter default)
    attackCooldown: 0.55, // seconds, locked out after a swing finishes
};

// Attack input mode — two schemes, toggled in GUI:
//   • 'LMB' (default) — left-click swings; right-drag orbits camera
//   • 'RMB'           — right-click swings; left-drag orbits camera (rare)
// For ARPG convention LMB is the right call; the toggle is here so power
// users can rebind without editing source.
let attackInputMode = 'LMB';

// Follow mode: when true (default), camera orbits around the player via
// left-drag. When false, the player controller stops overriding the camera
// and OrbitControls takes over (free-camera mode — right-drag pan, left-drag
// orbit around the last-known player position).
let followMode = true;

// Ground plane sits at y=-1 in ThreeWorld.js, so the character's feet
// must rest at that height (shoe top at -1 → ground-aligned).
const PLAYER_GROUND_Y = -1;

export default function createPlayerController(opts = {}) {
    const {
        camera,
        domElement,
        scene,
        spawnPosition = { x: 0, z: 0 },
    } = opts;

    // -----------------------------------------------------------------
    // Build the character
    // -----------------------------------------------------------------
    const player = createCharacter({
        name: 'player',
        skinColor: 0xe8b89a,
        shirtColor: 0x6b8aa6,
        pantsColor: 0x3a4a5e,
        hairColor: 0x3a2a1a,
        shoesColor: 0x2a1a0a,
        scale: 1.0,
    });
    player.position.set(spawnPosition.x, PLAYER_GROUND_Y, spawnPosition.z);
    if (scene) scene.add(player);

    // -----------------------------------------------------------------
    // Camera follow state
    // -----------------------------------------------------------------
    // Orbit state: yaw (around Y) + pitch (above horizon)
    // Initial yaw points the camera toward the village plaza so the
    // player spawns already framed.
    let camYaw = Math.PI * 0.25;   // initial offset behind player (looking from +X+Z)
    let camPitch = 0.45;           // radians above horizon
    let camDistance = tunables.cameraDistance;
    const camTarget = new THREE.Vector3();
    const camDesiredPos = new THREE.Vector3();

    // -----------------------------------------------------------------
    // Camera helpers — place camera relative to player + look at chest.
    // Shared by initial snap and the public snapToPlayer() action so the
    // math lives in exactly one place.
    // -----------------------------------------------------------------
    function placeCameraAtPlayer() {
        if (!camera) return;
        const cosPitch = Math.cos(camPitch);
        const sinPitch = Math.sin(camPitch);
        camera.position.set(
            player.position.x + Math.sin(camYaw) * cosPitch * camDistance,
            PLAYER_GROUND_Y + sinPitch * camDistance + tunables.cameraHeight,
            player.position.z + Math.cos(camYaw) * cosPitch * camDistance,
        );
        camera.lookAt(player.position.x, PLAYER_GROUND_Y + 1.0, player.position.z);
        // Seed OrbitControls target — without this, OrbitControls ignores
        // our lookAt and rotates around the world origin.
        const ctrls = opts.controls;
        if (ctrls?.target) {
            ctrls.target.set(player.position.x, PLAYER_GROUND_Y + 1.0, player.position.z);
            ctrls.update?.();
        }
    }

    // Snap camera to follow position on first frame so the player is
    // visible immediately instead of starting at the world-default cam pose.
    placeCameraAtPlayer();

    // -----------------------------------------------------------------
    // Input handling
    // -----------------------------------------------------------------
    // When a tool (e.g. HouseLayoutTool's "Select & Frame" or "Fit Camera")
    // moves the OrbitControls target to look at something other than the
    // player, it sets `opts.controls.userFramedHouse = true`. The player
    // controller pauses its own target-tracking while this flag is set,
    // then resumes once the flag is cleared (or after a short timeout).
    //
    // Mouse input: left-drag orbits the camera around the player (yaw/pitch).
    // Scroll zooms. Right-drag is handled by OrbitControls for panning
    // (only available in free-camera mode).
    const userFramedHouse = opts.controls?.userFramedHouse ?? null;
    let frameOverrideUntil = 0;
    function isFrameOverrideActive(now) {
        // External flag is the source of truth
        if (opts.controls && opts.controls.userFramedHouse === true) return true;
        // Auto-resume after 4 seconds even if the tool forgot to clear it
        if (now < frameOverrideUntil) return true;
        return false;
    }
    function noteFrameOverride(seconds = 4.0) {
        frameOverrideUntil = performance.now() / 1000 + seconds;
    }

    const keys = new Set();
    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let enabled = true;

    // Jump physics — short hop on Spacebar press. Uses a velocity model so
    // gravity pulls the character back to the ground plane. Values are
    // sourced from `tunables` so the GUI slider takes effect immediately.
    let verticalVelocity = 0;        // current vertical velocity
    let isGrounded = true;           // false while airborne

    // -----------------------------------------------------------------
    // Attack state machine
    // -----------------------------------------------------------------
    // Attack scheduling lives in two places:
    //   • The CHARACTER owns the animation (idle → windup → active → recovery)
    //     via createCharacter's `setState('attack')`. The animation curves
    //     and the active window callback live inside the character.
    //   • The CONTROLLER owns the "when can the user swing again" rule —
    //     a simple cooldown countdown reset after each successful swing.
    //
    // The two stay in sync via `userData.getState() === 'attack'`. If the
    // character is mid-swing OR the cooldown hasn't elapsed, tryAttack()
    // is a no-op.
    let attackCooldownTimer = 0;     // seconds remaining before next swing
    // Snapshot of "was the character attacking last frame?" so we can arm
    // the cooldown exactly on the swing-end transition instead of every frame.
    let wasAttacking = false;
    // Listeners for "swing started" and "active window fired" — the scene
    // subscribes here to bridge events into Phaser's event bus.
    const onAttackStartListeners = new Set();
    const onAttackActiveListeners = new Set();

    function isAttacking() {
        return player.userData.getState() === 'attack';
    }
    function canAttack() {
        return enabled && !isAttacking() && attackCooldownTimer <= 0;
    }
    function tryAttack() {
        if (!canAttack()) {
            return false;
        }
        // Lock movement from clobbering the swing — we allow walk/run to
        // start again automatically after the swing via setSwingReturn.
        player.userData.setState('attack');
        // Restore the pre-swing state when the swing ends so the character
        // continues whatever they were doing (walking while swinging, etc.).
        const prevState = (() => {
            // Re-derive from input state — read inside tryAttack for accuracy.
            let fx = 0, fz = 0;
            if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
            if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
            if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
            if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
            const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
            if (fx === 0 && fz === 0) return 'idle';
            return running ? 'run' : 'walk';
        })();
        player.userData.setSwingReturn(prevState);
        // Wire the active callback once — it forwards into the listener set.
        player.userData.setOnAttackActive((evt) => {
            for (const fn of onAttackActiveListeners) {
                try {
                    fn(evt, player);
                } catch (err) {
                    console.warn('[playerCtrl] attack-active listener threw:', err);
                }
            }
        });
        // Notify start listeners (scene-level event for Phaser bridge)
        for (const fn of onAttackStartListeners) {
            try {
                fn(player);
            } catch (err) {
                console.warn('[playerCtrl] attack-start listener threw:', err);
            }
        }
        return true;
    }

    function onKeyDown(e) {
        if (!enabled) return;
        keys.add(e.code);
        // Spacebar = jump (single press triggers one hop)
        if (e.code === 'Space') {
            e.preventDefault();   // stop browser from scrolling the page
            if (isGrounded) {
                verticalVelocity = tunables.jumpVelocity;
                isGrounded = false;
            }
        }
    }
    function onKeyUp(e) {
        keys.delete(e.code);
    }
    function onPointerDown(e) {
        if (!enabled) return;
        // Action RPG input model:
        //   • LMB (button 0)  → primary attack swing
        //   • RMB (button 2)  → start camera-orbit drag (when held)
        //   • Middle button   → reserved (no action)
        //
        // The toggleable `attackInputMode` swaps the two roles — see the GUI
        // "Attack Input" picker. Default is "LMB" for ARPG convention.
        const isLeft = e.button === 0;
        const isRight = e.button === 2;
        const attackButton = attackInputMode === 'LMB' ? 'left' : 'right';
        const orbitButton = attackInputMode === 'LMB' ? 'right' : 'left';

        if (isLeft && attackButton === 'left') {
            tryAttack();
            return;
        }
        if (isRight && attackButton === 'right') {
            tryAttack();
            return;
        }
        // Otherwise start a camera-orbit drag if it's the orbit button.
        const wantOrbit =
            (isLeft && orbitButton === 'left') ||
            (isRight && orbitButton === 'right');
        if (!wantOrbit) return;

        isDragging = true;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        domElement.style.cursor = 'grabbing';
    }
    function onPointerMove(e) {
        if (!enabled || !isDragging) return;
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        camYaw -= dx * 0.005;
        camPitch = Math.max(0.1, Math.min(1.4, camPitch + dy * 0.005));
    }
    function onPointerUp(e) {
        const orbitButton = attackInputMode === 'LMB' ? 'right' : 'left';
        const wantOrbit =
            (e.button === 0 && orbitButton === 'left') ||
            (e.button === 2 && orbitButton === 'right');
        if (!wantOrbit) return;
        isDragging = false;
        domElement.style.cursor = 'default';
    }
    function onWheel(e) {
        if (!enabled) return;
        e.preventDefault();
        camDistance = Math.max(3.0, Math.min(15.0, camDistance + e.deltaY * 0.01));
    }
    function onContextMenu(e) {
        // Suppress browser context menu on right-click within our canvas.
        // RMB is used both for camera-orbit-drag and (in RMB-attack mode)
        // for triggering an attack swing — the context menu would block both.
        if (domElement.contains(e.target)) e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    if (domElement) {
        domElement.addEventListener('pointerdown', onPointerDown);
        domElement.addEventListener('pointermove', onPointerMove);
        domElement.addEventListener('pointerup', onPointerUp);
        domElement.addEventListener('wheel', onWheel, { passive: false });
        domElement.addEventListener('contextmenu', onContextMenu);
    }

    function setEnabled(next) {
        enabled = next;
        if (!enabled) {
            keys.clear();
            isDragging = false;
            if (domElement) domElement.style.cursor = 'default';
        }
    }

    // -----------------------------------------------------------------
    // Movement logic
    // -----------------------------------------------------------------
    const moveDir = new THREE.Vector3();
    let facingYaw = 0;  // current rotation around Y

    function readInput() {
        // Forward = -Z, right = +X (camera-space convention)
        let fx = 0, fz = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;

        // Rotate input by camera yaw so movement is relative to camera direction
        const cy = Math.cos(camYaw);
        const sy = Math.sin(camYaw);
        const wx = fx * cy + fz * sy;
        const wz = -fx * sy + fz * cy;

        moveDir.set(wx, 0, wz);
        if (moveDir.lengthSq() > 0) moveDir.normalize();

        const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const speed = tunables.moveSpeed * (running ? tunables.runMultiplier : 1.0);
        return { dir: moveDir, speed, running };
    }

    // -----------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------
    function update(dt) {
        if (!enabled) return;
        // Tick attack cooldown. Reset only on swing-end transition below.
        if (attackCooldownTimer > 0) {
            attackCooldownTimer = Math.max(0, attackCooldownTimer - dt);
        }

        const { dir, speed, running } = readInput();
        const isMoving = dir.lengthSq() > 0.001;

        // Move player
        if (isMoving) {
            const step = speed * dt;
            player.position.x += dir.x * step;
            player.position.z += dir.z * step;
            // Clamp to ground plane bounds (50×50 → [-25,25])
            player.position.x = Math.max(-25, Math.min(25, player.position.x));
            player.position.z = Math.max(-25, Math.min(25, player.position.z));
            player.userData.setState(running ? 'run' : 'walk');
        } else {
            player.userData.setState('idle');
        }

        // End-of-swing latch: when the character leaves 'attack' state, arm
        // the user-facing cooldown. setState('idle'/'walk'/'run') is a no-op
        // while attacking, so the first setState after a swing ends will
        // take effect AND we'll catch the transition right here.
        const attackingNow = isAttacking();
        if (wasAttacking && !attackingNow) {
            attackCooldownTimer = tunables.attackCooldown;
        }
        wasAttacking = attackingNow;

        // Smoothly rotate player to face movement direction
        if (isMoving) {
            const targetYaw = Math.atan2(dir.x, dir.z);
            let delta = targetYaw - facingYaw;
            // Wrap to [-π, π]
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;

            facingYaw += delta * Math.min(1, dt * ROTATION_SPEED);
            player.rotation.y = facingYaw;
        }

        // -----------------------------------------------------------------
        // Jump physics — apply vertical velocity then gravity.
        // Runs every frame regardless of movement so the player can jump
        // while standing still, walking, or running.
        // -----------------------------------------------------------------
        if (!isGrounded) {
            verticalVelocity -= tunables.gravity * dt;
            player.position.y += verticalVelocity * dt;
            if (player.position.y <= PLAYER_GROUND_Y) {
                player.position.y = PLAYER_GROUND_Y;
                verticalVelocity = 0;
                isGrounded = true;
            }
        }

        // Animate character
        player.userData.update(dt);

        // -----------------------------------------------------------------
        // Third-person camera follow
        // -----------------------------------------------------------------
        // In follow mode: controller positions the camera around the player.
        // In free mode: OrbitControls takes over — skip camera override.
        if (followMode) {
            // Compute desired camera position from spherical coords around player
            const cosPitch = Math.cos(camPitch);
            const sinPitch = Math.sin(camPitch);
            const offsetX = Math.sin(camYaw) * cosPitch * camDistance;
            const offsetY = sinPitch * camDistance + tunables.cameraHeight;
            const offsetZ = Math.cos(camYaw) * cosPitch * camDistance;

            camDesiredPos.set(
                player.position.x + offsetX,
                PLAYER_GROUND_Y + offsetY,
                player.position.z + offsetZ,
            );

            // Smooth toward desired position
            const smooth = 1 - Math.exp(-dt * tunables.cameraSmoothing);
            camera.position.lerp(camDesiredPos, smooth);

            // Smooth look-at target (chest height)
            camTarget.set(
                player.position.x,
                PLAYER_GROUND_Y + 1.0,
                player.position.z,
            );
            camera.lookAt(camTarget);
            // Keep OrbitControls target in sync
            const controls = opts.controls;
            if (controls && controls.target) {
                const now = performance.now() / 1000;
                if (!isFrameOverrideActive(now)) {
                    controls.target.lerp(camTarget, smooth);
                }
            }
        }
    }

    // -----------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------
    function dispose() {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        if (domElement) {
            domElement.removeEventListener('pointerdown', onPointerDown);
            domElement.removeEventListener('pointermove', onPointerMove);
            domElement.removeEventListener('pointerup', onPointerUp);
            domElement.removeEventListener('wheel', onWheel);
            domElement.removeEventListener('contextmenu', onContextMenu);
        }
        if (scene) scene.remove(player);
    }

    // -----------------------------------------------------------------
    // Public actions (used by the Player Control GUI folder)
    // -----------------------------------------------------------------
    function snapToPlayer() {
        // Re-frame the camera on the player. Useful after teleporting or
        // when the camera has drifted away from the player.
        placeCameraAtPlayer();
    }

    function teleport(x, z) {
        player.position.set(x, PLAYER_GROUND_Y, z);
        verticalVelocity = 0;
        isGrounded = true;
        snapToPlayer();
    }

    function setFollowMode(v) {
        followMode = v;
        const controls = opts.controls;
        if (controls) {
            controls.enableRotate = !v;
            // enablePan stays ON always — Right-Drag pan works regardless.
        }
        if (v) {
            // Re-snap camera to player when re-entering follow mode
            placeCameraAtPlayer();
        }
    }
    function isFollowMode() { return followMode; }

    return {
        player,
        cameraTarget: camTarget,
        update,
        setEnabled,
        dispose,
        snapToPlayer,
        teleport,
        setFollowMode,
        isFollowMode,
        // Attack API — external code (GUI, scene, future hitbox pass)
        // interacts with the swing through this surface.
        tryAttack,                         // attempt a swing; returns bool
        isAttacking,                       // boolean accessor (method)
        getAttackCooldown: () => attackCooldownTimer,
        onAttackStart(fn) {                // subscribe to swing start
            onAttackStartListeners.add(fn);
            return () => onAttackStartListeners.delete(fn);
        },
        onAttackActive(fn) {               // subscribe to active window
            onAttackActiveListeners.add(fn);
            return () => onAttackActiveListeners.delete(fn);
        },
        setAttackInputMode(mode) {
            attackInputMode = (mode === 'RMB') ? 'RMB' : 'LMB';
        },
        getAttackInputMode: () => attackInputMode,
        // Live-tunables: GUI sliders write directly to these fields.
        // Reading them lets callers (HUD, debug overlay) show current values.
        get moveSpeed() { return tunables.moveSpeed; },
        set moveSpeed(v) { tunables.moveSpeed = v; },
        get runMultiplier() { return tunables.runMultiplier; },
        set runMultiplier(v) { tunables.runMultiplier = v; },
        get jumpVelocity() { return tunables.jumpVelocity; },
        set jumpVelocity(v) { tunables.jumpVelocity = v; },
        get gravity() { return tunables.gravity; },
        set gravity(v) { tunables.gravity = v; },
        get cameraDistance() { return tunables.cameraDistance; },
        set cameraDistance(v) {
            tunables.cameraDistance = v;
            camDistance = v;
        },
        get cameraHeight() { return tunables.cameraHeight; },
        set cameraHeight(v) { tunables.cameraHeight = v; },
        get cameraSmoothing() { return tunables.cameraSmoothing; },
        set cameraSmoothing(v) { tunables.cameraSmoothing = v; },
        get attackDuration() { return tunables.attackDuration; },
        set attackDuration(v) {
            tunables.attackDuration = v;
            // Live-update character spec so the swing curve changes mid-game
            const timing = player.userData.getAttackTiming();
            timing.duration = v;
        },
        get attackCooldown() { return tunables.attackCooldown; },
        set attackCooldown(v) { tunables.attackCooldown = v; },
        // Useful state accessors
        getPosition: () => player.position,
        getYaw: () => camYaw,
        getPitch: () => camPitch,
    };
}
