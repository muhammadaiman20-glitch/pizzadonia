import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
await copyFile(new URL('../cloudflare/worker.js', import.meta.url), new URL('../dist/_worker.js', import.meta.url))
// In-app update: the APKs built in ./android go out with the site, with their versions in /apk/version.json.
const versions = {}
await mkdir(new URL('../dist/apk/', import.meta.url), { recursive: true })
for (const [role, file] of [['customer', 'Pizzadonia.apk'], ['seller', 'Pizzadonia-Seller.apk']]) {
  const from = new URL(`../android/app/build/outputs/apk/${role}/debug/`, import.meta.url)
  if (!existsSync(new URL('app-' + role + '-debug.apk', from))) continue
  await copyFile(new URL('app-' + role + '-debug.apk', from), new URL('../dist/apk/' + file, import.meta.url))
  const e = JSON.parse(await readFile(new URL('output-metadata.json', from), 'utf8')).elements[0]
  const notes = existsSync(new URL('../android/release-notes.txt', import.meta.url)) ? (await readFile(new URL('../android/release-notes.txt', import.meta.url), 'utf8')).split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []
  versions[role] = { versionCode: e.versionCode, versionName: e.versionName, path: 'apk/' + file, sizeMB: Math.round(statSync(new URL('app-' + role + '-debug.apk', from)).size / 104857.6) / 10, notes }
}
await writeFile(new URL('../dist/apk/version.json', import.meta.url), JSON.stringify(versions))
