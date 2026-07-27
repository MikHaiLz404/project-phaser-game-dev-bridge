---
name: testing
description: "Bridge skill: Test Phaser 4 games. Maps testing patterns (regression, deterministic, smoke) to Vitest and Phaser test utilities. Use when building test suites, verifying game logic, or debugging."
---

# Testing Bridge

> How to test Phaser 4 games using Vitest.

**Design Source:** MengTo `test-playable-web-games`
**Framework:** Phaser 4 + Vitest

---

## 1. Setup

```bash
npm install -D vitest
```

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true
    }
});
```

## 2. Unit Test Game Logic

```js
// tests/inventory.test.js
import { describe, it, expect } from 'vitest';

function createInventory(maxSlots = 20) {
    return { slots: new Array(maxSlots).fill(null), maxSlots };
}

function addItem(inventory, item, qty = 1) {
    const empty = inventory.slots.indexOf(null);
    if (empty === -1) return false;
    inventory.slots[empty] = { ...item, quantity: qty };
    return true;
}

describe('Inventory', () => {
    it('adds item to empty slot', () => {
        const inv = createInventory();
        expect(addItem(inv, { id: 'sword' })).toBe(true);
        expect(inv.slots[0].id).toBe('sword');
    });

    it('rejects when full', () => {
        const inv = createInventory(1);
        addItem(inv, { id: 'sword' });
        expect(addItem(inv, { id: 'shield' })).toBe(false);
    });
});
```

## 3. Test Enemy AI State Machine

```js
function createEnemy(config) {
    return { state: 'IDLE', hp: config.hp, speed: config.speed };
}

function updateEnemy(enemy, distToPlayer) {
    if (enemy.state === 'IDLE' && distToPlayer < 200) {
        enemy.state = 'CHASE';
    }
    return enemy.state;
}

describe('Enemy AI', () => {
    it('transitions to CHASE when player in range', () => {
        const enemy = createEnemy({ hp: 100, speed: 80 });
        expect(updateEnemy(enemy, 100)).toBe('CHASE');
    });

    it('stays IDLE when player far', () => {
        const enemy = createEnemy({ hp: 100, speed: 80 });
        expect(updateEnemy(enemy, 300)).toBe('IDLE');
    });
});
```

## 4. Test Combat Math

```js
function calculateDamage(base, combo, isCritical) {
    let dmg = base * (1 + combo * 0.2);
    if (isCritical) dmg *= 2;
    return Math.round(dmg);
}

describe('Combat', () => {
    it('applies combo multiplier', () => {
        expect(calculateDamage(25, 3, false)).toBe(40);
    });

    it('applies critical hit', () => {
        expect(calculateDamage(25, 0, true)).toBe(50);
    });
});
```

## 5. Smoke Test (Manual)

```bash
# Start dev server
npm run dev

# Open in browser
open http://localhost:5173

# Checklist:
# - Game loads without errors
# - Player moves with arrow keys
# - Space key triggers attack
# - Enemies take damage
# - HP bar updates
# - No console errors
```

---

## Pitfalls

1. **Test logic, not rendering** — unit test game systems, not sprites
2. **Deterministic tests** — no Math.random() in tests
3. **Mock time-dependent code** — use fake timers
4. **Test edge cases** — zero HP, full inventory, max level
5. **Run tests before commit** — catch regressions early
