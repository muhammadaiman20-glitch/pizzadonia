import { copyFile } from 'node:fs/promises'
await copyFile(new URL('../cloudflare/worker.js', import.meta.url), new URL('../dist/_worker.js', import.meta.url))
