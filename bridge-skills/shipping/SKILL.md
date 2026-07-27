---
name: shipping
description: "Bridge skill: Deploy Phaser 4 games. Maps deployment patterns (build, CDN, hosting) to Vite build and deployment workflows. Use when building, deploying, or hosting a Phaser game."
---

# Shipping Bridge

> How to build and deploy Phaser 4 games.

**Design Source:** MengTo `ship-web-games`
**Framework:** Phaser 4 + Vite

---

## 1. Project Setup

```bash
npm create vite@latest my-game -- --template vanilla
cd my-game
npm install phaser
npm run dev
```

## 2. Build for Production

```bash
npm run build
# Output: dist/ folder
```

## 3. Vite Config

```js
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',  // Relative paths for CDN
    build: {
        outDir: 'dist',
        assetsInlineLimit: 0,
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        }
    }
});
```

## 4. Deploy Options

### GitHub Pages
```bash
# Add to package.json
"scripts": {
    "deploy": "npm run build && gh-pages -d dist"
}
npm run deploy
```

### Netlify / Vercel
- Connect GitHub repo
- Build command: `npm run build`
- Output directory: `dist`

### Itch.io
1. Build locally: `npm run build`
2. Zip the `dist/` folder
3. Upload to itch.io

## 5. HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>My Game</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; touch-action: none; }
        canvas { display: block; margin: 0 auto; }
    </style>
</head>
<body>
    <script type="module" src="/src/main.js"></script>
</body>
</html>
```

## 6. Performance Checklist

- [ ] Minify JS (`npm run build` does this)
- [ ] Compress images (use TinyPNG)
- [ ] Use texture atlas (reduce draw calls)
- [ ] Audio in OGG + MP3 (browser compat)
- [ ] Test on mobile devices
- [ ] Set `<meta viewport>` tag
- [ ] Set `touch-action: none` on body
- [ ] Remove console.log in production

## 7. File Size Budget

| Asset | Target | Max |
|-------|--------|-----|
| JS bundle | < 500KB | 1MB |
| Images | < 2MB | 5MB |
| Audio | < 1MB | 3MB |
| Total | < 5MB | 10MB |

---

## Pitfalls

1. **Always set `base: './'`** — prevents broken paths on CDN
2. **Test on real mobile** — emulator != real device
3. **OGG + MP3 audio** — some browsers only support one
4. **Compress everything** — images, audio, JSON
5. **Don't commit node_modules** — use .gitignore
6. **`touch-action: none`** — prevents scroll on mobile
7. **`user-scalable=no`** — prevents pinch zoom during gameplay
