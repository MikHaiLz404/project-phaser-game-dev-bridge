/**
 * createAsianVillage.js — procedural Asian village scene.
 *
 * Builds a small village of 10 houses arranged around a central plaza
 * with two roads. Houses vary in size, wood tint, and orientation;
 * 2 of them are flagged as shops with extra counter/awning props.
 * Trees, paths, fences, a river, and decorative lanterns round out
 * the scene.
 *
 * Mirrors the img2threejs `ObjectSculptSpec` convention for the whole
 * village: position/rotation/scale flow through to the root group.
 */

import * as THREE from 'three';
import createAsianHouse from './createAsianHouse.js';

// Deterministic-ish RNG so each reload still produces variation but
// stays readable during dev. A single PRNG keeps layout stable for now.
let _seed = 1729;
function rand() {
    // Mulberry32
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

/**
 * @param {object} spec          img2threejs-style ObjectSculptSpec (optional).
 * @param {{addToWorld?:boolean}} opts
 * @returns {THREE.Group}
 */
export default function createAsianVillage(spec = {}, opts = {}) {
    const village = new THREE.Group();
    village.name = 'asian-village';

    _seed = 1729; // reset so the layout is repeatable across reloads

    // -----------------------------------------------------------------
    // Shared materials (reused across many meshes)
    // -----------------------------------------------------------------
    const roadMat = new THREE.MeshStandardMaterial({ color: 0xa89880, roughness: 0.95, metalness: 0.0 });
    const woodTints = [0x8a6a3a, 0x9a7a4a, 0x6a4a2a];
    const matWood = new THREE.MeshStandardMaterial({ color: woodTints[0], roughness: 0.85, metalness: 0.05 });
    const matWoodDark = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 0.85, metalness: 0.05 });
    const matStone = new THREE.MeshStandardMaterial({ color: 0xc8bfb5, roughness: 0.95, metalness: 0.0 });
    const matStoneDark = new THREE.MeshStandardMaterial({ color: 0x9a8e7e, roughness: 0.95, metalness: 0.0 });
    const matGroundStone = new THREE.MeshStandardMaterial({ color: 0x80766a, roughness: 0.95, metalness: 0.0 });

    // -----------------------------------------------------------------
    // Plaza — central octagonal stone tile
    // -----------------------------------------------------------------
    const plaza = new THREE.Mesh(
        new THREE.CylinderGeometry(3.5, 3.5, 0.06, 16),
        matStone
    );
    plaza.position.set(0, -0.95, 0);
    plaza.name = 'plaza';
    plaza.receiveShadow = true;
    village.add(plaza);

    // -----------------------------------------------------------------
    // Main road — runs east-west through the plaza (4 units wide)
    // -----------------------------------------------------------------
    const mainRoad = new THREE.Mesh(
        new THREE.BoxGeometry(36, 0.04, 3),
        roadMat
    );
    mainRoad.position.set(0, -0.97, 0);
    mainRoad.name = 'main-road';
    mainRoad.receiveShadow = true;
    village.add(mainRoad);

    // Secondary road — runs north-south through the plaza, extended past river+houses
    const sideRoad = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.04, 30),
        roadMat
    );
    sideRoad.position.set(0, -0.97, 0);
    sideRoad.name = 'side-road';
    sideRoad.receiveShadow = true;
    village.add(sideRoad);

    // Stone kerb along the roads — thin gray strips at the edges
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xaaa094, roughness: 0.9 });
    for (let i = -13; i <= 13; i += 2) {
        [-1.7, 1.7].forEach((side) => {
            const kerb = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.15), kerbMat);
            kerb.position.set(i, -0.95, side);
            kerb.name = 'road-kerb-' + (side > 0 ? 'n' : 's') + '-' + i;
            kerb.receiveShadow = true;
            village.add(kerb);
        });
    }
    for (let j = -10; j <= 10; j += 2) {
        [-1.7, 1.7].forEach((side) => {
            const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 1.8), kerbMat);
            kerb.position.set(side, -0.95, j);
            kerb.name = 'road-kerb-' + (side > 0 ? 'e' : 'w') + '-' + j;
            kerb.receiveShadow = true;
            village.add(kerb);
        });
    }

    // -----------------------------------------------------------------
    // River — thin blue strip running along the south edge
    // -----------------------------------------------------------------
    const river = new THREE.Mesh(
        new THREE.BoxGeometry(34, 0.02, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x5588bb, roughness: 0.2, metalness: 0.3 })
    );
    river.position.set(0, -0.98, 13);
    river.name = 'river';
    river.receiveShadow = true;
    village.add(river);

    // River bank edges
    const bankMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.95 });
    [-1, 1].forEach((side) => {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(34, 0.04, 0.5), bankMat);
        bank.position.set(0, -0.96, 13 + side * 1.15);
        bank.name = 'river-bank-' + (side > 0 ? 'far' : 'near');
        bank.receiveShadow = true;
        village.add(bank);
    });

    // Stone bridge crossing the river
    const bridge = new THREE.Group();
    bridge.name = 'bridge';
    const bridgeDeck = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.12, 2.6),
        matStone
    );
    bridgeDeck.position.set(0, -0.85, 13);
    bridgeDeck.castShadow = true;
    bridgeDeck.receiveShadow = true;
    bridge.add(bridgeDeck);
    // Railings
    [-1, 1].forEach((side) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.08), matWoodDark);
        rail.position.set(0, -0.6, 13 + side * 1.3);
        rail.castShadow = true;
        bridge.add(rail);
    });
    village.add(bridge);

    // -----------------------------------------------------------------
    // 10 houses placed on grid-based layout
    // -----------------------------------------------------------------
    const houseLayout = [
        // North inner row (facing south toward road)
        { x: -8, z: -8, rot: Math.PI,          shop: false },
        { x:  8, z: -8, rot: Math.PI,          shop: false },
        // North outer row (facing south)
        { x: -8, z: -18, rot: Math.PI,         shop: true  },  // bakery
        { x:  8, z: -18, rot: Math.PI,         shop: false },
        // East branch (facing west toward road)
        { x: 16, z: -6, rot: -Math.PI * 0.5,   shop: false },
        { x: 16, z:  6, rot: -Math.PI * 0.5,   shop: false },
        // West branch (facing east toward road)
        { x: -16, z: -6, rot: Math.PI * 0.5,   shop: false },
        { x: -16, z:  6, rot: Math.PI * 0.5,   shop: true  },  // fruit shop
        // South row (past river, facing north)
        { x: -8, z: 20, rot: 0,                shop: false },
        { x:  8, z: 20, rot: 0,                shop: false },
    ];

    houseLayout.forEach((entry, i) => {
        const scaleVar = jitter(1.0, 0.15);
        const rotVar = entry.rot + jitter(0, 0.18);
        const houseSpec = {
            position: { x: entry.x, y: 0, z: entry.z },
            rotation: { x: 0, y: rotVar, z: 0 },
            scale: { x: scaleVar, y: jitter(1.0, 0.1), z: scaleVar },
        };
        const house = createAsianHouse(houseSpec, { addToWorld: false });
        house.name = entry.shop ? `shop-${i}` : `house-${i}`;

        // Pick a wood tint and override the shared materials on the house.
        // (Each instance has its own materials; mutating affects only this house.)
        const tint = pickFrom(woodTints);
        house.traverse((child) => {
            if (!child.isMesh) return;
            const mat = child.material;
            if (!mat) return;
            if (mat.color && mat.color.getHex() === 0x8a6a3a) {
                mat.color.setHex(tint);
            }
        });

        if (entry.shop) {
            // Shop front — extra counter, awning, and produce crates
            buildShopFront(house, houseSpec, matWood, matWoodDark, matStoneDark);
        }

        village.add(house);
    });

    // -----------------------------------------------------------------
    // Big tree centerpiece (north of plaza)
    // -----------------------------------------------------------------
    const bigTree = buildTree({
        trunkHeight: 2.2,
        trunkRadius: 0.26,
        canopyColor: 0x4a7a35,
        canopyRadius: 1.4,
    });
    bigTree.name = 'big-tree';
    bigTree.position.set(0, -1.0, -22);
    village.add(bigTree);

    // -----------------------------------------------------------------
    // Trees behind houses — matching reference layout
    // -----------------------------------------------------------------
    const treePositions = [
        // Behind north houses (z further south = more negative)
        { x: -8, z: -12 },       // behind house-0
        { x:  8, z: -12 },       // behind house-1
        { x: -8, z: -23 },       // behind house-2 (shop)
        { x:  8, z: -23 },       // behind house-3
        // Behind east houses (x further east = more positive)
        { x: 20, z: -6 },        // behind house-4
        { x: 20, z:  6 },        // behind house-5
        // Behind west houses (x further west = more negative)
        { x: -20, z: -6 },       // behind house-6
        { x: -20, z:  6 },       // behind house-7 (shop)
        // Behind south houses (z further south = more positive, past river)
        { x: -8, z: 24 },        // behind house-8
        { x:  8, z: 24 },        // behind house-9
        // Extra trees for landscape fill
        { x: -14, z: -22 },
        { x:  14, z: -22 },
    ];
    const treeColors = [0x4a7a35, 0x5a8a40, 0x3a6a25];
    const treeSizes = [0.8, 1.0, 1.2, 0.9];
    treePositions.forEach((pos, i) => {
        const size = pickFrom(treeSizes);
        const tree = buildTree({
            trunkHeight: 1.4 * size,
            trunkRadius: 0.07 * size,
            canopyRadius: 0.8 * size,
            canopyColor: pickFrom(treeColors),
        });
        tree.name = 'tree-' + String(i).padStart(2, '0');
        tree.position.set(pos.x, -1.0, pos.z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        village.add(tree);
    });

    // -----------------------------------------------------------------
    // Plaza lantern + smaller lanterns at road junctions
    // -----------------------------------------------------------------
    const plazaLantern = buildLantern(matStoneDark, matStone);
    plazaLantern.name = 'plaza-lantern';
    plazaLantern.position.set(0, -0.95, 0);
    village.add(plazaLantern);

    // -----------------------------------------------------------------
    // Wooden fence segments on the south-west side (between river and houses)
    // -----------------------------------------------------------------
    const fenceMat = matWood;
    const fenceH = 0.4;
    const fenceT = 0.06;
    const fencePositions = [
        // south-west garden
        { x: -7,  z: 10.5, w: 3,   h: fenceH, d: fenceT, rotY: 0 },
        { x: -10, z: 9,   w: fenceT, h: fenceH, d: 3,   rotY: 0 },
        { x: -10, z: 6.5, w: fenceT, h: fenceH, d: 3,   rotY: 0 },
    ];
    fencePositions.forEach((p, i) => {
        const fence = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), fenceMat);
        fence.position.set(p.x, -0.97 + p.h / 2, p.z);
        fence.rotation.y = p.rotY;
        fence.name = 'fence-' + i;
        fence.castShadow = true;
        fence.receiveShadow = true;
        village.add(fence);
    });

    // Apply spec-driven transform to the whole village group
    if (spec.position) {
        village.position.set(spec.position.x ?? 0, spec.position.y ?? 0, spec.position.z ?? 0);
    }
    if (spec.rotation) {
        village.rotation.set(spec.rotation.x ?? 0, spec.rotation.y ?? 0, spec.rotation.z ?? 0);
    }
    if (spec.scale) {
        village.scale.set(spec.scale.x ?? 1, spec.scale.y ?? 1, spec.scale.z ?? 1);
    }

    if (opts.addToWorld && typeof window !== 'undefined' && window.__three?.world) {
        window.__three.world.add(village);
    }

    return village;
}

