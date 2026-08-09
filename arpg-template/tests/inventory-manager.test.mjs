import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { InventoryManager } from '../src/systems/InventoryManager.js';

const sourceItems = JSON.parse(
    await readFile(new URL('../src/data/items.json', import.meta.url), 'utf8'),
);

function createScene(items = structuredClone(sourceItems)) {
    return {
        cache: {
            json: {
                get(key) {
                    return key === 'items' ? items : undefined;
                },
            },
        },
    };
}

test('addItem stacks up to maxStack and allocates overflow slots atomically', () => {
    const inventory = new InventoryManager(createScene(), 2);

    assert.equal(inventory.addItem('health_potion', 15), true);
    assert.deepEqual(inventory.slots, [
        { itemId: 'health_potion', quantity: 10 },
        { itemId: 'health_potion', quantity: 5 },
    ]);

    assert.equal(inventory.addItem('health_potion', 6), false);
    assert.deepEqual(inventory.slots, [
        { itemId: 'health_potion', quantity: 10 },
        { itemId: 'health_potion', quantity: 5 },
    ]);
});

test('addItem gives each non-stackable item its own slot', () => {
    const inventory = new InventoryManager(createScene(), 3);

    assert.equal(inventory.addItem('iron_sword', 2), true);
    assert.deepEqual(inventory.slots, [
        { itemId: 'iron_sword', quantity: 1 },
        { itemId: 'iron_sword', quantity: 1 },
        null,
    ]);
});

test('item IDs and quantities are validated explicitly', () => {
    const inventory = new InventoryManager(createScene(), 2);

    assert.throws(() => inventory.addItem('missing_item'), /Unknown item ID: missing_item/);
    assert.throws(() => inventory.addItem('health_potion', 0), /quantity must be a positive integer/);
    assert.throws(() => inventory.addItem('health_potion', 1.5), /quantity must be a positive integer/);
});

test('removeItem decrements a stack and clears the slot at zero', () => {
    const inventory = new InventoryManager(createScene(), 2);
    inventory.addItem('health_potion', 3);

    assert.equal(inventory.removeItem(0, 2), true);
    assert.deepEqual(inventory.getItem(0), { itemId: 'health_potion', quantity: 1 });
    assert.equal(inventory.countItem('health_potion'), 1);

    assert.equal(inventory.removeItem(0), true);
    assert.equal(inventory.getItem(0), null);
    assert.equal(inventory.countItem('health_potion'), 0);
});

test('removeItem validates slot indexes, occupancy, and available quantity', () => {
    const inventory = new InventoryManager(createScene(), 1);
    inventory.addItem('health_potion', 1);

    assert.throws(() => inventory.removeItem(-1), /slotIndex must be an integer between 0 and 0/);
    assert.throws(() => inventory.removeItem(0, 2), /Cannot remove 2; slot 0 contains 1/);
    inventory.removeItem(0);
    assert.throws(() => inventory.removeItem(0), /Inventory slot 0 is empty/);
});

test('equip moves items into schema-defined slots and swaps existing equipment', () => {
    const items = structuredClone(sourceItems);
    items.bronze_sword = {
        ...items.iron_sword,
        id: 'bronze_sword',
        name: 'Bronze Sword',
        stats: { attack: 4 },
    };
    const inventory = new InventoryManager(createScene(items), 3);
    inventory.addItem('iron_sword');
    inventory.addItem('bronze_sword');

    assert.equal(inventory.equip(0), true);
    assert.equal(inventory.equipment.weapon, 'iron_sword');
    assert.equal(inventory.getItem(0), null);

    assert.equal(inventory.equip(1), true);
    assert.equal(inventory.equipment.weapon, 'bronze_sword');
    assert.deepEqual(inventory.getItem(1), { itemId: 'iron_sword', quantity: 1 });
});

test('equip rejects empty slots and non-equippable items', () => {
    const inventory = new InventoryManager(createScene(), 2);
    inventory.addItem('health_potion');

    assert.throws(() => inventory.equip(1), /Inventory slot 1 is empty/);
    assert.throws(() => inventory.equip(0), /Item health_potion cannot be equipped/);
});

test('unequip returns equipment to inventory and preserves it when inventory is full', () => {
    const inventory = new InventoryManager(createScene(), 1);
    inventory.addItem('iron_sword');
    inventory.equip(0);

    assert.equal(inventory.unequip('weapon'), true);
    assert.equal(inventory.equipment.weapon, null);
    assert.deepEqual(inventory.getItem(0), { itemId: 'iron_sword', quantity: 1 });

    inventory.equip(0);
    inventory.addItem('health_potion');
    assert.equal(inventory.unequip('weapon'), false);
    assert.equal(inventory.equipment.weapon, 'iron_sword');
});

test('getStats derives every numeric stat from equipped item schema data', () => {
    const inventory = new InventoryManager(createScene(), 3);
    inventory.addItem('iron_sword');
    inventory.addItem('dragon_armor');
    inventory.equip(0);
    inventory.equip(1);

    assert.deepEqual(inventory.getStats(), {
        attack: 10,
        defense: 30,
        hp: 0,
        fireResist: 50,
    });
});

test('constructor validates inventory size and requires the preloaded item catalog', () => {
    assert.throws(() => new InventoryManager(createScene(), 0), /maxSlots must be a positive integer/);
    assert.throws(
        () => new InventoryManager({ cache: { json: { get: () => undefined } } }),
        /Item catalog is not loaded in Phaser JSON cache under "items"/,
    );
});
