# 🤖 Agents & Project Scope

## Project Root
- **Path:** `/Users/jojo/Github/project-phaser-game-dev-bridge/arpg-template`
- **Goal:** Build a Proof of Concept (POC) for a high-quality ARPG using the Phaser 4 framework and a custom "Bridge Skill" architecture.

## Core Agents & Roles

### 1. Coding Agent (Primary Worker)
- **Role:** Implementation of game mechanics, scene logic, and physics integration.
- **Focus:** 
  - Writing/Refactoring `src/scenes/`
  - Integrating `src/systems/` (Combat, AI, Inventory)
  - Ensuring Data-driven flow from `src/data/`
- **Key Constraints:** 
  - Always use absolute paths for file operations.
  - Prioritize modularity (keep logic in systems, not scenes).

### 2. Marketing Agent (Orchestrator)
- **Role:** Content strategy, funnel planning, and asset positioning.
- **Focus:** 
  - Developing content for "Solo Dev Empowerment".
  - Creating Lead Magnets (Starter Kits).
  - Managing the roadmap in `task.md`.

### 3. Design Agent (Future)
- **Role:** UI/UX layout, branding, and visual assets.
- **Focus:**
  - Designing HUD elements.
  - Creating visual "Juice" specs.

## Project Structure & Key Paths
- **Scenes:** `src/scenes/` (Entry points for game states)
- **Systems:** `src/systems/` (The "Engine" - Combat, AI, Inventory)
- **Data:** `src/data/` (JSON files for enemies, items, configs)
- **Bridge Skills:** `../bridge-skills/` (Reference library for patterns)
- **Assets:** `assets/` (Placeholder or real textures)

## Operating Guidelines
- **Verify First:** Always check if a file exists before attempting to read/write.
- **Module Pattern:** Do not hardcode enemy stats in scenes; always pull from `data/`.
- **State Machine:** Use the `isAttacking`, `isGuarding`, `isDodging` flags to manage character state transitions.