// ---------------------------------------------------------------------
// Helper: build a simple tree (trunk + 2 stacked sphere canopy)
// ---------------------------------------------------------------------
function buildTree({ trunkHeight, trunkRadius, canopyColor, canopyRadius }) {
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.95 });
    const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(0, trunkHeight / 2, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    const leavesMat = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.85 });
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(canopyRadius, 10, 8), leavesMat);
    c1.position.set(0, trunkHeight + canopyRadius * 0.6, 0);
    c1.scale.set(1.2, 0.9, 1.2);
    c1.castShadow = true;
    tree.add(c1);

    const c2 = new THREE.Mesh(new THREE.SphereGeometry(canopyRadius * 0.7, 10, 8), leavesMat);
    c2.position.set(0.2, trunkHeight + canopyRadius * 1.2, 0.1);
    c2.castShadow = true;
    tree.add(c2);

    return tree;
}

// ---------------------------------------------------------------------
// Helper: stone lantern (plaza + road junctions)
// ---------------------------------------------------------------------
function buildLantern(matStoneDark, matStone) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.18, 8), matStoneDark);
    base.position.set(0, 0.09, 0);
    base.castShadow = true;
    group.add(base);

    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.45), matStone);
    mid.position.set(0, 0.5, 0);
    mid.castShadow = true;
    group.add(mid);

    const top = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.32, 6), matStoneDark);
    top.position.set(0, 1.0, 0);
    top.castShadow = true;
    group.add(top);

    return group;
}

