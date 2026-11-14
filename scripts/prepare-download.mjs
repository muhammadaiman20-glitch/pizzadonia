import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// APK disimpan di `release/` supaya tidak disalin ke dalam bundle web
// (dan seterusnya ke dalam APK) semasa `npm run build` + `cap sync`.
const files = ['Pizzadonia-Pelanggan.apk', 'Pizzadonia-Penjual.apk']

mkdirSync('dist/download', { recursive: true })
for (const file of files) {
  copyFileSync(`release/${file}`, `dist/download/${file}`)
  console.log(`dist/download/${file}`)
}

// Manifest kemas kini yang dibaca oleh app Android. Versi diambil daripada
// package.json — pastikan APK dibina dengan versi yang sama.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const manifest = {
  customer: {
    versionName: version,
    url: `/download/Pizzadonia-Pelanggan.apk?v=${encodeURIComponent(version)}`,
    notes: 'Kemas kini aplikasi pelanggan Pizzadonia.',
  },
  seller: {
    versionName: version,
    url: `/download/Pizzadonia-Penjual.apk?v=${encodeURIComponent(version)}`,
    notes: 'Kemas kini aplikasi penjual Pizzadonia.',
  },
}
writeFileSync('dist/app-version.json', `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`dist/app-version.json (versi ${version})`)
