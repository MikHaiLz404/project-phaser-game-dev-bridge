---
name: inventory-system
description: "Bridge skill: Implement game inventory in Phaser 4. Maps MengTo inventory patterns (item schemas, equipment, stacking, persistence) to Phaser DataManager, Events, and JSON data. Use when building inventory UI, equipment systems, item pickups, or save/load."
---

# Inventory System Bridge

> How to implement MengTo inventory design patterns using Phaser 4 API.

**Design Source:** MengTo `build-game-inventory`
**Framework:** Phaser 4

---

## Design Patterns (from MengTo)

### Item Schema
Every item has:
- `id` — unique identifier
- `name` — display name
- `type` — weapon/armor/consumable/material
- `rarity` — common/uncommon/rare/epic/legendary
- `stackable` — can stack multiple?
- `maxStack` — max quantity per slot
- `equipmentSlot` — where it can be equipped
- `stats` — stat modifiers

### Inventory Rules
- Fixed slot count (e.g., 20 slots)
- Stacking respects `maxStack`
- Equipment slots are exclusive (one weapon at a time)
- Drag-and-drop for rearranging

---

## Phaser 4 Implementation

### 1. Data Schema

```json
{
    "iron_sword": {
        "id": "iron_sword",
        "name": "Iron Sword",
        "type": "weapon",
        "rarity": "common",
        "stackable": false,
        "maxStack": 1,
        "equipmentSlot": "weapon",
        "stats": { "attack": 10 },
        "icon": "item_iron_sword",
        "description": "A sturdy iron sword."
    },
    "health_potion": {
        "id": "health_potion",
        "name": "Health Potion",
        "type": "consumable",
        "rarity": "common",
        "stackable": true,
        "maxStack": 10,
        "equipmentSlot": null,
        "stats": { "heal": 50 },
        "icon": "item_health_potion",
        "description": "Restores 50 HP."
    },
    "dragon_armor": {
        "id": "dragon_armor",
        "name": "Dragon Armor",
        "type": "armor",
        "rarity": "legendary",
        "stackable": false,
        "maxStack": 1,
        "equipmentSlot": "armor",
        "stats": { "defense": 30, "fireResist": 50 },
        "icon": "item_dragon_armor",
        "description": "Forged from dragon scales."
    }
}
```

### 2. Inventory Manager

```js
class InventoryManager {
    constructor(scene, maxSlots = 20) {
        this.scene = scene;
        this.maxSlots = maxSlots;
        this.slots = new Array(maxSlots).fill(null);

        // Equipment slots
        this.equipment = {
            weapon: null,
            armor: null,
            accessory: null
        };

        // Load item database
        this.itemDB = scene.cache.json.get('items');
    }

    addItem(itemId, quantity = 1) {
        const itemData = this.itemDB[itemId];
        if (!itemData) return false;

        // Try to stack with existing
        if (itemData.stackable) {
            for (let i = 0; i < this.slots.length; i++) {
                if (this.slots[i] && this.slots[i].id === itemId) {
                    const canAdd = Math.min(quantity, itemData.maxStack - this.slots[i].quantity);
                    if (canAdd > 0) {
                        this.slots[i].quantity += canAdd;
                        quantity -= canAdd;
                        this.scene.events.emit('inventory-changed');
                        if (quantity <= 0) return true;
                    }
                }
            }
        }

        // Find empty slot
        while (quantity > 0) {
            const emptySlot = this.slots.indexOf(null);
            if (emptySlot === -1) return false; // Inventory full

            const stackSize = Math.min(quantity, itemData.maxStack);
            this.slots[emptySlot] = {
                id: itemId,
                quantity: stackSize
            };
            quantity -= stackSize;
        }

        this.scene.events.emit('inventory-changed');
        return true;
    }

    removeItem(slotIndex, quantity = 1) {
        if (!this.slots[slotIndex]) return false;

        this.slots[slotIndex].quantity -= quantity;
        if (this.slots[slotIndex].quantity <= 0) {
            this.slots[slotIndex] = null;
        }

        this.scene.events.emit('inventory-changed');
        return true;
    }

    equip(slotIndex) {
        const item = this.slots[slotIndex];
        if (!item) return false;

        const itemData = this.itemDB[item.id];
        if (!itemData.equipmentSlot) return false;

        const slot = itemData.equipmentSlot;

        // Unequip current
        if (this.equipment[slot]) {
            this.addItem(this.equipment[slot].id);
        }

        // Equip new
        this.equipment[slot] = item;
        this.removeItem(slotIndex);

        this.scene.events.emit('equipment-changed', slot);
        return true;
    }

    unequip(slot) {
        if (!this.equipment[slot]) return false;

        const item = this.equipment[slot];
        this.equipment[slot] = null;

        this.addItem(item.id);
        this.scene.events.emit('equipment-changed', slot);
        return true;
    }

    // Calculate total stats from equipment
    getStats() {
        const stats = { attack: 0, defense: 0, hp: 0 };

        for (const slot in this.equipment) {
            if (this.equipment[slot]) {
                const itemData = this.itemDB[this.equipment[slot].id];
                for (const stat in itemData.stats) {
                    stats[stat] = (stats[stat] || 0) + itemData.stats[stat];
                }
            }
        }

        return stats;
    }
}
```

### 3. Save/Load

```js
save() {
    const data = {
        slots: this.slots,
        equipment: this.equipment
    };
    localStorage.setItem('inventory', JSON.stringify(data));
}

load() {
    const data = JSON.parse(localStorage.getItem('inventory'));
    if (data) {
        this.slots = data.slots;
        this.equipment = data.equipment;
        this.scene.events.emit('inventory-changed');
    }
}
```

---

## Pitfalls

1. **Always emit events** after changes — UI depends on `inventory-changed`
2. **Check stack limits** before adding — never exceed `maxStack`
3. **Equipment slots must be exclusive** — unequip old before equipping new
4. **Save frequently** — inventory data is player progress
5. **Don't mutate itemDB** — always work with copies

---

## Related Skills

- MengTo: `build-game-inventory`, `build-hybrid-game-assets`
- Phaser: `data-manager`, `events-system`, `scenes`
