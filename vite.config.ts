import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Laman pelanggan dan dashboard penjual dibina sebagai dua halaman
      // berasingan. Kod dashboard tidak dimuatkan pada laman pelanggan.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        seller: fileURLToPath(new URL('./seller.html', import.meta.url)),
      },
    },
  },
})
