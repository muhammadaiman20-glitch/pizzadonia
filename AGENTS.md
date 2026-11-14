# Panduan OpenCode
- React + TypeScript + Vite + Tailwind CSS v3.
- Mobile-first responsive UI.
- Gunakan komponen yang boleh diguna semula (reusable).
- Jangan padam fungsi sedia ada tanpa kebenaran.
- Jalankan `npm run build` selepas perubahan besar.
- **Setiap commit mesti disertakan APK baharu.** Selepas perubahan kod, jalankan `npm run apk:build` (bina web + `cap sync` + dua APK + salin ke `release/`), naikkan `version` dalam `package.json`, kemas kini `public/download.html`, kemudian commit `release/Pizzadonia-Pelanggan.apk` dan `release/Pizzadonia-Penjual.apk` bersama perubahan lain. Jangan commit kod tanpa APK yang sepadan.
