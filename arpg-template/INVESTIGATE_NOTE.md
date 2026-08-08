# Investigation Note: `@arpg-template`

## Metadata

- Investigated: 2026-08-08 14:10 +07:00
- Repository: `project-phaser-game-dev-bridge`
- Target: `arpg-template/`
- Branch: `develop`
- HEAD: `dae0f35f7f77982e02679709d1100c2573d641c5`
- HEAD subject: `feat(player): bigger long sword — readable as a sword from cam distance`
- Review mode: read-only codebase investigation
- Verdict: **Request changes**

## Scope

ตรวจ architecture, scene boot, Phaser 4 และ Three.js integration, combat flow, model loading, resource lifecycle, data wiring, syntax, build และ runtime behavior ของ `arpg-template`.

ไม่มี staged หรือ unstaged diff ภายใน `arpg-template` ตอนตรวจ ดังนั้นการตรวจนี้อ้างอิงโค้ดปัจจุบันที่ HEAD และ diff ของ commit ล่าสุด ไม่ใช่การตรวจ patch ที่กำลังค้างอยู่โดยเฉพาะ

Root repository มีการเปลี่ยนแปลงนอก target อยู่ก่อนแล้ว:

- `AGENTS.md` modified
- `mini_games/` untracked

ไฟล์ทั้งสองไม่ได้ถูกแก้ไขใน investigation นี้

## Architecture ที่พบ

```text
Boot
  -> Preload
      -> launch ThreeOverlayScene
      -> start CombatTest

ThreeOverlayScene
  -> ThreeWorld
  -> Asian village
  -> ambient NPCs
  -> Three.js player controller

CombatTestScene
  -> CombatSystem
  -> EnemyAI
  -> Phaser procedural sprites

GameScene + UIScene
  -> alternate legacy/demo path
  -> ไม่ใช่ default scene path ในปัจจุบัน
```

จุดสำคัญคือมี combat implementation สองเส้นทาง และมี model loading สองเส้นทาง:

1. Default path ใช้ inline `createAsianVillage()` โดยไม่มี `modelUrl`
2. `GameScene` path ใช้ dynamic model URL `/models/createDemoPropModel.js`

สองเส้นทางนี้ให้ผลต่างกัน และเส้นทาง dynamic model ยังใช้งานจริงไม่ได้

## Executive findings

### INV-001 - P1: Sword blade และ tip ใช้แกนไม่ตรงกัน

**Evidence**

- `src/threejs/models/createCharacter.js:239-266`
- Comment ระบุว่า sword forward คือ local `+Z`
- Blade ใช้ `BoxGeometry(0.06, 0.75, 0.10)` ซึ่งมีความยาวตามแกน `Y`
- Blade ไม่มี rotation เพื่อย้ายแกนยาวจาก `Y` ไป `Z`
- Tip ใช้ `rotation.x = -Math.PI / 2` และอยู่ที่ `z = 0.88`

**Runtime evidence**

ตรวจ geometry ของ object จริงได้:

```text
blade local bounds: x=0.06, y=0.75, z=0.10
tip rotation.x: -1.5707963267948966
tip position.z: 0.88
```

ดังนั้น blade จึงเป็นแท่งแนวตั้งใน local space ขณะที่ layout และ comment พยายามวางดาบตามแกน `Z` ทำให้ tip ไม่ต่อแนวเดียวกับ blade และภาพที่ render อ่านเป็นดาบได้ไม่สมบูรณ์

**Impact**

Latest sword commit เพิ่มขนาดดาบสำเร็จ แต่ยังไม่แก้ orientation ที่เป็น root cause ของภาพ blade/tip แยกทิศทางกัน

**Recommended action**

กำหนดแกนดาบให้ชัดเจนเพียงแกนเดียว แล้วให้ hilt, guard, blade และ tip ใช้ convention เดียวกัน ตรวจซ้ำด้วย runtime screenshot และ geometry assertion

---

### INV-002 - P1: Combat attack ไม่ resolve damage และทำให้ player ค้างใน attacking state

**Evidence**

- `src/scenes/CombatTestScene.js:146-160`
- `src/systems/CombatSystem.js:83-95`
- `CombatSystem.resolveHit()` มีอยู่ที่ `CombatSystem.js:195-243` แต่ไม่มี caller ใน active `CombatTestScene` attack path

`performAttack()` เรียกเพียง `startPlayerAttack()` ซึ่งทำแค่:

- ตั้ง `player.isAttacking = true`
- ปิด guard/dodge
- เปลี่ยน tint

ไม่มีการ:

- ตั้ง startup/active/recovery timer
- เรียก `resolveHit()`
- ลด HP ของ enemy
- เรียก `endPlayerAttack()`

`handleCollision()` ก็เรียก `startPlayerAttack()` ซ้ำ ไม่ได้ resolve hit เช่นกัน

**Runtime evidence**

หลังเรียก `performAttack()` และรอ 800ms:

```text
enemyHp: 50 -> 50
playerAttacking: false -> true
```

