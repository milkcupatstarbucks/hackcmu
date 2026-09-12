import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        //  Pinned and strict: Auth0 only accepts redirects back to a registered
        //  origin, so a silently reassigned port breaks login with a confusing
        //  "Callback URL mismatch". strictPort makes a taken port fail loudly
        //  instead. Registered in Auth0: http://localhost:5173 and :8080.
        port: 5173,
        strictPort: true,
        // Development mirrors Render's one-origin setup: browser requests go
        // to Vite, while API and WebSocket traffic is forwarded to Node.
        proxy: {
            '/api': 'http://localhost:3001',
            '/ws': {
                target: 'ws://localhost:3001',
                ws: true
            }
        }
    }
});
