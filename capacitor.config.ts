import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // App pelanggan. App penjual menggunakan ID berasingan melalui product flavor.
  appId: 'com.pizzadonia.app',
  appName: 'Pizzadonia',
  webDir: 'dist',

  // APK memuatkan laman produksi secara langsung, jadi kemas kini web
  // (termasuk API D1) terus muncul tanpa rebuild APK.
  server: {
    url: 'https://pizzadonia.muhammadaiman20.workers.dev',
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
