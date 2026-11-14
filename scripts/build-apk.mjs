import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Bina kedua-dua APK daripada bundle `dist` terkini, kemudian salin ke
// `release/` supaya setiap commit sentiasa disertakan APK yang sepadan.
//
// Jalankan selepas `npm run sync:android` (skrip `apk:build` sudah buat).
// Anda boleh tetapkan ANDROID_HOME / JAVA_HOME sendiri jika lokasi berbeza.

const ANDROID_HOME = process.env.ANDROID_HOME ?? '/opt/android-sdk'
const JAVA_HOME = process.env.JAVA_HOME ?? '/usr/lib/jvm/java-21-openjdk-arm64'

if (!existsSync(ANDROID_HOME)) {
  console.error(`ANDROID_HOME tidak dijumpai: ${ANDROID_HOME}`)
  process.exit(1)
}

// Pada mesin arm64, aapt2 dari Maven tidak berjalan; guna aapt2 SDK.
function aapt2Override() {
  const buildTools = join(ANDROID_HOME, 'build-tools')
  if (!existsSync(buildTools)) return null
  const versions = readdirSync(buildTools).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const latest = versions[versions.length - 1]
  const binary = join(buildTools, latest, 'aapt2')
  return existsSync(binary) ? binary : null
}

const override = aapt2Override()
const args = ['assembleCustomerDebug', 'assembleSellerDebug', '--no-daemon']
if (override) args.push(`-Pandroid.aapt2FromMavenOverride=${override}`)

const result = spawnSync('./gradlew', args, {
  cwd: join(process.cwd(), 'android'),
  stdio: 'inherit',
  env: {
    ...process.env,
    ANDROID_HOME,
    ANDROID_SDK_ROOT: ANDROID_HOME,
    JAVA_HOME,
  },
})

if (result.status !== 0) {
  console.error('Binaan APK gagal.')
  process.exit(result.status ?? 1)
}

const copies = [
  [
    'android/app/build/outputs/apk/customer/debug/app-customer-debug.apk',
    'release/Pizzadonia-Pelanggan.apk',
  ],
  [
    'android/app/build/outputs/apk/seller/debug/app-seller-debug.apk',
    'release/Pizzadonia-Penjual.apk',
  ],
]

for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.error(`APK tidak dijumpai: ${from}`)
    process.exit(1)
  }
  copyFileSync(from, to)
  console.log(`disalin ${from} -> ${to}`)
}
