# Pizzadonia — Landing Page & Dashboard Tempahan

Landing page pizza berbahasa Melayu dengan tempahan melalui WhatsApp dan dashboard penjual untuk mengurus order masuk.

Dibina dengan **React 19 + TypeScript + Vite + Tailwind CSS v3**. Tempahan disimpan dalam **Cloudflare D1** melalui Worker (`/api`) apabila di-deploy; dalam mod dev atau tanpa API, app kembali kepada localStorage.

## Jalankan

Untuk pembangunan (hot reload):

```sh
npm install
npm run dev
```

Untuk testing yang laju (disyorkan — versi produksi):

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Mod dev memuatkan ~2,000 modul berasingan (lebih kurang 9MB) manakala versi produksi hanya ~150KB, jadi `preview` jauh lebih pantas terutama pada telefon.

```sh
npm run build     # bina ke dist/
npm run lint
```

## Deploy

### Cloudflare Workers + D1 (disyorkan)

Satu Worker menghidangkan laman statik (`dist/`) dan API `/api` pada origin yang sama, jadi tempahan boleh dilihat dari semua peranti.

Prasyarat: Node.js **22.12+** untuk Wrangler (fail `.nvmrc` disediakan) dan akaun Cloudflare yang sudah login (`npx wrangler login`, atau `wrangler login --device` dalam container/SSH).

```sh
npx wrangler secret put ADMIN_PIN    # PIN akaun penjual produksi, cth. 4821 (wajib)
npx wrangler secret put AUTH_SECRET  # pilihan: kunci tandatangan token sesi
npm run db:init                      # cipta table pizzadonia_orders (sekali sahaja)
npm run deploy                       # build + salin APK ke dist/download + wrangler deploy
```

Tiada PIN lalai: jika `ADMIN_PIN` tidak ditetapkan, log masuk penjual akan gagal (`503`).

URL selepas deploy:

- `https://pizzadonia.pages.dev` — UI utama + proxy API `/api` (disyorkan untuk app Android)
- `https://pizzadonia.muhammadaiman20.workers.dev` — UI + API pada origin yang sama (sandaran)

Fail berkaitan:

- `wrangler.toml` — Worker, binding `ASSETS` dan D1 `DB`.
- `worker/src/index.ts` — REST API (awam + admin).
- `worker/schema.sql` — skema table `pizzadonia_orders`.
- `.dev.vars` — `ADMIN_PIN` untuk `wrangler dev` (diabaikan oleh Git).

### Pangkalan data

Had D1 Free plan ialah 10 pangkalan data dan akaun ini sudah penuh (10/10), jadi projek menggunakan semula DB sedia ada `kewanganku-sync`. Semua objek diawali `pizzadonia_` supaya tidak bercampur dengan projek lain:

- Table `pizzadonia_orders` — satu baris setiap tempahan; lajur `data` menyimpan JSON penuh.
- `npm run db:init` cipta table pada DB remote, `npm run db:init:local` pada DB tempatan Wrangler.

### API

Laluan **awam** tidak memerlukan log masuk dan tidak mendedahkan senarai penuh tempahan:

| Kaedah | Laluan | Auth | Fungsi |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | Semakan hidup |
| `POST` | `/api/auth/login` | PIN | Tukar PIN kepada token sesi penjual |
| `POST` | `/api/orders` | – | Cipta tempahan (pelanggan) |
| `GET` | `/api/orders/lookup?q=` | – | Cari ikut no. tempahan / telefon |
| `GET` | `/api/orders/:id` | – | Baca satu tempahan |
| `POST` | `/api/orders/:id/payment` | – | Pelanggan sahkan bayaran (`unpaid → pending`) |

Laluan **penjual** memerlukan `Authorization: Bearer <token>` daripada `/api/auth/login`:

| Kaedah | Laluan | Auth | Fungsi |
| --- | --- | --- | --- |
| `GET` | `/api/orders` | Token | Senarai semua tempahan |
| `PATCH` | `/api/orders/:id` | Token | Tukar `status` / `paymentStatus` |
| `DELETE` | `/api/orders/:id` | Token | Padam tempahan |
| `POST` | `/api/orders/reset` | Token | Ganti semua (padam semua) |

