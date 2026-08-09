const ENEMY_POSITIVE_NUMBER_FIELDS = Object.freeze([
    'hp',
    'speed',
    'sightRange',
    'attackRange',
    'attackDamage',
    'attackCooldown',
    'attackDuration',
    'leashRange',
    'displayWidth',
    'displayHeight',
]);

const ENEMY_POSITION_FIELDS = Object.freeze(['spawnX', 'spawnY']);
const ENEMY_COLOR_FIELDS = Object.freeze([
    'idleColor',
    'patrolColor',
    'chaseColor',
    'attackColor',
    'cooldownColor',
    'retreatColor',
]);

export const EQUIPMENT_SLOTS = Object.freeze(['weapon', 'armor', 'accessory']);
const ITEM_TYPES = Object.freeze(['weapon', 'armor', 'consumable', 'accessory']);
const ITEM_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertCatalog(catalog, name) {
    if (!isRecord(catalog) || Object.keys(catalog).length === 0) {
        throw new TypeError(`${name} must be a non-empty object`);
    }
}

function assertNonEmptyString(value, path) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${path} must be a non-empty string`);
    }
}

function assertPositiveNumber(value, path) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${path} must be a positive number`);
    }
}

export function validateEnemyCatalog(catalog) {
    assertCatalog(catalog, 'enemies');

    for (const [enemyId, enemy] of Object.entries(catalog)) {
        const path = `enemies.${enemyId}`;
        if (!isRecord(enemy)) {
            throw new TypeError(`${path} must be an object`);
        }

        for (const field of ENEMY_POSITIVE_NUMBER_FIELDS) {
            assertPositiveNumber(enemy[field], `${path}.${field}`);
        }
        for (const field of ENEMY_POSITION_FIELDS) {
            if (typeof enemy[field] !== 'number' || !Number.isFinite(enemy[field])) {
                throw new TypeError(`${path}.${field} must be a finite number`);
            }
        }

        if (!isRecord(enemy.colors)) {
            throw new TypeError(`${path}.colors must be an object`);
        }
        for (const field of ENEMY_COLOR_FIELDS) {
            if (typeof enemy.colors[field] !== 'string'
                || !/^0x[0-9a-f]{6}$/i.test(enemy.colors[field])) {
                throw new TypeError(`${path}.colors.${field} must be a 6-digit 0x hex color`);
            }
        }

        assertNonEmptyString(enemy.label, `${path}.label`);

        if (enemy.phaseThresholds !== undefined) {
            const validThresholds = Array.isArray(enemy.phaseThresholds)
                && enemy.phaseThresholds.length > 0
                && enemy.phaseThresholds.every((threshold, index, thresholds) => (
                    typeof threshold === 'number'
                    && Number.isFinite(threshold)
                    && threshold > 0
                    && threshold < 1
                    && (index === 0 || threshold < thresholds[index - 1])
                ));
            if (!validThresholds) {
                throw new TypeError(
                    `${path}.phaseThresholds must be strictly descending numbers between 0 and 1`,
                );
            }
        }
    }

    return catalog;
}

export function validateItemCatalog(catalog) {
    assertCatalog(catalog, 'items');

    for (const [itemId, item] of Object.entries(catalog)) {
        const path = `items.${itemId}`;
        if (!isRecord(item)) {
            throw new TypeError(`${path} must be an object`);
        }
        if (item.id !== itemId) {
            throw new TypeError(`${path}.id must equal catalog key "${itemId}"`);
        }

        assertNonEmptyString(item.name, `${path}.name`);
        assertNonEmptyString(item.description, `${path}.description`);

        if (!ITEM_TYPES.includes(item.type)) {
            throw new TypeError(`${path}.type must be one of ${ITEM_TYPES.join(', ')}`);
        }
        if (!ITEM_RARITIES.includes(item.rarity)) {
            throw new TypeError(`${path}.rarity must be one of ${ITEM_RARITIES.join(', ')}`);
        }
        if (typeof item.stackable !== 'boolean') {
            throw new TypeError(`${path}.stackable must be a boolean`);
        }
        if (!Number.isInteger(item.maxStack) || item.maxStack <= 0) {
            throw new TypeError(`${path}.maxStack must be a positive integer`);
        }
        if (item.stackable && item.maxStack < 2) {
            throw new TypeError(`${path}.maxStack must be at least 2 when stackable`);
        }
        if (!item.stackable && item.maxStack !== 1) {
            throw new TypeError(`${path}.maxStack must be 1 when not stackable`);
        }
        if (item.equipmentSlot !== null && !EQUIPMENT_SLOTS.includes(item.equipmentSlot)) {
            throw new TypeError(
                `${path}.equipmentSlot must be one of ${EQUIPMENT_SLOTS.join(', ')}, or null`,
            );
        }
        if (item.equipmentSlot !== null && item.stackable) {
            throw new TypeError(`${path} cannot be both equippable and stackable`);
        }

        if (!isRecord(item.stats) || Object.keys(item.stats).length === 0) {
            throw new TypeError(`${path}.stats must be a non-empty object`);
        }
        for (const [stat, value] of Object.entries(item.stats)) {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new TypeError(`${path}.stats.${stat} must be a finite number`);
            }
        }
    }

    return catalog;
}
