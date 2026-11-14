import { copyFileSync, mkdirSync } from 'node:fs'

// APK disimpan di `release/` supaya tidak disalin ke dalam bundle web
// (dan seterusnya ke dalam APK) semasa `npm run build` + `cap sync`.
const files = ['Pizzadonia-Pelanggan.apk', 'Pizzadonia-Penjual.apk']

mkdirSync('dist/download', { recursive: true })
for (const file of files) {
  copyFileSync(`release/${file}`, `dist/download/${file}`)
  console.log(`dist/download/${file}`)
}
