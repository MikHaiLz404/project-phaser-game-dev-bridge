/**
 * createWildlife.js — ambient forest animals that wander, flee, and
 * randomly respawn.
 *
 * Three species, all built from primitives (no external assets):
 *   • rabbit  — small, white/brown, long ears, hops slowly
 *   • deer    — larger, brown body + neck + head, walks
 *   • squirrel — tiny, bushy tail, quick scurrying
 *
 * Behaviour (state machine per animal):
 *   WANDER → pick random waypoint inside forest bounds, walk toward it,
 *            pause briefly, repeat.
 *   FLEE   → if the player comes within `fleeRadius`, run directly away
 *            from the player at `fleeSpeed`.
 *   DESPAWN/RESPAWN → if an animal drifts too far from its spawn anchor
 *            (flee escape) it is removed and re-spawned at a fresh random
 *            position after a delay — gives the forest a "randomly
 *            spawning wildlife" feel without an ever-growing herd.
 *
 * Usage:
 *   const wildlife = createWildlife({ scene, count: 8, bounds, playerRef });
 *   wildlife.update(dt);          // pass playerRef as { position } or null
 *   wildlife.dispose();
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {number} [opts.count=8]
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} [opts.bounds]
 * @param {{position:THREE.Vector3}|null} [opts.playerRef] — live ref to the player mesh
 * @returns {{ update: Function, dispose: Function, animals: Array, group: THREE.Group }}
 */

import * as THREE from 'three';

const SPECIES = ['rabbit', 'deer', 'squirrel'];

export default function createWildlife(opts = {}) {
    const scene = opts.scene;
    const count = opts.count ?? 8;
    const bounds = opts.bounds ?? { minX: -20, maxX: 20, minZ: -32, maxZ: -62 };
    const playerRef = opts.playerRef ?? null;
    const walkSpeed = 1.6;
    const fleeSpeed = 5.5;
    const fleeRadius = 6.0;
    const respawnEscapeRadius = 18.0;
    const waypointTolerance = 0.6;
    const minIdleSeconds = 1.0;
    const maxIdleSeconds = 3.5;

    const group = new THREE.Group();
    group.name = 'forest-wildlife';
    if (scene) scene.add(group);

    function rand(min, max) { return min + Math.random() * (max - min); }
    function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    /** Build a species mesh, feet at origin. */
    function buildAnimal(species) {
        if (species === 'rabbit') return buildRabbit();
        if (species === 'deer') return buildDeer();
        return buildSquirrel();
    }

    const animals = [];
    for (let i = 0; i < count; i++) {
        const species = pickFrom(SPECIES);
        const mesh = buildAnimal(species);
        mesh.name = `wild-${species}-${i}`;

        const x = rand(bounds.minX, bounds.maxX);
        const z = rand(bounds.minZ, bounds.maxZ);
        mesh.position.set(x, -1, z);
        group.add(mesh);

        animals.push({
            mesh,
            species,
            target: new THREE.Vector3(x, -1, z),
            idleUntil: 0,
            fleeing: false,
            facing: Math.random() * Math.PI * 2,
            respawnAt: 0,
            anchor: new THREE.Vector3(x, -1, z),
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

    function respawn(state, now) {
        // Reposition at a fresh random spot inside the forest bounds.
        const x = rand(bounds.minX, bounds.maxX);
        const z = rand(bounds.minZ, bounds.maxZ);
        state.mesh.position.set(x, -1, z);
        state.target.set(x, -1, z);
        state.anchor.set(x, -1, z);
        state.idleUntil = now + rand(0.5, 2.0);
        state.fleeing = false;
        state.respawnAt = 0;
        state.mesh.visible = true;
    }

    function update(dt) {
        _time += dt;
        const now = performance.now() / 1000;

        animals.forEach((state) => {
            const { mesh } = state;

            // Respawn pending?
            if (state.respawnAt > 0) {
                if (now >= state.respawnAt) {
                    respawn(state, now);
                    bobAnimal(mesh, state.species, false, state.facing);
                }
                return;
            }

            const px = playerRef?.position ? playerRef.position.x : null;
            const pz = playerRef?.position ? playerRef.position.z : null;
            const distToPlayer = (px !== null)
                ? Math.hypot(mesh.position.x - px, mesh.position.z - pz)
                : Infinity;

            // Distance from spawn anchor — escape too far → despawn/respawn
            const escapeDist = Math.hypot(
                mesh.position.x - state.anchor.x,
                mesh.position.z - state.anchor.z,
            );
            if (escapeDist > respawnEscapeRadius) {
                mesh.visible = false;
                state.respawnAt = now + rand(2.0, 5.0);
                return;
            }

            // Player close → flee
            if (distToPlayer < fleeRadius) {
                state.fleeing = true;
                state.idleUntil = 0;
                const dx = mesh.position.x - px;
                const dz = mesh.position.z - pz;
                const d = Math.hypot(dx, dz) || 1;
                const step = fleeSpeed * dt;
                mesh.position.x += (dx / d) * step;
                mesh.position.z += (dz / d) * step;

                const targetYaw = Math.atan2(dx / d, dz / d);
                let delta = targetYaw - state.facing;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                state.facing += delta * Math.min(1, dt * 6);
                mesh.rotation.y = state.facing;

                bobAnimal(mesh, state.species, true, state.facing);
                return;
            }

            // Normal wander behaviour
            const dx = state.target.x - mesh.position.x;
            const dz = state.target.z - mesh.position.z;
            const dist = Math.hypot(dx, dz);

            if (state.idleUntil > now) {
                bobAnimal(mesh, state.species, false, state.facing);
            } else if (dist < waypointTolerance) {
                state.idleUntil = now + rand(minIdleSeconds, maxIdleSeconds);
                pickNewWaypoint(state);
                bobAnimal(mesh, state.species, false, state.facing);
            } else {
                const dirX = dx / dist;
                const dirZ = dz / dist;
                const step = walkSpeed * dt;
                mesh.position.x += dirX * step;
                mesh.position.z += dirZ * step;

                const targetYaw = Math.atan2(dirX, dirZ);
                let delta = targetYaw - state.facing;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                state.facing += delta * Math.min(1, dt * 5);
                mesh.rotation.y = state.facing;

                bobAnimal(mesh, state.species, false, state.facing);
            }
        });
    }

    /**
     * Gentle procedural motion so animals feel alive: rabbits hop (y bob),
     * deer walk with a sway, squirrels scurry with a fast wiggle.
     */
    let _time = 0;
    function bobAnimal(mesh, species, fleeing, facing) {
        const t = _time;
        const speedMul = fleeing ? 2.2 : 1.0;
        if (species === 'rabbit') {
            mesh.position.y = -1 + Math.abs(Math.sin(t * 6 * speedMul)) * 0.12;
        } else if (species === 'deer') {
            mesh.position.y = -1 + Math.sin(t * 3 * speedMul) * 0.02;
            mesh.rotation.z = Math.sin(t * 4 * speedMul) * 0.03;
        } else {
            // squirrel — subtle wiggle
            mesh.rotation.y = facing + Math.sin(t * 10 * speedMul) * 0.01;
        }
    }

    function dispose() {
        if (scene) scene.remove(group);
        animals.forEach(({ mesh }) => {
            mesh.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose?.();
            });
        });
    }

    return { update, dispose, animals, group };
}

// ---------------------------------------------------------------------
// Species builders — feet at local origin, +Z is forward
// ---------------------------------------------------------------------
function buildRabbit() {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0xe8e0d0 : 0x9a8a78,
        roughness: 0.9,
    });

    // body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur);
    body.scale.set(1.15, 0.85, 1.3);
    body.position.set(0, 0.22, 0);
    body.castShadow = true;
    g.add(body);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fur);
    head.position.set(0, 0.4, 0.28);
    head.castShadow = true;
    g.add(head);

    // ears
    const earMat = fur;
    [-0.06, 0.06].forEach((side) => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), earMat);
        ear.position.set(side, 0.58, 0.3);
        ear.scale.set(0.55, 1.9, 0.55);
        ear.castShadow = true;
        g.add(ear);
    });

    // tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), earMat);
    tail.position.set(0, 0.22, -0.32);
    g.add(tail);

    return g;
}

