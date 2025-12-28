import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import electron from 'vite-plugin-electron'
export default defineConfig({
    // CRITICAL: Use relative paths for Electron production builds (file:// protocol)
    base: './',
    plugins: [
        react(),
        // Electron plugin temporarily disabled for web-only development
        // electron([
        //   {
        //     entry: 'electron/main.ts',
        //     vite: {
        //       build: {
        //         outDir: 'dist-electron',
        //       },
        //     },
        //   },
        //   {
        //     entry: 'electron/preload.ts',
        //     vite: {
        //       build: {
        //         outDir: 'dist-electron',
        //       },
        //     },
        //   },
        // ]),
    ],
    server: {
        port: 5173,
        host: '0.0.0.0', // Listen on all interfaces (both IPv4 and IPv6)
        strictPort: true, // Fail if port is already in use
    },
    // Phase 9A: Unit test configuration
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