**Impact**

Core combat loop เล่นต่อไม่ได้จริง ผู้เล่นจะ attack ซ้ำไม่ได้ และ enemy ไม่มีทางตายจาก attack path นี้

**Recommended action**

ผูก active-window callback เข้ากับ `CombatSystem.resolveHit()` และกำหนด state transition ที่ชัดเจน:

```text
startup -> active hitbox -> damage/knockback/hitstop -> recovery -> idle
```

เพิ่ม smoke test ที่ยืนยัน enemy HP ลดลงและ player กลับออกจาก attacking state

---

### INV-003 - P1: Dynamic model loader ใช้กับไฟล์ใน `public/` ไม่ได้

**Evidence**

- `src/scenes/GameScene.js:42-44` ส่ง `modelUrl: '/models/createDemoPropModel.js'`
- `src/threejs/ModelLoader.js:46` ใช้ `import(/* @vite-ignore */ url)`
- `public/models/createDemoPropModel.js:13` มี `import * as THREE from 'three'`

ไฟล์ใน `public/` ถูกเสิร์ฟแบบ raw และไม่ผ่าน Vite module transform ดังนั้น browser ที่โหลดไฟล์โดยตรงจะ resolve bare specifier `three` ไม่ได้

**Runtime evidence**

```text
TypeError: Failed to resolve module specifier "three".
Relative references must start with either "/", "./", or "../".
```

เมื่อเปิด `GameScene` ยังพบ Vite 500 และ:

```text
[ThreeOverlayScene] boot model failed (continuing):
Failed to fetch dynamically imported module: /models/createDemoPropModel.js
```

**Impact**

ModelLoader ดูเหมือน build ได้ แต่ integration path ที่ประกาศไว้สำหรับ `public/models/*.js` ใช้งานจริงไม่ได้

**Recommended action**

เลือก strategy เดียว:

- ย้าย factory modules เข้า `src/` ให้ Vite bundle และ resolve dependency ให้ หรือ
- ทำ public factory ให้ browser-loadable จริง โดยไม่ใช้ bare package import

จากนั้นทดสอบ production preview ไม่ใช่เฉพาะ Vite dev server

---

### INV-004 - P1: ThreeWorld ไม่สามารถ boot ใหม่หลัง scene shutdown

**Evidence**

- `src/threejs/ThreeWorld.js:110-112` ปฏิเสธการ boot เมื่อ `this._disposed` เป็นจริง
- `src/threejs/ThreeWorld.js:268-296` dispose renderer, clear scene และตั้ง `_disposed = true`
- `src/scenes/ThreeOverlayScene.js:190-194` เรียก `threeWorld.dispose()` ตอน shutdown

Comment ของ `ThreeOverlayScene` ระบุว่ารองรับการ launch/stop ตาม scene lifecycle แต่ implementation ปัจจุบัน dispose แบบถาวร

**Runtime evidence**

หลัง stop แล้ว launch `ThreeOverlayScene` ใหม่:

```text
[ThreeWorld] disposed
[ThreeWorld] boot() called twice — ignoring
stats.running: false
stats.disposed: true
```

**Impact**

การเปลี่ยน level, menu flow หรือ scene restart จะทำให้ 3D layer ไม่ render ต่อ

**Recommended action**

แยก lifecycle ให้ชัดเจน:

- `dispose()` สำหรับ teardown ถาวร
- `reset()` หรือสร้าง world ใหม่สำหรับ scene restart
- reset `_disposed` และ rebuild scene resources หากต้องการรองรับ relaunch

---

### INV-005 - P1/P2: GameScene เปิด UIScene ด้วย key ผิด

**Evidence**

- `src/scenes/UIScene.js:5` ใช้ key `UI`
- `src/scenes/GameScene.js:36` เรียก `this.scene.launch('UIScene')`

**Runtime evidence**

เมื่อ launch `GameScene` ได้ log:

```text
Scene key not found: UIScene
```

**Impact**

UI path ใช้งานไม่ได้ และเพิ่มความสับสนเพราะ default path ใช้ `CombatTestScene` ที่สร้าง HUD ของตัวเอง

**Recommended action**

เลือก scene path หลักเพียงหนึ่ง path และใช้ scene key ให้ตรงกันทุกจุด

---

### INV-006 - P2: Debug overlay อ้าง `threeWorld` นอก scope

**Evidence**

- `src/main.js:40-42` destructure `threeWorld` อยู่ภายใน Promise callback
- `src/main.js:50-54` ใช้ identifier `threeWorld` ใน callback ของ `setInterval()` ที่อยู่นอก scope ดังกล่าว

**Runtime evidence**

เมื่อเปิด `?debug=1` พบ `ReferenceError: threeWorld is not defined` ซ้ำทุก interval และ overlay แสดงค่าไม่ถูกต้อง:

```text
Three objects: 0
Phaser scene: --
```

**Recommended action**

ใช้ `window.__three?.world` ใน interval หรือเก็บ reference ใน scope เดียวกันก่อนเริ่ม timer

