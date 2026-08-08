# ARPG Technical Specification & Agent Instructions

This project is an ARPG Proof of Concept (POC) built using **Phaser 4** and a custom "Bridge" architecture. It implements a unique **Two-Canvas Sandwich**: a 2D interaction layer (Phaser) stacked with a 3D background/object layer (Three.js).

## Dev Environment
- **Runtime:** Node.js (via Vite)
- **Package Manager:** npm / yarn
- **Core Dependencies:** `phaser` (^4.2.1), `three` (^0.169.0)
- **Verification:** Ensure all dependencies are installed via `npm install`.

## Build & Test
- **Development:** `npm run dev` (starts Vite server)
- **Build:** `npm run build` (produces production bundle)
- **Preview:** `npm run preview` (locally serve the built project)

## Project Structure & Conventions
- **Scenes (`src/scenes/`):** Entry points for game states. Each scene must be registered in `main.js`.
- **Systems (`src/systems/`):** Logic-heavy modules (Combat, AI, Inventory). Do not house complex logic inside Scenes; call Systems instead.
- **Data (`src/data/`):** JSON files drive entity stats and items. Assets must be pulled from data rather than hardcoded in classes.
- **Hybrid Architecture:** `GameScene` manages the 2D game loop, while `ThreeOverlayScene` handles the Three.js rendering layer simultaneously.

## Engineering Guidelines
- **Module Pattern:** Use clean Exports/Imports. Avoid global variables except for the `game` instance and debug-only globals (`window.__three`).
- **State Management:** Use flags (e.g., `isAttacking`, `isGuarding`) to gate state transitions in Entity classes.
- **Phaser Specifics:** The Phaser canvas is appended inside `#game-container`. Always allow the physics engine to handle velocity-based movement.

## Pitfalls
- **Sync/Async Conflicts:** Three.js model loading is async. Ensure `ThreeWorld` state is initialized before first render.
- **Active Scene Chain:** `ThreeOverlayScene` must be registered *before* standard game scenes to ensure it doesn't cause conflicts during active scene switching.
- **Debug Overlay:** Only the `#debug-overlay` and `.dbg-*` IDs are used for debug info; do not modify these IDs as they are hardcoded in `main.js`.
- **3D Context:** Use standard Three.js materials/cameras where possible; avoid using custom shaders unless absolutely required via the Bridge API.