Hanya dashboard menghantar token selepas log masuk. Halaman awam (checkout, tempahan, jejak) menggunakan laluan awam sahaja. Pelanggan tidak boleh menetapkan status `paid`; hanya penjual boleh menandakan bayaran diterima. Cipta tempahan sentiasa bermula `baru`/`unpaid` dan jumlah disemak terhadap harga item.

PIN penjual **tidak berada dalam bundle**. Ia disimpan sebagai secret Worker:

```sh
npx wrangler secret put ADMIN_PIN    # PIN akaun penjual, cth. 4821
npx wrangler secret put AUTH_SECRET  # pilihan: kunci tandatangan token
```

Jika `ADMIN_PIN` tidak ditetapkan, log masuk gagal tertutup (`503`) — tiada PIN lalai. `AUTH_SECRET` (jika ada) menandatangan token supaya menukar PIN tidak membatalkan sesi sedia ada. Token sah selama 12 jam dan cubaan log masuk dihadkan kepada 8 kali / 15 minit bagi setiap alamat IP.

### Mod data: awan vs peranti

Build produksi memanggil API `/api` pada origin yang sama (Worker). Jika berjaya, tempahan disimpan dalam D1 dan dashboard melihat data yang sama dari semua peranti. Jika API tiada (contoh `vite preview` tanpa Worker, atau offline), app kembali kepada localStorage tanpa error.

Untuk dev terhadap Worker yang sudah deploy:

```sh
VITE_API_BASE=https://pizzadonia.muhammadaiman20.workers.dev/api npm run dev
```

`VITE_API_BASE=off` memaksa mod localStorage walaupun dalam build produksi.

> Keselamatan: PIN penjual hanya dihantar sekali ke `/api/auth/login` dan disemak di pelayan. Selepas itu dashboard menggunakan token sesi yang ditandatangan HMAC. Laluan awam tidak boleh menyenaraikan semua tempahan. Untuk lapisan tambahan, letakkan dashboard di belakang Cloudflare Access. Endpoint `POST /api/orders` sengaja awam supaya pelanggan boleh menempah; ia belum ada rate limit.

### Cloudflare Pages (UI + API Worker)

Laman **https://pizzadonia.pages.dev** menghidangkan UI dan memanggil API pada origin yang sama (`/api`). Permintaan itu diproksi ke Worker oleh `functions/api/[[path]].js` di sisi Cloudflare, jadi DNS pengguna tidak perlu menyelesaikan `workers.dev`.

```sh
npm run deploy:pages
```

`deploy:pages` membina bundle dengan `API_BASE` relatif (`/api`), menyalin APK daripada `release/` ke `dist/download/`, dan deploy ke Pages (termasuk Functions). Deploy Worker masih diperlukan untuk API dan laman workers.dev:

```sh
npm run deploy
```

Fallback SPA dikendalikan oleh tetapan `not_found_handling = "single-page-application"` dalam `wrangler.toml` (app guna hash routing). Cloudflare menghidangkan `/seller` secara automatik daripada fail `seller.html`.

> Selepas deploy Pages, buka URL pada telefon Android melalui **HTTPS**. Butang **Kongsi QR ke WhatsApp / app** akan membuka share sheet Android (Web Share API hanya aktif pada HTTPS/localhost).

## APK Android

Terdapat **dua app berasingan**:

| App | App ID | Nama | Fungsi |
| --- | --- | --- | --- |
| Pelanggan | `com.pizzadonia.app` | Pizzadonia | Laman kedai: menu, tempahan, bayaran, jejak status |
| Penjual | `com.pizzadonia.seller` | Pizzadonia Penjual | Terus membuka dashboard tempahan pada `/seller.html` |

Kedua-duanya menggunakan `server.url` Capacitor untuk memuatkan laman produksi secara langsung. Alamat utama ialah **pages.dev** kerana sesetengah ISP menyekat `*.workers.dev` (`ERR_NAME_NOT_RESOLVED`):

```ts
// Pelanggan
server: {
  url: 'https://pizzadonia.pages.dev',
  errorPath: 'offline.html',
  allowNavigation: ['pizzadonia.pages.dev', 'pizzadonia.muhammadaiman20.workers.dev'],
}

// Penjual (flavor seller → android/app/src/seller/assets/capacitor.config.json)
server: {
  url: 'https://pizzadonia.pages.dev/seller',
  errorPath: 'offline-seller.html',
  allowNavigation: ['pizzadonia.pages.dev', 'pizzadonia.muhammadaiman20.workers.dev'],
}
```

