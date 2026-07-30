/**
 * createHouseLayoutTool.js — interactive lil-gui panel for repositioning houses.
 *
 * Exposes a folder in lil-gui with sliders (x, z, rotation) for every house
 * and shop in the village. Editing a slider moves the corresponding
 * THREE.Object3D in real time so the user can iterate visually.
 *
 * Features:
 *   • Per-house labels show quadrant (NE/NW/SE/SW) + shop type + current coords
 *   • 🎯 Select & Frame button highlights a house with a yellow beam and frames the camera
 *   • Click a house in the 3D scene to highlight it (raycaster)
 *   • Constraint guard prevents overlap with road, river, and other houses
 *
 * Usage:
 *   import { attachHouseLayoutTool } from './createHouseLayoutTool.js';
 *   attachHouseLayoutTool(gui, world, village);
 */

import * as THREE from 'three';

const ROAD_BUFFER = 4;
const RIVER_BUFFER = 4;
const HOUSE_MIN_DIST = 8;

/**
 * Clamp a proposed position to satisfy all three constraints against the
 * rest of the village layout.
 */
function clampPosition(proposed, others) {
    let { x, z } = proposed;

    // 1. Road cross buffer: keep |x| ≥ 4 OR |z| ≥ 4
    if (Math.abs(x) < ROAD_BUFFER && Math.abs(z) < ROAD_BUFFER) {
        if (Math.abs(x) < Math.abs(z)) {
            x = x >= 0 ? ROAD_BUFFER : -ROAD_BUFFER;
        } else {
            z = z >= 0 ? ROAD_BUFFER : -ROAD_BUFFER;
        }
    }

    // 2. River buffer: river box x∈[-17,17], z∈[12.1,13.9]; buffer 4 → z≤7 or z≥18.2
    if (Math.abs(x) <= 17) {
        if (z > 7 && z < 18.2) {
            z = z >= 13 ? 18.2 : 7;
        }
    }

    // 3. House-to-house minimum distance
    let nearest = null;
    let nearestDist = Infinity;
    others.forEach((o) => {
        const d = Math.hypot(o.x - x, o.z - z);
        if (d < nearestDist) { nearestDist = d; nearest = o; }
    });
    if (nearest && nearestDist < HOUSE_MIN_DIST) {
        const dx = x - nearest.x;
        const dz = z - nearest.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
            x = nearest.x + (dx / d) * HOUSE_MIN_DIST;
            z = nearest.z + (dz / d) * HOUSE_MIN_DIST;
        } else {
            x = nearest.x + HOUSE_MIN_DIST;
            z = nearest.z;
        }
    }

    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
}

/**
 * Describe a house based on its grid position and shop flag.
 * Format: "🏪 Bakery #2 (NW) @ (-8, -18)"
 */
function describeHouse(entry, i) {
    const { x, z } = entry;
    const isShop = entry.name.startsWith('shop-');
    const shopType = isShop ? '🏪 Shop' : '🏠 House';

    let area;
    if (z < -10) area = 'North-Back';
    else if (z < 0 && x > 0) area = 'NE';
    else if (z < 0) area = 'NW';
    else if (z > 10) area = 'South-Back';
    else if (z > 0 && x > 0) area = 'SE';
    else if (z > 0) area = 'SW';
    else if (x > 0) area = 'East-Branch';
    else area = 'West-Branch';

    return `${shopType} #${i} (${area}) @ (${x.toFixed(1)}, ${z.toFixed(1)})`;
}

/**
 * Build a yellow beam + ground ring marker for highlighting a selected house.
 */