// ---------------------------------------------------------------------
// Helper: build shop front (counter + awning + produce)
// ---------------------------------------------------------------------
function buildShopFront(house, spec, matWood, matWoodDark, matStoneDark) {
    // The house sits at spec.position with rotation spec.rotation.y.
    // We attach shop accessories as children of the house so they
    // inherit the same transform.
    const group = new THREE.Group();
    group.name = 'shop-front';

    // Shop accessories are placed in front of the door (the door is on +Z in local space).
    // Front counter — wooden bench in front of the door
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.4), matWood);
    counter.position.set(0, -0.25, 2.2);
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);

    // Counter legs
    [-0.6, 0.6].forEach((side) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.4), matWoodDark);
        leg.position.set(side, -0.4, 2.2);
        leg.castShadow = true;
        group.add(leg);
    });

    // Awning — flat wooden plank supported by two posts
    const awningMat = new THREE.MeshStandardMaterial({
        color: 0x884422,
        roughness: 0.7,
        metalness: 0.05,
    });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.9), awningMat);
    awning.position.set(0, 1.0, 2.2);
    awning.castShadow = true;
    group.add(awning);

    // Awning supports
    [-0.95, 0.95].forEach((side) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), matWoodDark);
        post.position.set(side, 0.5, 2.2);
        post.castShadow = true;
        group.add(post);
    });

    // Hanging sign — short wooden plank with a red square painted on it
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.05), new THREE.MeshStandardMaterial({
        color: 0xaa2222,
        emissive: 0x661111,
        emissiveIntensity: 0.2,
        roughness: 0.6,
    }));
    sign.position.set(0, 1.3, 2.3);
    sign.castShadow = true;
    group.add(sign);

    // Produce crates — small wooden boxes with colored spheres for fruit
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const produceSpots = [
        { x: -0.6, z: 1.5, color: 0xff5533 }, // tomato
        { x: -0.6, z: 1.7, color: 0xffaa33 }, // orange
        { x:  0.6, z: 1.5, color: 0x33aa33 }, // lime
        { x:  0.6, z: 1.7, color: 0xcc2244 }, // apple
    ];
    produceSpots.forEach((p, i) => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.35), crateMat);
        crate.position.set(p.x, -0.45, p.z);
        crate.castShadow = true;
        group.add(crate);

        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({
            color: p.color,
            roughness: 0.6,
        }));
        fruit.position.set(p.x, -0.25, p.z);
        fruit.castShadow = true;
        group.add(fruit);
    });

    house.add(group);
}