Jika halaman gagal dimuatkan (contoh DNS disekat atau tiada internet), app memaparkan halaman **Tidak dapat hubungi pelayan** daripada fail `public/offline.html` / `public/offline-seller.html` dengan butang **Cuba lagi** dan **Buka alamat sandaran** (workers.dev).

Maksudnya, selepas web/API dikemas kini, APK yang sudah dipasang **tidak perlu dibina semula** — ia terus memuatkan versi terkini. APK hanya perlu dibina semula jika konfigurasi native (ikon, nama app, permission, plugin, `server.url`) berubah.

Kedua-dua app mempunyai logo tersendiri:

| App | Fail logo | Rupa |
| --- | --- | --- |
| Pelanggan | `public/logo.svg` | Hirisan pizza oren (logo asal) |
| Penjual | `public/logo-seller.svg` | Badge kedai hijau dengan awning dan hirisan pizza |

Ikon pelancar dan splash screen setiap app dijana daripada logo masing-masing. Ikon penjual berada dalam `android/app/src/seller/res/` dan mengatasi ikon utama melalui product flavor.

### Muat turun

Selepas deploy, APK boleh dimuat turun di:

- `/download` — halaman muat turun
- `/download/Pizzadonia-Pelanggan.apk`
- `/download/Pizzadonia-Penjual.apk`

### GitHub Actions (tanpa Android Studio)

Workflow `.github/workflows/android.yml` membina kedua-dua APK secara automatik.

1. Push ke `main`, atau buka **Actions → Build Android APK → Run workflow**.
2. Muat turun artifact `Pizzadonia-APK-<nombor>` (ZIP), kemudian ekstrak fail `.apk`.
3. Pasang pada telefon (benarkan **Install unknown apps** untuk pelayar/files).
4. `versionCode` menggunakan nombor run GitHub supaya setiap build lebih tinggi daripada build sebelumnya.

Tag seperti `v1.2.2` akan membina APK dan melampirkannya pada **GitHub Release**.

### Kunci tandatangan

Workflow membina APK debug secara lalai. Untuk APK release bertandatangan (contoh untuk edaran atau kemas kini app sedia ada), tambah **Repository secrets**:

| Secret | Keterangan |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Kandungan fail keystore dalam Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Kata laluan keystore |
| `ANDROID_KEY_ALIAS` | Alias kunci |
| `ANDROID_KEY_PASSWORD` | Kata laluan kunci |

Bina nilai Base64 pada mesin yang mempunyai keystore:

```sh
base64 -w0 ~/.android/debug.keystore
```

Nilai lalai untuk debug keystore Android Studio ialah alias `androiddebugkey`, kata laluan keystore `android`, dan kata laluan kunci `android`. Jika secret `ANDROID_KEYSTORE_BASE64` tiada, workflow membina APK debug dan memaparkan amaran.

> App pelanggan dan penjual mempunyai ID berbeza, jadi ia boleh dipasang bersama. Untuk mengemas kini app yang sama pada masa hadapan, gunakan kunci tandatangan yang sama.

### Kemas kini automatik (APK)

App Android menyemak fail manifest di pelayan setiap kali dibuka atau kembali aktif:

```
GET /app-version.json
```

Contoh kandungan (dijana automatik daripada `package.json` semasa deploy):

```json
{
  "customer": { "versionName": "1.2.2", "url": "/download/Pizzadonia-Pelanggan.apk" },
  "seller": { "versionName": "1.2.2", "url": "/download/Pizzadonia-Penjual.apk" }
}
```

Jika `versionName` dalam manifest lebih baharu daripada versi APK yang dipasang, app Android:

1. Memuat turun APK secara automatik di latar belakang (dengan bar kemajuan).
2. Meminta kebenaran **Install unknown apps** sekali sahaja jika belum diberi.
3. Membuka pemasang sistem Android secara automatik.

Pengguna hanya perlu menekan **Install**. Android **tidak membenarkan** pemasangan senyap sepenuhnya untuk app sideload (hanya app sistem, device owner, atau app dari Play Store boleh melakukannya). Pemberitahuan kemas kini boleh ditutup untuk versi tersebut; butang **Pasang** membolehkan cubaan semula tanpa memuat turun semula.

