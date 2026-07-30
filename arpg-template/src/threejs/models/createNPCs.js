/**
 * createNPCs.js — ambient villagers that wander around the village.
 *
 * Spawns a configurable number of low-poly characters that walk along
 * random waypoints within the village bounds. Each NPC has its own
 * idle/walk state and gentle procedural animation.
 *
 * Usage:
 *   const npcs = createNPCs({ count: 5, scene, bounds: { minX, maxX, minZ, maxZ } });
 *   npcs.update(dt);
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {number} [opts.count=5]
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} [opts.bounds]
 * @param {number} [opts.walkSpeed=2.0]
 * @returns {{ update: Function, dispose: Function, npcs: Array }}
 */

import * as THREE from 'three';
import createCharacter from './createCharacter.js';

const SHIRT_PALETTE = [
    0x6b8aa6, 0xa66b8a, 0x8aa66b, 0xa68a6b, 0x6ba68a, 0xa66b6b,
    0x4a6a8a, 0x8a4a6a, 0x4a8a6a, 0xc89060, 0x6070a0, 0xa06070,
];
const PANTS_PALETTE = [0x3a4a5e, 0x4a3a5e, 0x3a5e4a, 0x5e4a3a, 0x5e3a4a, 0x2a3a4e];
const SKIN_PALETTE = [0xe8b89a, 0xd9a584, 0xc89172, 0xb88260, 0xf0c8a8];

export default function createNPCs(opts = {}) {
    const scene = opts.scene;
    const count = opts.count ?? 5;
    const bounds = opts.bounds ?? { minX: -22, maxX: 22, minZ: -22, maxZ: 22 };
    const walkSpeed = opts.walkSpeed ?? 2.0;
    const waypointTolerance = 0.5;
    const minIdleSeconds = 1.5;
    const maxIdleSeconds = 4.0;

    const npcs = [];
    const group = new THREE.Group();
    group.name = 'village-npcs';
    if (scene) scene.add(group);

    function rand(min, max) { return min + Math.random() * (max - min); }
    function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    for (let i = 0; i < count; i++) {
        const npc = createCharacter({
            name: `npc-${i}`,
            skinColor: pickFrom(SKIN_PALETTE),
            shirtColor: pickFrom(SHIRT_PALETTE),
            pantsColor: pickFrom(PANTS_PALETTE),
            hairColor: pickFrom([0x3a2a1a, 0x2a1a0a, 0x4a3a1a, 0x1a0a05]),
            shoesColor: 0x2a1a0a,
            scale: 0.9 + Math.random() * 0.15,
            equipSword: false,  // villagers don't carry swords
        });
        // Ground plane is at y=-1; place NPC feet there.
        const initialX = rand(bounds.minX, bounds.maxX);
        const initialZ = rand(bounds.minZ, bounds.maxZ);
        npc.position.set(initialX, -1, initialZ);
        group.add(npc);

        npcs.push({
            mesh: npc,
            target: new THREE.Vector3(initialX, -1, initialZ),
            idleUntil: 0,
            facing: Math.random() * Math.PI * 2,
        });
    }

    function pickNewWaypoint(npcState) {
        npcState.target.set(
            rand(bounds.minX, bounds.maxX),
            -1,
            rand(bounds.minZ, bounds.maxZ),
        );
        npcState.idleUntil = 0;
    }

    function update(dt) {
        const now = performance.now() / 1000;
        npcs.forEach((state) => {
            const { mesh, target } = state;
            const dx = target.x - mesh.position.x;
            const dz = target.z - mesh.position.z;
            const dist = Math.hypot(dx, dz);

            if (state.idleUntil > now) {
                mesh.userData.setState('idle');
            } else if (dist < waypointTolerance) {
                // Reached waypoint — pause, then pick a new one
                state.idleUntil = now + rand(minIdleSeconds, maxIdleSeconds);
                pickNewWaypoint(state);
                mesh.userData.setState('idle');
            } else {
                // Walk toward waypoint
                const dirX = dx / dist;
                const dirZ = dz / dist;
                const step = walkSpeed * dt;
                mesh.position.x += dirX * step;
                mesh.position.z += dirZ * step;

                // Face movement direction (smooth)
                const targetYaw = Math.atan2(dirX, dirZ);
                let delta = targetYaw - state.facing;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                state.facing += delta * Math.min(1, dt * 4);
                mesh.rotation.y = state.facing;

                mesh.userData.setState('walk');
            }

            mesh.userData.update(dt);
        });
    }

    function dispose() {
        if (scene) scene.remove(group);
        npcs.forEach(({ mesh }) => {
            mesh.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose?.();
            });
        });
    }

    return { update, dispose, npcs, group };
}
