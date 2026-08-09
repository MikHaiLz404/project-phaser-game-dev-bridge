import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    validateEnemyCatalog,
    validateItemCatalog,
} from '../src/data/validateGameData.js';

const dataUrl = (name) => new URL(`../src/data/${name}.json`, import.meta.url);
const loadJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));

test('enemy catalog matches the runtime enemy schema', async () => {
    const enemies = await loadJson('enemies');
    assert.equal(validateEnemyCatalog(enemies), enemies);
});

test('enemy schema rejects missing combat stats and invalid colors', async () => {
    const enemies = await loadJson('enemies');
    delete enemies.slime.attackDamage;
    enemies.skeleton.colors.idleColor = 'red';

    assert.throws(
        () => validateEnemyCatalog(enemies),
        /enemies\.slime\.attackDamage must be a positive number/,
    );
});

test('enemy schema rejects invalid optional phase thresholds', async () => {
    const enemies = await loadJson('enemies');
    enemies.boss_dragon.phaseThresholds = [0.3, 0.7];

    assert.throws(
        () => validateEnemyCatalog(enemies),
        /phaseThresholds must be strictly descending numbers between 0 and 1/,
    );
});

test('item catalog matches the runtime item schema', async () => {
    const items = await loadJson('items');
    assert.equal(validateItemCatalog(items), items);
});

test('item schema rejects IDs that disagree with their catalog key', async () => {
    const items = await loadJson('items');
    items.iron_sword.id = 'other_sword';

    assert.throws(
        () => validateItemCatalog(items),
        /items\.iron_sword\.id must equal catalog key "iron_sword"/,
    );
});

test('item schema enforces stack limits and equipment slots', async () => {
    const items = await loadJson('items');
    items.health_potion.maxStack = 0;

    assert.throws(
        () => validateItemCatalog(items),
        /items\.health_potion\.maxStack must be a positive integer/,
    );

    items.health_potion.maxStack = 10;
    items.dragon_armor.equipmentSlot = 'helmet';
    assert.throws(
        () => validateItemCatalog(items),
        /items\.dragon_armor\.equipmentSlot must be one of weapon, armor, accessory, or null/,
    );
});

test('item schema rejects non-finite derived stat values', async () => {
    const items = await loadJson('items');
    items.dragon_armor.stats.defense = '30';

    assert.throws(
        () => validateItemCatalog(items),
        /items\.dragon_armor\.stats\.defense must be a finite number/,
    );
});