Plugin native: `android/app/src/main/java/com/pizzadonia/app/AppUpdaterPlugin.java` (didaftarkan dalam `MainActivity.java`, permission `REQUEST_INSTALL_PACKAGES`, fail dikongsi melalui `FileProvider`).

`versionCode` APK sentiasa meningkat (cap masa Unix atau `VERSION_CODE`), jadi Android menerima APK baharu sebagai kemas kini. `versionName` diambil daripada `package.json` supaya manifest dan APK sentiasa sepadan.

Langkah mengeluarkan versi baharu:

1. Naikkan `version` dalam `package.json` (contoh `1.2.3`).
2. `npm run sync:android` — membina semula `dist` yang bersih (tanpa `dist/download`) dan menyalinnya ke Android. Ini penting: jika `cap sync` dijalankan selepas `npm run deploy:pages`, APK lama dalam `dist/download` akan turut dibundle dan saiz APK membengkak.
3. Bina APK: `./gradlew assembleCustomerDebug assembleSellerDebug` (atau release).
4. Salin APK ke `release/Pizzadonia-Pelanggan.apk` dan `release/Pizzadonia-Penjual.apk`.
5. Deploy: `npm run deploy` dan `npm run deploy:pages`. Manifest `/app-version.json` dijana secara automatik.
6. Pilihan: cipta GitHub Release untuk arkib versi.

```sh
VERSION=$(node -p "require('./package.json').version")
gh release create "v$VERSION" release/Pizzadonia-Pelanggan.apk release/Pizzadonia-Penjual.apk
```

> **Kemas kini kali pertama:** APK 1.1.0 dan lebih awal hanya mempunyai butang muat turun manual. Selepas memasang APK 1.2.0 atau lebih baharu sekali, kemas kini seterusnya berjalan secara automatik (muat turun + pemasang terbuka).

Repo ini kini **awam**, jadi aset GitHub Release boleh dimuat turun tanpa login:

- https://github.com/muhammadaiman20-glitch/pizzadonia/releases/tag/v1.2.2
- https://github.com/muhammadaiman20-glitch/pizzadonia/releases/download/v1.2.2/Pizzadonia-Pelanggan.apk
- https://github.com/muhammadaiman20-glitch/pizzadonia/releases/download/v1.2.2/Pizzadonia-Penjual.apk

Manifest auto-update masih menunjuk ke APK yang dihoskan Worker/Pages kerana URL itu sentiasa memberi versi terkini selepas `npm run deploy`, tanpa perlu mencipta release baharu. Release GitHub berfungsi sebagai arkib/mirror setiap versi.

### Build tempatan (pilihan)

Perlu Node.js 22, JDK 21 dan Android SDK 36:

```sh
npm ci
npm run sync:android

# APK debug — dua flavor
cd android && ./gradlew assembleCustomerDebug assembleSellerDebug

# APK release bertandatangan
cd android && ANDROID_KEYSTORE_PATH=/path/keystore.jks \
  ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_ALIAS=... ANDROID_KEY_PASSWORD=... \
  ./gradlew assembleCustomerRelease assembleSellerRelease
```

APK terhasil di:

- `android/app/build/outputs/apk/customer/debug/app-customer-debug.apk`
- `android/app/build/outputs/apk/seller/debug/app-seller-debug.apk`

## Halaman

| Laluan | Fungsi |
| --- | --- |
| `#/` | Landing page pelanggan — hero, menu, cara tempah, testimoni |
| `#/menu` | Menu penuh |
| `#/checkout` | Borang tempahan + ringkasan |
| `#/order/:id` | Halaman tempahan berjaya + status |
| `#/track` | Jejak tempahan ikut no. tempahan atau telefon |
| `/seller` atau `/seller.html` | Dashboard penjual (log masuk PIN) — halaman berasingan, tiada pautan pada laman pelanggan |
| `/download.html` | Muat turun APK pelanggan dan penjual |

## Tetapan

Edit `src/config.ts`:

```ts
whatsapp: '601162260552' // nombor WhatsApp kedai (format antarabangsa)
delivery: { fee: 3, freeAbove: 60, maxKm: 15 }
payment: {
  duitnowQr: '0002…589E',              // payload QR DuitNow penjual
  merchant: 'Muhammad Aiman bin Yahya',
}
```

Menu, harga dan saiz pizza berada dalam `src/data/menu.ts`.

