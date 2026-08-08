/**
 * createForest.js — procedural forest zone north of the village.
 *
 * A dense tree cluster with bushes, mushrooms, flowers, rocks, and a
 * dirt path that connects the village edge (z ≈ -24) to the forest
 * clearing. Follows the same img2threejs-style factory convention as
 * createAsianVillage: returns a THREE.Group, transform flows through
 * spec, addToWorld hooks into window.__three.world when requested.
 *
 * Layout (world units):
 *   Forest zone:      x ∈ [-22, 22],  z ∈ [-26, -64]
 *   Dirt path:        z ∈ [-24, -30] connecting village → forest
 *   Tree canopy grid: 5 × 6 with jitter, ~30 trees
 */

import * as THREE from 'three';

// Deterministic-ish RNG (Mulberry32) so reloads stay stable during dev.
let _seed = 4242;
function rand() {
    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function jitter(value, spread) {
    return value + (rand() - 0.5) * 2 * spread;
}
function pickFrom(arr) {
    return arr[Math.floor(rand() * arr.length)];
}

const TREE_GREENS = [0x2a5a2a, 0x3a6a2e, 0x1e4a22, 0x356a3a, 0x2e6a28];
const BUSH_GREENS = [0x2e5e2a, 0x3a6e32, 0x265626];
const FLOWER_COLORS = [0xffcc55, 0xff77aa, 0x77aaff, 0xffffff, 0xff8844];

/**
 * @param {object} spec  img2threejs-style ObjectSculptSpec (optional).
 * @param {{addToWorld?:boolean}} opts
 * @returns {THREE.Group}
 */
export default function createForest(spec = {}, opts = {}) {
    const forest = new THREE.Group();
    forest.name = 'forest';

    _seed = 4242; // repeatable across reloads

    // -----------------------------------------------------------------
    // Shared materials
    // -----------------------------------------------------------------
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95, metalness: 0.0 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a6a2e, roughness: 0.95, metalness: 0.0 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6a5e, roughness: 0.9, metalness: 0.05 });
    const mushroomCapMat = new THREE.MeshStandardMaterial({ color: 0xcc3344, roughness: 0.7, metalness: 0.0 });
    const mushroomStemMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8, metalness: 0.0 });
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9, metalness: 0.0 });

    // -----------------------------------------------------------------
    // Forest floor — a slightly raised grass plane so the zone reads as
    // distinct terrain from the village dirt.
    // -----------------------------------------------------------------
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(46, 40),
        grassMat
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.97, -45);
    floor.receiveShadow = true;
    floor.name = 'forest-floor';
    forest.add(floor);

    // -----------------------------------------------------------------
    // Dirt path — connects the village (south, z ≈ -22) into the forest
    // (north, z ≈ -64). A few flat dirt patches stepping north.
    // -----------------------------------------------------------------
    for (let i = 0; i < 9; i++) {
        const segZ = -24 - i * 4.5;
        const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(3.4 + jitter(0.2, 0.6), 4.2),
            dirtMat
        );
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(jitter(0, 0.5), -0.96, segZ);
        patch.receiveShadow = true;
        patch.name = `path-seg-${i}`;
        forest.add(patch);
    }

    // -----------------------------------------------------------------
    // Tree ring / clearing marker where the path ends
    // -----------------------------------------------------------------
    const clearing = new THREE.Mesh(
        new THREE.CircleGeometry(2.2, 16),
        dirtMat
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(0, -0.96, -63);
    clearing.receiveShadow = true;
    clearing.name = 'forest-clearing';
    forest.add(clearing);

    // -----------------------------------------------------------------
    // Trees — dense grid with jitter, 5 columns × 6 rows
    // -----------------------------------------------------------------
    const treePositions = [];
    for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 6; row++) {
            const x = -18 + col * 9 + jitter(0, 1.6);
            const z = -30 - row * 5.6 + jitter(0, 1.4);
            treePositions.push({ x, z });
        }
    }

    treePositions.forEach((pos, i) => {
        const size = pickFrom([0.8, 1.0, 1.2, 1.4, 0.9]);
        const tree = buildForestTree({
            trunkHeight: 1.8 * size,
            trunkRadius: 0.09 * size,
            canopyRadius: 1.0 * size,
            canopyColor: pickFrom(TREE_GREENS),
        });
        tree.name = `forest-tree-${String(i).padStart(2, '0')}`;
        tree.position.set(pos.x, -1.0, pos.z);
        tree.rotation.y = rand() * Math.PI * 2;
        forest.add(tree);
    });

    // -----------------------------------------------------------------
    // Fallen log — a tilted cylinder near the clearing
    // -----------------------------------------------------------------
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8), logMat);
    log.position.set(4.5, -0.85, -58);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.4;
    log.castShadow = true;
    log.receiveShadow = true;
    log.name = 'fallen-log';
    forest.add(log);

    // -----------------------------------------------------------------
    // Bushes — scattered between trees
    // -----------------------------------------------------------------
    for (let i = 0; i < 16; i++) {
        const x = jitter(0, 20);
        const z = -33 - rand() * 28;
        const bush = buildBush(pickFrom(BUSH_GREENS), 0.35 + rand() * 0.4);
        bush.name = `bush-${i}`;
        bush.position.set(x, -1.0, z);
        forest.add(bush);
    }

    // -----------------------------------------------------------------
    // Mushrooms — small red-capped clusters
    // -----------------------------------------------------------------
    for (let i = 0; i < 12; i++) {
        const x = jitter(0, 20);
        const z = -32 - rand() * 30;
        const mushroom = buildMushroom(mushroomStemMat, mushroomCapMat);
        mushroom.name = `mushroom-${i}`;
        mushroom.position.set(x, -1.0, z);
        mushroom.scale.setScalar(0.8 + rand() * 0.6);
        forest.add(mushroom);
    }

    // -----------------------------------------------------------------
    // Flowers — tiny colored tufts
    // -----------------------------------------------------------------
    for (let i = 0; i < 20; i++) {
        const x = jitter(0, 21);
        const z = -31 - rand() * 31;
        const flower = buildFlower(pickFrom(FLOWER_COLORS));
        flower.name = `flower-${i}`;
        flower.position.set(x, -1.0, z);
        forest.add(flower);
    }

    // -----------------------------------------------------------------
    // Rocks — gray chunks near the path + clearing
    // -----------------------------------------------------------------
    const rockSpots = [
        { x: 3.2, z: -28 }, { x: -3.4, z: -34 }, { x: 6.0, z: -52 },
        { x: -5.6, z: -55 }, { x: 2.4, z: -63 }, { x: -2.8, z: -62 },
        { x: 9.5, z: -38 }, { x: -8.8, z: -44 },
    ];
    rockSpots.forEach((pos, i) => {
        const rock = buildRock(rockMat, 0.25 + rand() * 0.3);
        rock.name = `rock-${i}`;
        rock.position.set(pos.x, -1.0, pos.z);
        rock.rotation.y = rand() * Math.PI;
        forest.add(rock);
    });

    // -----------------------------------------------------------------
    // Spec-driven transform (img2threejs convention)
    // -----------------------------------------------------------------
    if (spec.position) {
        forest.position.set(spec.position.x ?? 0, spec.position.y ?? 0, spec.position.z ?? 0);
    }
    if (spec.rotation) {
        forest.rotation.set(spec.rotation.x ?? 0, spec.rotation.y ?? 0, spec.rotation.z ?? 0);
    }
    if (spec.scale) {
        forest.scale.set(spec.scale.x ?? 1, spec.scale.y ?? 1, spec.scale.z ?? 1);
    }

    if (opts.addToWorld && typeof window !== 'undefined' && window.__three?.world) {
        window.__three.world.add(forest);
    }

    return forest;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function buildForestTree({ trunkHeight, trunkRadius, canopyRadius, canopyColor }) {
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.95 });
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 8),
        trunkMat
    );
    trunk.position.set(0, trunkHeight / 2, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    const leavesMat = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.85 });
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(canopyRadius, 10, 8), leavesMat);
    c1.position.set(0, trunkHeight + canopyRadius * 0.6, 0);
    c1.scale.set(1.3, 0.95, 1.3);
    c1.castShadow = true;
    tree.add(c1);

    const c2 = new THREE.Mesh(new THREE.SphereGeometry(canopyRadius * 0.65, 10, 8), leavesMat);
    c2.position.set(0.25, trunkHeight + canopyRadius * 1.25, 0.15);
    c2.castShadow = true;
    tree.add(c2);

    return tree;
}