function buildDeer() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.9 });

    // legs
    [-0.22, 0.22].forEach((sideX) => {
        [-0.18, 0.18].forEach((sideZ) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.42, 6), darkMat);
            leg.position.set(sideX, 0.21, sideZ);
            leg.castShadow = true;
            g.add(leg);
        });
    });

    // body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), bodyMat);
    body.scale.set(1.15, 0.8, 1.35);
    body.position.set(0, 0.48, 0);
    body.castShadow = true;
    g.add(body);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.42, 6), bodyMat);
    neck.position.set(0, 0.78, 0.32);
    neck.rotation.x = 0.35;
    neck.castShadow = true;
    g.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bodyMat);
    head.position.set(0, 0.98, 0.5);
    head.scale.set(0.9, 0.8, 1.1);
    head.castShadow = true;
    g.add(head);

    // antlers (only on some deer)
    if (Math.random() > 0.4) {
        const antlerMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
        [-0.05, 0.05].forEach((side) => {
            const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.28, 4), antlerMat);
            antler.position.set(side, 1.14, 0.5);
            antler.rotation.z = side * 1.4;
            antler.rotation.x = -0.3;
            g.add(antler);
        });
    }

    // tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), darkMat);
    tail.position.set(0, 0.56, -0.42);
    g.add(tail);

    return g;
}

function buildSquirrel() {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0xb07040 : 0x9a6040,
        roughness: 0.9,
    });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xe8d8b8, roughness: 0.9 });

    // body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
    body.scale.set(1.1, 0.9, 1.3);
    body.position.set(0, 0.14, 0);
    body.castShadow = true;
    g.add(body);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
    head.position.set(0, 0.26, 0.17);
    head.castShadow = true;
    g.add(head);

    // tail — big bushy curve
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fur);
    tail.position.set(0, 0.3, -0.2);
    tail.scale.set(0.7, 1.6, 1.1);
    tail.rotation.x = -0.5;
    tail.castShadow = true;
    g.add(tail);

    // belly patch
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lightMat);
    belly.position.set(0, 0.12, 0.13);
    belly.scale.set(0.9, 0.8, 0.7);
    g.add(belly);

    return g;
}