function buildSelectionMarker() {
    const group = new THREE.Group();
    group.name = '__selectionMarker';

    // Vertical beam — emissive yellow, semi-transparent
    const beamMat = new THREE.MeshStandardMaterial({
        color: 0xffeb3b,
        emissive: 0xffeb3b,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.55,
        roughness: 0.2,
    });
    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 12, 8),
        beamMat
    );
    beam.position.set(0, 6, 0);
    group.add(beam);

    // Ground ring — flat disc
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0xffeb3b,
        emissive: 0xffeb3b,
        emissiveIntensity: 1.0,
        roughness: 0.3,
    });
    const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 0.1, 24),
        ringMat
    );
    ring.position.set(0, 0.02, 0);
    group.add(ring);

    return group;
}

/**
 * Attach the house layout tool to a lil-gui instance.
 * @param {GUI} gui
 * @param {object} world - ThreeWorld instance
 * @param {THREE.Group} village - the village root group
 */
export function attachHouseLayoutTool(gui, world, village) {
    // Only top-level direct children — skip sub-groups like 'shop-front'
    const houses = village.children.filter((obj) => {
        if (!obj.name) return false;
        if (!obj.name.startsWith('house-') && !obj.name.startsWith('shop-')) return false;
        if (obj.name === 'shop-front') return false;
        return true;
    });
    if (houses.length === 0) {
        console.warn('[HouseLayoutTool] no house-N/shop-N children found in village');
        return;
    }

    const folder = gui.addFolder('🏘️ House Layout');
    folder.close();

    // Per-house position records (mirror current THREE positions)
    const layoutState = houses.map((h) => ({
        mesh: h,
        name: h.name,
        x: h.position.x,
        z: h.position.z,
        rot: h.rotation.y,
        _label: null, // updated below
        _folder: null,
    }));

    // Selection marker — single shared instance, repositioned on select
    let selectionMarker = null;

    function clearSelection() {
        if (selectionMarker && selectionMarker.parent) {
            selectionMarker.parent.remove(selectionMarker);
        }
        selectionMarker = null;
    }

    function selectHouse(entry, index) {
        clearSelection();
        selectionMarker = buildSelectionMarker();
        selectionMarker.position.set(entry.mesh.position.x, 0, entry.mesh.position.z);
        village.add(selectionMarker);

        // Frame the camera around the selected house
        if (world?.camera && world?.controls) {
            const tx = entry.mesh.position.x;
            const tz = entry.mesh.position.z;
            world.camera.position.set(tx + 6, 5, tz + 8);
            world.camera.lookAt(tx, 0.5, tz);
            world.controls.target.set(tx, 0.5, tz);
            world.controls.update();
            // Tell the player controller to pause its target-tracking
            // for a few seconds so the camera stays on this house.
            world.controls.userFramedHouse = true;
            setTimeout(() => {
                if (world.controls) world.controls.userFramedHouse = false;
            }, 4000);
        }
    }

    // Build per-house folders
    layoutState.forEach((entry, i) => {
        const label = describeHouse(entry, i);
        const houseFolder = folder.addFolder(label);

        entry._label = label;
        entry._folder = houseFolder;

        // 🎯 Select & Frame button — highlights and frames the house
        const selectActions = {
            select: () => selectHouse(entry, i),
        };
        houseFolder.add(selectActions, 'select').name('🎯 Select & Frame');

        // X slider
        houseFolder.add(entry, 'x', -22, 22, 0.1).name('x').onChange((v) => {
            const others = layoutState.filter((e, j) => j !== i).map((e) => ({ x: e.x, z: e.z }));
            const { x, z } = clampPosition({ x: v, z: entry.z }, others);
            entry.x = x;
            entry.z = z;
            entry.mesh.position.set(x, entry.mesh.position.y, z);
            // Move selection marker if currently selecting this house
            if (selectionMarker) {
                selectionMarker.position.set(x, 0, z);
            }
        });

        // Z slider
        houseFolder.add(entry, 'z', -22, 24, 0.1).name('z').onChange((v) => {
            const others = layoutState.filter((e, j) => j !== i).map((e) => ({ x: e.x, z: e.z }));
            const { x, z } = clampPosition({ x: entry.x, z: v }, others);
            entry.x = x;
            entry.z = z;
            entry.mesh.position.set(x, entry.mesh.position.y, z);
            if (selectionMarker) {
                selectionMarker.position.set(x, 0, z);
            }
        });

        // Rotation slider
        houseFolder.add(entry, 'rot', -Math.PI, Math.PI, 0.05).name('rotation').onChange((v) => {
            entry.rot = v;
            entry.mesh.rotation.y = v;
        });

        houseFolder.close();
    });

    // Click-to-select: raycast on house meshes
    function setupClickToSelect() {
        if (!world?.renderer || !world?.camera) return;
        const canvas = world.renderer.domElement;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        canvas.addEventListener('pointerdown', (ev) => {
            // Skip if pointer-events disabled or middle/right click
            if (ev.button !== 0) return;

            const rect = canvas.getBoundingClientRect();
            mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, world.camera);

            const meshes = layoutState.map((e) => e.mesh);
            const hits = raycaster.intersectObjects(meshes, true);
            if (hits.length === 0) return;

            // Walk up to find the top-level house Group
            let target = hits[0].object;
            while (target.parent && !layoutState.some((e) => e.mesh === target)) {
                target = target.parent;
            }
            const idx = layoutState.findIndex((e) => e.mesh === target);
            if (idx >= 0) {
                selectHouse(layoutState[idx], idx);
                const houseFolder = layoutState[idx]._folder;
                if (houseFolder) {
                    houseFolder.open();
                    const domNode = houseFolder.domElement;
                    if (domNode?.scrollIntoView) {
                        domNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            }
        });
    }

    setupClickToSelect();

    // Utility actions
    const actions = {
        selectAll: () => {
            // Sequentially focus each house briefly (visual sweep)
            let i = 0;
            const step = () => {
                if (i >= layoutState.length) return;
                selectHouse(layoutState[i], i);
                i++;
                setTimeout(step, 400);
            };
            step();
        },
        clearSelection: () => clearSelection(),
        cameraFit() {
            if (!world?.camera || !world?.controls) return;
            const xs = layoutState.map((e) => e.x);
            const zs = layoutState.map((e) => e.z);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
            const span = Math.max(
                Math.max(...xs) - Math.min(...xs),
                Math.max(...zs) - Math.min(...zs)
            );
            const dist = span * 1.2;
            world.camera.position.set(cx + dist * 0.6, dist * 0.5, cz + dist * 0.6);
            world.camera.lookAt(cx, 0, cz);
            world.controls.target.set(cx, 0, cz);
            world.controls.update();
            // Pause player follow while showing the whole village
            world.controls.userFramedHouse = true;
            setTimeout(() => {
                if (world.controls) world.controls.userFramedHouse = false;
            }, 4000);
        },
        logLayout() {
            const out = layoutState.map((e) => ({
                name: e.name,
                label: e._label,
                x: e.x,
                z: e.z,
                rot: +e.rot.toFixed(3),
            }));
            console.log('[HouseLayoutTool] current layout:', out);
            console.table(out);
        },
        resetToGrid() {
            // Re-sync from current mesh positions (so users can undo via slider)
            layoutState.forEach((entry) => {
                entry.x = entry.mesh.position.x;
                entry.z = entry.mesh.position.z;
                entry.rot = entry.mesh.rotation.y;
            });
            console.log('[HouseLayoutTool] reset state from mesh positions');
        },
    };

    folder.add(actions, 'selectAll').name('🔦 Sweep & Highlight All');
    folder.add(actions, 'clearSelection').name('🚫 Clear Marker');
    folder.add(actions, 'cameraFit').name('📷 Fit Camera');
    folder.add(actions, 'logLayout').name('📋 Log Layout (console)');

    console.info(`[HouseLayoutTool] attached — ${houses.length} houses`);
    console.info('[HouseLayoutTool] Tip: click any house in 3D to select & frame it');

    return { layoutState, actions };
}
