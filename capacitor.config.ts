import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // App pelanggan. App penjual menggunakan ID berasingan melalui product flavor.
  appId: 'com.pizzadonia.app',
  appName: 'Pizzadonia',
  webDir: 'dist',

  // APK memuatkan laman produksi secara langsung, jadi kemas kini web
  // (termasuk API D1) terus muncul tanpa rebuild APK.
  //
  // Guna Pages sebagai alamat utama kerana sesetengah ISP menyekat
  // `*.workers.dev` (ERR_NAME_NOT_RESOLVED). API `/api` diproksi oleh
  // `functions/api/[[path]].js` di sisi Cloudflare.
  server: {
    url: 'https://pizzadonia.pages.dev',
    cleartext: false,
    errorPath: 'offline.html',
    allowNavigation: [
      'pizzadonia.pages.dev',
      'pizzadonia.muhammadaiman20.workers.dev',
    ],
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