---

### INV-007 - P2: Shutdown cleanup ไม่ครบและเสี่ยง listener leak

**Evidence**

- `ThreeOverlayScene.js:190-194` unsubscribe เฉพาะ ThreeBridge แล้ว dispose world
- ไม่เรียก `_playerCtrl.dispose()`
- ไม่เรียก `_npcs.dispose()`
- `createPlayerController.js:467-478` มีการ remove `window` และ canvas listeners แต่ไม่ถูกเรียกจาก scene
- `createNPCs.js:119-127` มี dispose แต่ไม่ถูกเรียกจาก scene

**Impact**

การ restart scene อาจทิ้ง keyboard/pointer listeners, controller closures และ object references จากรอบก่อน

**Recommended action**

เรียก child-system cleanup ก่อน `threeWorld.dispose()` และเพิ่ม cleanup ให้ house layout raycaster/tool ด้วย

---

### INV-008 - P1 completeness: Data และ inventory ยังไม่ถูกเชื่อมกับเกมจริง

**Evidence**

- `src/scenes/PreloadScene.js:8-16` JSON loading ถูก comment ไว้
- `src/scenes/CombatTestScene.js:63-68` ใช้ enemy data hardcoded
- `src/systems/InventoryManager.js:12-27` เป็น TODO และ method หลักยังไม่คืนผลลัพธ์
- `src/data/enemies.json` และ `src/data/items.json` จึงยังไม่ใช่ source of truth ใน runtime

`task.md:17-20` ระบุว่า data system และ enemy data loading เสร็จแล้ว แต่ code/runtime ปัจจุบันยังไม่สอดคล้อง

**Impact**

Template ยังไม่เป็น data-driven ARPG ตาม `AGENTS.md` และ roadmap

**Recommended action**

โหลด JSON ใน preload/import ให้เป็นเส้นทางเดียว แล้วเขียน tests สำหรับ enemy schema, item stacking, equipment และ derived stats

## Additional risks

- `ModelLoader.js:34-36` เมื่อ cache hit จะคืน clone แต่ไม่ auto-add clone เข้า world แม้ `addToWorld` default จะเป็น `true`
- `clearCache()` มีอยู่ที่ `ModelLoader.js:89-92` แต่ไม่ได้ถูกเรียกตอน scene shutdown
- `CombatTestScene.js:91` แสดง `D: Dodge` แต่ไม่มี dodge action ใน input flow
- `main.js:21` ตั้ง Phaser gravity เป็นศูนย์ ขณะที่ `GameScene.js:57-59` รอ `blocked.down` เพื่อ jump
- Production build สร้าง main chunk ประมาณ 2.29 MB minified และ Vite เตือนเรื่อง chunk ใหญ่กว่า 500 kB

## Verification record

| Check | Result | Evidence |
|---|---|---|
| JavaScript syntax | PASS | `node --check` ครบ 21/21 files |
| Production build | PASS | `npm run build` ผ่านด้วย Vite 6.4.3 |
| Dependency install state | PASS | `npm ls --depth=0` พบ phaser, three, lil-gui, vite ครบ |
| Security scan on latest added lines | PASS | ไม่พบ secret, shell injection, eval/exec, pickle หรือ SQL injection |
| Runtime boot | PARTIAL | Phaser/Three canvases boot, village/NPC/player แสดงผล |
| Runtime debug mode | FAIL | `ReferenceError: threeWorld is not defined` |
| Runtime dynamic model import | FAIL | Browser resolve `three` จาก public module ไม่ได้ |
| Runtime combat attack | FAIL | Enemy HP ไม่ลดและ player attack state ค้าง |
| Runtime scene relaunch | FAIL | ThreeWorld disposed แล้ว boot ใหม่ไม่ได้ |
| Runtime GameScene UI path | FAIL | `Scene key not found: UIScene` |
| Automated test script | UNAVAILABLE | `package.json` ไม่มี `test` script |
| ESLint / TypeScript | UNAVAILABLE | ไม่ได้ติดตั้งใน project |
| Independent reviewer | BLOCKED | delegation provider `opencode zen` ไม่ถูก configure; retry แล้วล้มเหลว |

## Recommended execution order

1. แก้ sword axis/orientation และเพิ่ม visual/geometry assertion
2. ทำ combat state machine และ damage resolution ให้จบหนึ่งเส้นทางก่อน
3. แก้ model loading ให้ production-compatible
4. แก้ ThreeWorld reset/dispose และ cleanup ของ child systems
5. รวม `GameScene` กับ `CombatTestScene` หรือประกาศ path ใด path หนึ่งเป็น canonical
6. เชื่อม enemy/item JSON และ implement inventory behavior
7. เพิ่ม automated smoke tests สำหรับ boot, attack, model load และ scene restart

## Files changed by this investigation

- เพิ่มไฟล์นี้เท่านั้น: `arpg-template/INVESTIGATE_NOTE.md`
- ไม่มี source code, config, dependency หรือ git history ถูกแก้ไข
