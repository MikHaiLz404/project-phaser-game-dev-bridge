/**
 * createGoblin.js — hostile goblins that patrol the forest and chase
 * the player when spotted.
 *
 * Goblins are low-poly humanoid enemies built from primitives: green
 * skin, pointed ears, a crude wooden club. No sword combat for now
 * (sword systems are on hold) — this module delivers the *presence* +
 * chase behaviour only.
 *
 * Behaviour (per goblin):
 *   PATROL → wander between random waypoints inside the forest bounds.
 *   CHASE  → if the player comes within `sightRadius`, run at the player.
 *   LOSE   → if the player escapes beyond `loseRadius`, return to patrol
 *            and walk back toward the goblin's home anchor.
 *
 * Usage:
 *   const goblins = createGoblins({ scene, count: 4, bounds, playerRef });
 *   goblins.update(dt);
 *   goblins.dispose();
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {number} [opts.count=4]
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} [opts.bounds]
 * @param {{position:THREE.Vector3}|null} [opts.playerRef] — live ref to the player mesh
 * @returns {{ update: Function, dispose: Function, goblins: Array, group: THREE.Group }}
 */

import * as THREE from 'three';

export default function createGoblins(opts = {}) {
    const scene = opts.scene;
    const count = opts.count ?? 4;
    const bounds = opts.bounds ?? { minX: -18, maxX: 18, minZ: -34, maxZ: -60 };
    const playerRef = opts.playerRef ?? null;
    const patrolSpeed = 1.4;
    const chaseSpeed = 4.2;
    const sightRadius = 9.0;
    const loseRadius = 16.0;
    const waypointTolerance = 0.6;
    const minIdleSeconds = 1.2;
    const maxIdleSeconds = 3.0;

    const group = new THREE.Group();
    group.name = 'forest-goblins';
    if (scene) scene.add(group);

    function rand(min, max) { return min + Math.random() * (max - min); }

    const goblins = [];
    for (let i = 0; i < count; i++) {
        const mesh = buildGoblin();
        mesh.name = `goblin-${i}`;

        const x = rand(bounds.minX, bounds.maxX);
        const z = rand(bounds.minZ, bounds.maxZ);
        mesh.position.set(x, -1, z);
        group.add(mesh);

        goblins.push({
            mesh,
            target: new THREE.Vector3(x, -1, z),
            idleUntil: 0,
            facing: Math.random() * Math.PI * 2,
            home: new THREE.Vector3(x, -1, z),
            state: 'patrol',   // 'patrol' | 'chase' | 'return'
            returningTo: new THREE.Vector3(x, -1, z),
        });
    }

    function pickNewWaypoint(state) {
        state.target.set(
            rand(bounds.minX, bounds.maxX),
            -1,
            rand(bounds.minZ, bounds.maxZ),
        );
        state.idleUntil = 0;
    }

    function walkToward(state, dest, speed, dt) {
        const { mesh } = state;
        const dx = dest.x - mesh.position.x;
        const dz = dest.z - mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < waypointTolerance) return true; // reached

        const dirX = dx / dist;
        const dirZ = dz / dist;
        const step = speed * dt;
        mesh.position.x += dirX * step;
        mesh.position.z += dirZ * step;

        const targetYaw = Math.atan2(dirX, dirZ);
        let delta = targetYaw - state.facing;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        state.facing += delta * Math.min(1, dt * 5);
        mesh.rotation.y = state.facing;

        return false;
    }

    function update(dt) {
        const now = performance.now() / 1000;

        goblins.forEach((state) => {
            const { mesh } = state;

            // Slight idle sway so goblins feel alive even when standing.
            mesh.position.y = -1 + Math.sin(now * 2.5 + (mesh.userData.goblinId ?? 0)) * 0.015;

            const px = playerRef?.position ? playerRef.position.x : null;
            const pz = playerRef?.position ? playerRef.position.z : null;
            const distToPlayer = (px !== null)
                ? Math.hypot(mesh.position.x - px, mesh.position.z - pz)
                : Infinity;

            // State transitions
            if (distToPlayer < sightRadius) {
                state.state = 'chase';
            } else if (state.state === 'chase' && distToPlayer > loseRadius) {
                state.state = 'return';
                state.returningTo.copy(state.home);
            }

            if (state.state === 'chase') {
                // Run straight at the player
                const dx = px - mesh.position.x;
                const dz = pz - mesh.position.z;
                const d = Math.hypot(dx, dz) || 1;
                const step = chaseSpeed * dt;
                mesh.position.x += (dx / d) * step;
                mesh.position.z += (dz / d) * step;

                const targetYaw = Math.atan2(dx / d, dz / d);
                let delta = targetYaw - state.facing;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                state.facing += delta * Math.min(1, dt * 8);
                mesh.rotation.y = state.facing;
                return;
            }

            if (state.state === 'return') {
                const reached = walkToward(state, state.returningTo, patrolSpeed * 1.4, dt);
                if (reached) state.state = 'patrol';
                return;
            }

            // Patrol — wander between waypoints
            if (state.idleUntil > now) {
                // idle
            } else {
                const reached = walkToward(state, state.target, patrolSpeed, dt);
                if (reached) {
                    state.idleUntil = now + rand(minIdleSeconds, maxIdleSeconds);
                    pickNewWaypoint(state);
                }
            }
        });
    }

    function dispose() {
        if (scene) scene.remove(group);
        goblins.forEach(({ mesh }) => {
            mesh.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose?.();
            });
        });
    }

    return { update, dispose, goblins, group };
}

// ---------------------------------------------------------------------
// Goblin builder — green humanoid with pointed ears + wooden club.
// Feet at local origin, +Z is forward.
// ---------------------------------------------------------------------
let _goblinId = 0;
function buildGoblin() {
    const g = new THREE.Group();
    g.userData.goblinId = _goblinId++;

    const skinMat = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.85 });
    const skinDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a6e2e, roughness: 0.85 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });

    const scale = 0.85;

    // legs
    [-0.12, 0.12].forEach((side) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 6), skinDarkMat);
        leg.position.set(side, 0.17, 0);
        leg.castShadow = true;
        g.add(leg);
    });

    // body — short, slightly hunched
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), clothMat);
    body.scale.set(1.05, 1.15, 0.9);
    body.position.set(0, 0.5, 0);
    body.castShadow = true;
    g.add(body);

    // arms
    [-0.28, 0.28].forEach((side) => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.32, 6), skinMat);
        arm.position.set(side, 0.62, 0.05);
        arm.castShadow = true;
        g.add(arm);
    });

    // head — big, round
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
    head.position.set(0, 0.9, 0);
    head.castShadow = true;
    g.add(head);

    // pointed ears
    [-0.17, 0.17].forEach((side) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), skinMat);
        ear.position.set(side, 0.95, 0);
        ear.rotation.z = side * -0.5;
        ear.rotation.y = side * 0.4;
        ear.castShadow = true;
        g.add(ear);
    });

    // eyes — angry red
    [-0.07, 0.07].forEach((side) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), new THREE.MeshStandardMaterial({
            color: 0xdd2222,
            emissive: 0x881111,
            emissiveIntensity: 0.6,
        }));
        eye.position.set(side, 0.93, 0.17);
        g.add(eye);
    });

    // wooden club — held in right hand, resting on shoulder
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.9, 7), woodMat);
    club.position.set(0.28, 0.78, 0.12);
    club.rotation.z = -0.35;
    club.rotation.x = 0.5;
    club.castShadow = true;
    g.add(club);

    g.scale.setScalar(scale);
    return g;
}
