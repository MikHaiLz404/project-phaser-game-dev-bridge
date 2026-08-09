// Inventory System - data-driven by the item catalog preloaded into Phaser's JSON cache.

import { EQUIPMENT_SLOTS, validateItemCatalog } from '../data/validateGameData.js';

const BASE_STATS = Object.freeze({ attack: 0, defense: 0, hp: 0 });

function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

export class InventoryManager {
    constructor(scene, maxSlots = 20) {
        if (!Number.isInteger(maxSlots) || maxSlots <= 0) {
            throw new RangeError('maxSlots must be a positive integer');
        }

        const itemCatalog = scene?.cache?.json?.get('items');
        if (itemCatalog === undefined) {
            throw new Error('Item catalog is not loaded in Phaser JSON cache under "items"');
        }

        this.scene = scene;
        this.maxSlots = maxSlots;
        const validatedCatalog = validateItemCatalog(itemCatalog);
        this.itemCatalog = deepFreeze(structuredClone(validatedCatalog));
        this.slots = new Array(maxSlots).fill(null);
        this.equipment = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
    }

    addItem(itemId, quantity = 1) {
        const item = this.getItemDef(itemId);
        this.#assertQuantity(quantity);

        const stackCapacity = item.stackable
            ? this.slots.reduce((capacity, slot) => (
                slot?.itemId === itemId ? capacity + item.maxStack - slot.quantity : capacity
            ), 0)
            : 0;
        const emptySlots = this.slots.reduce(
            (count, slot) => count + (slot === null ? 1 : 0),
            0,
        );
        const emptySlotCapacity = emptySlots * item.maxStack;

        if (stackCapacity + emptySlotCapacity < quantity) {
            return false;
        }

        let remaining = quantity;
        if (item.stackable) {
            for (const slot of this.slots) {
                if (slot?.itemId !== itemId || slot.quantity >= item.maxStack) continue;
                const added = Math.min(item.maxStack - slot.quantity, remaining);
                slot.quantity += added;
                remaining -= added;
                if (remaining === 0) return true;
            }
        }

        for (let index = 0; index < this.slots.length && remaining > 0; index += 1) {
            if (this.slots[index] !== null) continue;
            const added = Math.min(item.maxStack, remaining);
            this.slots[index] = { itemId, quantity: added };
            remaining -= added;
        }

        return true;
    }

    removeItem(slotIndex, quantity = 1) {
        this.#assertSlotIndex(slotIndex);
        this.#assertQuantity(quantity);
        const slot = this.slots[slotIndex];
        if (slot === null) {
            throw new Error(`Inventory slot ${slotIndex} is empty`);
        }
        if (quantity > slot.quantity) {
            throw new RangeError(
                `Cannot remove ${quantity}; slot ${slotIndex} contains ${slot.quantity}`,
            );
        }

        slot.quantity -= quantity;
        if (slot.quantity === 0) {
            this.slots[slotIndex] = null;
        }
        return true;
    }

    getItem(slotIndex) {
        this.#assertSlotIndex(slotIndex);
        const slot = this.slots[slotIndex];
        return slot === null ? null : { ...slot };
    }

    countItem(itemId) {
        this.getItemDef(itemId);
        const inventoryCount = this.slots.reduce(
            (count, slot) => count + (slot?.itemId === itemId ? slot.quantity : 0),
            0,
        );
        const equippedCount = Object.values(this.equipment).reduce(
            (count, equippedId) => count + (equippedId === itemId ? 1 : 0),
            0,
        );
        return inventoryCount + equippedCount;
    }

    equip(slotIndex) {
        this.#assertSlotIndex(slotIndex);
        const slot = this.slots[slotIndex];
        if (slot === null) {
            throw new Error(`Inventory slot ${slotIndex} is empty`);
        }

        const item = this.getItemDef(slot.itemId);
        if (item.equipmentSlot === null) {
            throw new Error(`Item ${item.id} cannot be equipped`);
        }
        if (slot.quantity !== 1) {
            throw new Error(`Equippable item ${item.id} must occupy exactly one item per slot`);
        }

        const previousItemId = this.equipment[item.equipmentSlot];
        this.equipment[item.equipmentSlot] = item.id;
        this.slots[slotIndex] = previousItemId === null
            ? null
            : { itemId: previousItemId, quantity: 1 };
        return true;
    }

    unequip(equipmentSlot) {
        this.#assertEquipmentSlot(equipmentSlot);
        const itemId = this.equipment[equipmentSlot];
        if (itemId === null) {
            throw new Error(`Equipment slot ${equipmentSlot} is empty`);
        }

        const emptyIndex = this.slots.indexOf(null);
        if (emptyIndex === -1) {
            return false;
        }

        this.slots[emptyIndex] = { itemId, quantity: 1 };
        this.equipment[equipmentSlot] = null;
        return true;
    }

    getStats() {
        const derived = { ...BASE_STATS };
        for (const itemId of Object.values(this.equipment)) {
            if (itemId === null) continue;
            const item = this.getItemDef(itemId);
            for (const [stat, value] of Object.entries(item.stats)) {
                derived[stat] = (derived[stat] ?? 0) + value;
            }
        }
        return derived;
    }

    getItemDef(itemId) {
        if (typeof itemId !== 'string' || !Object.hasOwn(this.itemCatalog, itemId)) {
            throw new RangeError(`Unknown item ID: ${String(itemId)}`);
        }
        return this.itemCatalog[itemId];
    }

    listItemIds() {
        return Object.keys(this.itemCatalog);
    }

    #assertQuantity(quantity) {
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new RangeError('quantity must be a positive integer');
        }
    }

    #assertSlotIndex(slotIndex) {
        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.maxSlots) {
            throw new RangeError(
                `slotIndex must be an integer between 0 and ${this.maxSlots - 1}`,
            );
        }
    }

    #assertEquipmentSlot(equipmentSlot) {
        if (!EQUIPMENT_SLOTS.includes(equipmentSlot)) {
            throw new RangeError(
                `equipmentSlot must be one of ${EQUIPMENT_SLOTS.join(', ')}`,
            );
        }
    }
}