## Bayaran QR DuitNow

Pelanggan boleh pilih **QR DuitNow** semasa checkout. Untuk pesanan QR, WhatsApp **tidak** dibuka secara automatik:

1. Checkout menyimpan tempahan dahulu, kemudian halaman tempahan memaparkan **QR DuitNow asal** daripada bank penjual (`SHOP.payment.duitnowQr`). Jumlah **tidak** dimasukkan ke dalam QR.
2. Pelanggan scan QR dalam TNG / app bank, **masukkan jumlah pesanan secara manual**, kemudian sahkan bayaran.
3. Butang **Hantar ke WhatsApp** dan **Salin mesej** dikunci sehingga pelanggan menekan **Saya sudah bayar**.
4. Status bayaran menjadi **Menunggu pengesahan**, dan butang **Hantar ke WhatsApp** aktif. Mesej WhatsApp akan menyatakan `QR DuitNow (Menunggu pengesahan)`.
5. Penjual semak penyata bank, kemudian tekan **Sahkan bayaran** pada kad tempahan. Status bertukar kepada **Telah dibayar**.

Jika pelanggan menutup halaman tempahan, mereka boleh buka semula melalui **Jejak Tempahan** → **Buat bayaran QR** / **Hantar tempahan ke WhatsApp`.

Status bayaran: `Belum bayar → Menunggu pengesahan → Telah dibayar`.

### Butang bayar dan salin jumlah

Tiada **deep link DuitNow sejagat** yang membolehkan laman web membuka mana-mana app bank dengan jumlah sudah diisi. DuitNow menyokong pembayaran melalui **scan QR**, dan setiap bank mengawal app masing-masing. Oleh itu halaman tempahan menyediakan bantuan berikut:

- **Jumlah perlu dibayar** dipaparkan besar — tekan jumlah untuk salin `103.60`, kemudian tampal dalam app bank.
- **Salin jumlah** — butang sandaran untuk peranti yang tidak menyokong tekan-panjang.
- **Simpan QR** — memuat turun PNG QR ke Downloads/galeri; dalam app bank pilih **Scan → Galeri**.
- **Kongsi QR ke WhatsApp / app** — sentiasa dipaparkan. Pada Android Chrome (HTTPS atau localhost) ia membuka **share sheet Android**, sama seperti berkongsi gambar ke WhatsApp, Telegram atau app lain. Jika Web Share tidak disokong (contoh desktop atau versi HTTP LAN), gambar QR disalin ke clipboard atau dimuat turun untuk dikongsi secara manual.

> Share sheet dan clipboard memerlukan **secure context** (HTTPS atau localhost). Untuk ujian pada telefon melalui `http://192.168.x.x`, butang akan memuat turun QR sebagai ganti — kongsi gambar itu dari galeri/Downloads.

Aliran kekal: bayar dalam app bank → tekan **Saya sudah bayar** → hantar ke WhatsApp.

> Pesanan **Tunai (COD)** dan **Transfer bank** masih membuka WhatsApp terus selepas checkout kerana tiada bayaran QR untuk disahkan.

## Lokasi peta (pilihan)

Semasa checkout penghantaran, pelanggan boleh:

1. Tekan **Kongsi lokasi semasa** — app/browser minta kebenaran dan menyimpan koordinat GPS, atau
2. Tampal pautan **Google Maps** (contoh: `https://maps.app.goo.gl/...` atau pautan dengan koordinat).

Dalam app Android, butang ini menggunakan plugin native `@capacitor/geolocation` dan permission `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION`. Ini perlu kerana WebView tidak boleh meminta kebenaran lokasi Android sendiri; `navigator.geolocation` pelayar digunakan sebagai fallback pada web. Jika kebenaran disekat, app memaparkan mesej yang mengarahkan pengguna membenarkan lokasi dalam tetapan atau menampal pautan Google Maps.

Lokasi disimpan bersama tempahan dan dipaparkan sebagai:

- `Lokasi peta: …` dalam mesej WhatsApp kepada kedai,
- butang **Navigasi ke lokasi pelanggan** pada kad dashboard (buka Google Maps directions),
- pautan **Buka lokasi di peta** pada halaman tempahan dan jejak.

