# npm-packaging — include web/dist + prepublishOnly hook

## Why

The npm-published tarball was shipping source-only without `web/dist`, so `npm install -g siloFoX/c4` left the operator with a daemon that served `404` on `/`. `prepublishOnly` builds the web bundle on every publish so the tarball always matches source.

## What changed

`package.json`:

```diff
+ "files": [
+   "src/",
+   "scripts/",
+   "web/dist/",
+   "config.example.json",
+   "README.md",
+   "CHANGELOG.md",
+   "LICENSE"
+ ],
+ "scripts": {
+   "prepublishOnly": "npm run build:web && node tests/run-all.js"
+ }
```

Plus `npm pack --dry-run` ships `web/dist/index.html` + `web/dist/assets/*`.

## Daemon static-serve

The daemon already serves `web/dist` as SPA from `/` (47a1b2a from 1.6.17-cumulative). With this patch, an operator running `npx -p c4 c4 daemon start` immediately gets the working web UI on `http://localhost:3456`.
