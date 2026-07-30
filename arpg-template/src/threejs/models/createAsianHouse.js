/**
 * createAsianHouse.js — low-poly game-style house matching reference style.
 *
 * A purely procedural Three.js Object3D factory that builds a stylised
 * house matching the game-reference aesthetic:
 *   • steep dark gable roof
 *   • horizontal wood-plank upper walls
 *   • light grey stone lower walls
 *   • raised wooden porch with railing
 *   • 4 corner lanterns with warm glow
 *   • warm emissive windows
 *   • front door with steps
 *
 * No external assets — every part is a primitive mesh.
 *
 * @param {object} spec          img2threejs-style ObjectSculptSpec (optional).
 * @param {{addToWorld?:boolean}} opts
 * @returns {THREE.Group}
 */

import * as THREE from 'three';

export default function createAsianHouse(spec = {}, opts = {}) {
    const group = new THREE.Group();
    group.name = 'asian-house';

    // -----------------------------------------------------------------
    // Materials
    // -----------------------------------------------------------------
    // Each house picks its own roof colour from the palette below so the
    // village reads as a colourful cluster of stylised rooftops instead
    // of monochrome black. The spec override takes precedence.
    const ROOF_PALETTE = [
        0x1a0e06, // near-black brown (default)
        0x4a2e1a, // dark chocolate
        0x7a3a1c, // terracotta / brick red
        0x3a4a5e, // slate blue-grey
        0x5e3a2a, // burnt sienna
        0x2e3a2a, // forest green-dark
    ];
    const roofColorHex = (typeof spec?.roofColor === 'number')
        ? spec.roofColor
        : ROOF_PALETTE[Math.floor(Math.random() * ROOF_PALETTE.length)];
    const matRoof = new THREE.MeshStandardMaterial({
        color: roofColorHex,
        roughness: 0.7,
        metalness: 0.1,
    });
    const matWood = new THREE.MeshStandardMaterial({
        color: 0x8a6a3a,        // medium brown
        roughness: 0.85,
        metalness: 0.05,
    });
    const matWoodDark = new THREE.MeshStandardMaterial({
        color: 0x3e2a18,
        roughness: 0.85,
        metalness: 0.05,
    });
    const matStoneLight = new THREE.MeshStandardMaterial({
        color: 0xc8bfb5,        // light grey concrete
        roughness: 0.95,
        metalness: 0.0,
    });
    const matStoneBase = new THREE.MeshStandardMaterial({
        color: 0x9a8e7e,        // darker stone for foundation
        roughness: 0.95,
        metalness: 0.0,
    });
    const matWindowGlow = new THREE.MeshStandardMaterial({
        color: 0xffd27a,
        emissive: 0xffb24a,
        emissiveIntensity: 1.0,
        roughness: 0.3,
    });
    const matWindowFrame = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.6,
        metalness: 0.2,
    });
    const matDoor = new THREE.MeshStandardMaterial({
        color: 0x1a1008,
        roughness: 0.85,
    });
    const matStep = new THREE.MeshStandardMaterial({
        color: 0xc8bfb5,        // same as stone walls
        roughness: 0.95,
    });
    const matLanternPost = new THREE.MeshStandardMaterial({
        color: 0x3e2a18,
        roughness: 0.85,
    });
    const matLanternLight = new THREE.MeshStandardMaterial({
        color: 0xffdd66,
        emissive: 0xffaa33,
        emissiveIntensity: 0.9,
        roughness: 0.3,
    });
    const matLanternBase = new THREE.MeshStandardMaterial({
        color: 0x1a1008,
        roughness: 0.7,
    });
    const matPorch = new THREE.MeshStandardMaterial({
        color: 0x7a5a2a,        // slightly warmer than wall wood
        roughness: 0.9,
        metalness: 0.0,
    });

    // -----------------------------------------------------------------
    // House dimensions
    // -----------------------------------------------------------------
    const W = 4.0;            // outer width  (x)
    const D = 3.0;            // outer depth  (z)
    const H_LOWER = 1.4;      // lower wall height
    const H_UPPER = 1.3;      // upper wall height
    const Y0 = -0.5;          // floor / bottom of lower wall
    const Y1 = Y0 + H_LOWER;  // top of lower wall / bottom of upper
    const Y2 = Y1 + H_UPPER;  // top of upper wall / bottom of roof

    // -----------------------------------------------------------------
    // Foundation — slightly wider than the house, light grey stone
    // -----------------------------------------------------------------
    const foundationGeo = new THREE.BoxGeometry(W + 0.3, 0.12, D + 0.3);
    const foundation = new THREE.Mesh(foundationGeo, matStoneBase);
    foundation.position.set(0, Y0 - 0.06, 0);
    foundation.name = 'foundation';
    foundation.receiveShadow = true;
    group.add(foundation);

    // -----------------------------------------------------------------
    // Lower floor — light grey stone walls
    // -----------------------------------------------------------------
    const lowerBodyGeo = new THREE.BoxGeometry(W, H_LOWER, D);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, matStoneLight);
    lowerBody.position.set(0, Y0 + H_LOWER / 2, 0);
    lowerBody.name = 'lower-body';
    group.add(lowerBody);

    // Stone trim between upper and lower
    const trimGeo = new THREE.BoxGeometry(W + 0.1, 0.1, D + 0.1);
    const trim = new THREE.Mesh(trimGeo, matStoneBase);
    trim.position.set(0, Y1 + 0.05, 0);
    trim.name = 'wall-trim';
    group.add(trim);

    // -----------------------------------------------------------------
    // Upper floor — brown horizontal wood planks
    // -----------------------------------------------------------------
    const upperBodyGeo = new THREE.BoxGeometry(W * 0.94, H_UPPER, D * 0.94);
    const upperBody = new THREE.Mesh(upperBodyGeo, matWood);
    upperBody.position.set(0, Y1 + H_UPPER / 2, 0);
    upperBody.name = 'upper-body';
    group.add(upperBody);

    // Horizontal plank lines — 4 dark thin strips across the upper walls
    for (let i = 0; i < 4; i++) {
        const stripGeo = new THREE.BoxGeometry(W * 0.96, 0.06, D * 0.96);
        const strip = new THREE.Mesh(stripGeo, matWoodDark);
        strip.position.set(0, Y1 + 0.2 + i * 0.32, 0);
        strip.name = `plank-line-${i}`;
        group.add(strip);
    }

    // -----------------------------------------------------------------
    // Roof — steep gable, dark near-black
    // -----------------------------------------------------------------
    const ROOF_OVERHANG = 0.4;
    const roofW = W * 0.94 + ROOF_OVERHANG * 2;
    const roofD = D * 0.94 + ROOF_OVERHANG * 2;
    const roofH = 2.2;           // steep! (was 1.1)

    // Triangular gable profile
    const roofProfile = new THREE.Shape();
    roofProfile.moveTo(-roofW / 2, 0);
    roofProfile.lineTo( roofW / 2, 0);
    roofProfile.lineTo( 0,         roofH);
    roofProfile.lineTo(-roofW / 2, 0);

    const roofGeo = new THREE.ExtrudeGeometry(roofProfile, {
        steps: 1,
        depth: roofD,
        bevelEnabled: false,
    });
    roofGeo.translate(0, 0, -roofD / 2);
    const roof = new THREE.Mesh(roofGeo, matRoof);
    roof.position.set(0, Y2, 0);
    roof.name = 'roof';
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    // Eave rim — thin dark band
    const eaveGeo = new THREE.BoxGeometry(roofW + 0.05, 0.08, roofD + 0.05);
    const eave = new THREE.Mesh(eaveGeo, matRoof);
    eave.position.set(0, Y2 - 0.04, 0);
    eave.name = 'eave-rim';
    group.add(eave);

    // Ridge cap — dark thin bar at peak
    const ridgeGeo = new THREE.BoxGeometry(0.12, 0.1, roofD * 0.88);
    const ridge = new THREE.Mesh(ridgeGeo, matRoof);
    ridge.position.set(0, Y2 + roofH - 0.05, 0);
    ridge.name = 'ridge-cap';
    group.add(ridge);

    // -----------------------------------------------------------------
    // Windows — warm yellow emissive squares with dark frames
    // Two on front face (+Z), two on back (-Z)
    // -----------------------------------------------------------------
    const winW = 0.5;
    const winH = 0.6;
    const winDepth = 0.04;
    const frameT = 0.06;

    function addWindow(x, y, zSide, rotY) {
        const winGroup = new THREE.Group();
        winGroup.name = 'window';

        // Dark frame (outer)
        const frameGeo = new THREE.BoxGeometry(winW + frameT * 2, winH + frameT * 2, winDepth);
        const frame = new THREE.Mesh(frameGeo, matWindowFrame);
        winGroup.add(frame);

        // Glowing glass
        const glassGeo = new THREE.BoxGeometry(winW, winH, winDepth * 0.6);
        const glass = new THREE.Mesh(glassGeo, matWindowGlow);
        glass.position.set(0, 0, 0.005);
        winGroup.add(glass);

        // Mullions (thin cross)
        const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, winDepth * 0.8), matWindowFrame);
        mullV.position.set(0, 0, 0.005);
        winGroup.add(mullV);
        const mullH = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.04, winDepth * 0.8), matWindowFrame);
        mullH.position.set(0, 0, 0.005);
        winGroup.add(mullH);

        winGroup.position.set(x, y, zSide);
        winGroup.rotation.y = rotY || 0;
        return winGroup;
    }

    const windowY = Y1 + H_UPPER * 0.55;
    const winZFront = D / 2 * 0.94 + 0.01;
    const winZBack = -D / 2 * 0.94 - 0.01;

    group.add(addWindow(-1.0, windowY, winZFront));         // front left
    group.add(addWindow( 1.0, windowY, winZFront));         // front right
    group.add(addWindow(-1.0, windowY, winZBack));          // back left
    group.add(addWindow( 1.0, windowY, winZBack));          // back right

    // -----------------------------------------------------------------
    // Door — dark rectangle with two light grey steps
    // -----------------------------------------------------------------
    const doorFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.15, 0.06),
        matDoor
    );
    doorFrame.position.set(0, Y0 + 0.6, D / 2 + 0.02);
    doorFrame.name = 'door-frame';
    group.add(doorFrame);

    const doorPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.0, 0.04),
        matDoor
    );
    doorPanel.position.set(0, Y0 + 0.55, D / 2 + 0.06);
    doorPanel.name = 'door-panel';
    group.add(doorPanel);

    // Two light grey steps
    for (let i = 0; i < 2; i++) {
        const step = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 0.1, 0.35),
            matStep
        );
        step.position.set(0, Y0 - 0.05 - i * 0.1, D / 2 + 0.25 + i * 0.35);
        step.name = `step-${i}`;
        group.add(step);
    }

    // -----------------------------------------------------------------
    // Porch — raised wooden deck at the front of the house
    // -----------------------------------------------------------------
    const porchW = W + 0.8;     // wider than house by 0.4 each side
    const porchD = 1.0;         // depth from front wall outward
    const porchY = Y0 - 0.02;   // slightly below lower floor bottom
    const porchThick = 0.1;

    // Porch floor
    const porchFloor = new THREE.Mesh(
        new THREE.BoxGeometry(porchW, porchThick, porchD),
        matPorch
    );
    porchFloor.position.set(0, porchY - porchThick / 2, D / 2 + porchD / 2);
    porchFloor.name = 'porch-floor';
    porchFloor.receiveShadow = true;
    group.add(porchFloor);

    // Porch railing — front rail
    const railThick = 0.05;
    const railH = 0.4;
    const frontRail = new THREE.Mesh(
        new THREE.BoxGeometry(porchW - 0.2, railThick, railThick),
        matWoodDark
    );
    frontRail.position.set(0, porchY + railH, D / 2 + porchD);
    frontRail.name = 'rail-front';
    group.add(frontRail);

    // Side rails (left and right)
    [-1, 1].forEach((side) => {
        const sr = new THREE.Mesh(
            new THREE.BoxGeometry(railThick, railThick, porchD),
            matWoodDark
        );
        sr.position.set(side * (porchW / 2 - 0.1), porchY + railH, D / 2 + porchD / 2);
        sr.name = `rail-side-${side > 0 ? 'r' : 'l'}`;
        group.add(sr);

        // Rail posts
        const postGeo = new THREE.CylinderGeometry(0.04, 0.04, railH, 6);
        // front corner posts
        const fp = new THREE.Mesh(postGeo, matWoodDark);
        fp.position.set(side * (porchW / 2 - 0.1), porchY + railH / 2, D / 2 + porchD);
        fp.name = `post-front-${side > 0 ? 'r' : 'l'}`;
        group.add(fp);
        // back corner posts (near house wall)
        const bp = new THREE.Mesh(postGeo, matWoodDark);
        bp.position.set(side * (porchW / 2 - 0.1), porchY + railH / 2, D / 2 + 0.05);
        bp.name = `post-back-${side > 0 ? 'r' : 'l'}`;
        group.add(bp);
    });

    // Two small vertical balusters in the middle
    [-0.4, 0.4].forEach((offset) => {
        const baluster = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, railH, 6),
            matWoodDark
        );
        baluster.position.set(offset, porchY + railH / 2, D / 2 + porchD);
        baluster.name = 'baluster';
        group.add(baluster);
    });

    // -----------------------------------------------------------------
    // Corner lanterns — 4 total, one at each corner of the porch
    // Each: square black base + brown post + glowing warm top
    // -----------------------------------------------------------------
    function addLantern(lx, lz) {
        const g = new THREE.Group();
        g.name = 'lantern';

        const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.06, 0.12),
            matLanternBase
        );
        base.position.set(0, porchY + 0.03, 0);
        g.add(base);

        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6),
            matLanternPost
        );
        post.position.set(0, porchY + 0.22, 0);
        g.add(post);

        const glow = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.12, 0.14),
            matLanternLight
        );
        glow.position.set(0, porchY + 0.4, 0);
        g.add(glow);

        // Tiny roof cap
        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.03, 0.16),
            matLanternBase
        );
        cap.position.set(0, porchY + 0.48, 0);
        g.add(cap);

        g.position.set(lx, 0, lz);
        return g;
    }

    const lOffX = porchW / 2 - 0.1;
    const lOffZ_front = D / 2 + porchD;
    const lOffZ_back = D / 2;

    group.add(addLantern(-lOffX, lOffZ_front));   // front-left
    group.add(addLantern( lOffX, lOffZ_front));   // front-right
    group.add(addLantern(-lOffX, lOffZ_back));    // back-left (near wall)
    group.add(addLantern( lOffX, lOffZ_back));    // back-right (near wall)

    // -----------------------------------------------------------------
    // Apply spec-driven transform
    // -----------------------------------------------------------------
    if (spec.position) {
        group.position.set(
            spec.position.x ?? 0,
            spec.position.y ?? 0,
            spec.position.z ?? 0
        );
    }
    if (spec.rotation) {
        group.rotation.set(
            spec.rotation.x ?? 0,
            spec.rotation.y ?? 0,
            spec.rotation.z ?? 0
        );
    }
    if (spec.scale) {
        group.scale.set(
            spec.scale.x ?? 1,
            spec.scale.y ?? 1,
            spec.scale.z ?? 1
        );
    }

    if (opts.addToWorld && typeof window !== 'undefined' && window.__three?.world) {
        window.__three.world.add(group);
    }

    return group;
}