> Lokasi automatik browser hanya berfungsi pada **HTTPS atau localhost**. Jika pelanggan membuka versi LAN `http://192.168.x.x`, butang GPS akan meminta mereka tampal pautan Google Maps sebagai ganti (pilihan itu sentiasa tersedia).

> DuitNow QR peribadi tiada API, jadi sistem **tidak boleh mengesan bayaran secara automatik**. Pengesahan adalah manual oleh penjual. Auto-detect sebenar memerlukan payment gateway (ToyyibPay, Chip, Billplz dan sejenisnya) dengan akaun merchant, API key, backend webhook dan caj transaksi.

### Kenapa tiada QR auto-jumlah

Aplikasi ini sengaja **tidak** menawarkan QR dengan jumlah tertanam. QR penjual ialah QR statik bank; menambah tag `54` dan mengira semula CRC menghasilkan string yang berbeza daripada yang didaftarkan bank, jadi TNG/acquirer menolaknya sebagai **“QR tidak sah”** walaupun CRC sah.

Punca utama:

- acquirer membandingkan **seluruh string QR / hash** dengan QR asal yang didaftarkan;
- QR **dinamik** memerlukan validity period yang dijana oleh sistem bank/payment gateway;
- payload QR penjual bermula dengan `00=01` (format lama), manakala profil DuitNow V1.5 semasa menyatakan format `00=02`.

Oleh itu UI hanya memaparkan **QR asal** dan pelanggan menaip jumlah secara manual. Untuk QR dinamik yang dijamin diterima semua bank, daftar merchant DuitNow melalui payment gateway dan jana QR melalui API mereka.

> `src/lib/duitnow.ts` masih disimpan sebagai rujukan pengiraan CRC/TLV, tetapi tidak digunakan oleh UI.

## Cara tempahan berfungsi

1. Pelanggan pilih pizza dan saiz, kemudian tambah ke beg.
2. Isi nama, telefon, alamat/ambil sendiri, lokasi peta (pilihan), bayaran dan nota.
3. Butang **Hantar ke WhatsApp** hanya aktif apabila nama, telefon dan alamat (jika penghantaran) lengkap. Jika belum, butang memaparkan maklumat yang masih kurang.
4. Tekan butang utama:
   - **Tunai / Transfer** → butiran tempahan terus dibuka dalam WhatsApp.
   - **QR DuitNow** → tempahan disimpan dahulu, QR asal dipaparkan (jumlah dimasukkan manual), dan WhatsApp hanya dibuka selepas pelanggan tekan **Saya sudah bayar**.
5. Tempahan disimpan dengan status **Baru** — ke Cloudflare D1 jika API tersedia, jika tidak ke localStorage peranti.
6. Penjual buka `/seller`, log masuk dengan PIN akaun penjual, dan kemas kini status:
   `Baru → Diterima → Sedang Dibakar → Sedia → Selesai` (atau Batal).
7. Penjual sahkan bayaran QR pada kad tempahan selepas duit masuk.
8. Pelanggan boleh jejak status di `#/track` menggunakan no. tempahan.

> Nota: dalam mod localStorage (dev/preview/offline), tempahan tidak dihantar ke server dan hanya ada pada browser/peranti yang sama. Dalam mod Cloudflare, semua peranti berkongsi data D1 yang sama.

## Data produksi

- D1 bermula kosong — tiada tempahan contoh. Tempahan sebenar pelanggan sahaja yang direkodkan.
- Butang **padam semua** mengosongkan table D1 (memerlukan sesi penjual yang sah).
- Cache localStorage: `pizzadonia.orders.v2`, `pizzadonia.cart.v1`; token sesi penjual: `pizzadonia.seller.token` (sessionStorage). Cache `pizzadonia.orders.v1` lama (yang mungkin mengandungi data demo) dipadam secara automatik.

## Struktur

```text
src/
  components/   # UI boleh guna semula (header, kad pizza, cart, timeline…)
  pages/        # Checkout, OrderSuccess, Track, Dashboard
  hooks/        # cart, orders, hash router
  data/menu.ts  # menu & harga
  lib/          # format, kiraan cart, API, mesej WhatsApp
  config.ts     # tetapan kedai
worker/
  src/index.ts  # REST API Worker (/api/orders…)
  schema.sql    # skema D1 (pizzadonia_orders)
public/pizzas/  # gambar menu
wrangler.toml   # Worker + D1 + laman statik
```
