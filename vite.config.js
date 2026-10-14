import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `npm run dev` = hot-reload UI on 5401 talking to the real server on 5400.
// Normal use: Start Pizzadonia.bat builds once and server.js serves everything on 5400.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5401, proxy: { '/api': 'http://127.0.0.1:5400' } },
})