function buildBush(color, radius) {
    const bush = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), mat);
    b1.position.set(0, radius * 0.6, 0);
    b1.castShadow = true;
    bush.add(b1);

    const b2 = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.7, 8, 6), mat);
    b2.position.set(radius * 0.55, radius * 0.35, radius * 0.2);
    b2.castShadow = true;
    bush.add(b2);

    const b3 = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.6, 8, 6), mat);
    b3.position.set(-radius * 0.5, radius * 0.3, -radius * 0.15);
    b3.castShadow = true;
    bush.add(b3);

    return bush;
}

function buildMushroom(stemMat, capMat) {
    const group = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 6), stemMat);
    stem.position.set(0, 0.11, 0);
    stem.castShadow = true;
    group.add(stem);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), capMat);
    cap.position.set(0, 0.24, 0);
    cap.scale.set(1.1, 0.6, 1.1);
    cap.castShadow = true;
    group.add(cap);

    return group;
}

function buildFlower(color) {
    const group = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.9 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 4), stemMat);
    stem.position.set(0, 0.09, 0);
    group.add(stem);

    const petalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), petalMat);
        petal.position.set(Math.cos(ang) * 0.06, 0.21, Math.sin(ang) * 0.06);
        group.add(petal);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffdd44, roughness: 0.6 }));
    center.position.set(0, 0.21, 0);
    group.add(center);

    return group;
}

function buildRock(mat, size) {
    const rock = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const main = new THREE.Mesh(geo, mat);
    main.position.set(0, size * 0.5, 0);
    main.scale.set(1, 0.6, 1);
    main.castShadow = true;
    main.receiveShadow = true;
    rock.add(main);

    const geo2 = new THREE.DodecahedronGeometry(size * 0.55, 0);
    const small = new THREE.Mesh(geo2, mat);
    small.position.set(size * 0.8, size * 0.28, size * 0.3);
    small.scale.set(1, 0.7, 1);
    small.castShadow = true;
    small.receiveShadow = true;
    rock.add(small);

    return rock;
}
