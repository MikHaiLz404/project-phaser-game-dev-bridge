---
name: save-load
description: "Bridge skill: Implement save/load in Phaser 4. Maps persistence patterns (localStorage, save slots, migration) to Phaser registry and JSON serialization. Use when building save systems, settings persistence, or player progress."
---

# Save/Load Bridge

> How to implement persistence using Phaser 4 Registry API.

**Design Source:** MengTo `build-game-inventory`, `build-isometric-arpg`
**Framework:** Phaser 4

---

## 1. Basic localStorage

```js
// Save
save() {
    const data = {
        player: { x: this.player.x, y: this.player.y, hp: this.hp },
        inventory: this.inventory.slots,
        score: this.score,
        timestamp: Date.now()
    };
    localStorage.setItem('saveSlot1', JSON.stringify(data));
}

// Load
load() {
    const raw = localStorage.getItem('saveSlot1');
    if (!raw) return false;
    const data = JSON.parse(raw);
    this.player.setPosition(data.player.x, data.player.y);
    this.hp = data.player.hp;
    this.inventory.slots = data.inventory;
    this.score = data.score;
    return true;
}
```

## 2. Save Manager

```js
class SaveManager {
    constructor(gameKey = 'mygame') {
        this.gameKey = gameKey;
    }

    save(slot, data) {
        const key = this.gameKey + '_slot' + slot;
        const saveData = {
            version: 1,
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(saveData));
    }

    load(slot) {
        const key = this.gameKey + '_slot' + slot;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const save = JSON.parse(raw);
        return this.migrate(save);
    }

    delete(slot) {
        localStorage.removeItem(this.gameKey + '_slot' + slot);
    }

    hasSave(slot) {
        return localStorage.getItem(this.gameKey + '_slot' + slot) !== null;
    }

    // Version migration
    migrate(save) {
        if (save.version < 1) {
            // Old format → new format
            save.data = this.migrateV0(save.data);
            save.version = 1;
        }
        return save.data;
    }
}
```

## 3. Auto-Save

```js
create() {
    // Auto-save every 60 seconds
    this.time.addEvent({
        delay: 60000,
        callback: () => this.saveManager.save(0, this.getSaveData()),
        loop: true
    });

    // Auto-save on pause
    this.events.on('pause', () => {
        this.saveManager.save(0, this.getSaveData());
    });
}

getSaveData() {
    return {
        player: { x: this.player.x, y: this.player.y },
        score: this.score,
        level: this.currentLevel
    };
}
```

## 4. Settings Persistence

```js
class Settings {
    constructor() {
        this.defaults = {
            musicVolume: 0.5,
            sfxVolume: 0.7,
            fullscreen: false
        };
        this.data = this.load();
    }

    load() {
        const raw = localStorage.getItem('settings');
        return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
    }

    save() {
        localStorage.setItem('settings', JSON.stringify(this.data));
    }

    get(key) { return this.data[key]; }
    set(key, value) { this.data[key] = value; this.save(); }
}
```

---

## Pitfalls

1. **Always validate loaded data** — corrupted saves crash games
2. **Version your saves** — enables migration on format changes
3. **localStorage has 5MB limit** — compress large saves
4. **Save on pause/exit** — not just on timers
5. **Don't save references** — serialize plain objects only
