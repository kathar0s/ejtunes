import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    {
      name: 'rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/host') {
            req.url = '/host/';
          } else if (req.url.startsWith('/host/') && !req.url.includes('.')) {
            // Rewrite /host/XYZ to /host/index.html
            req.url = '/host/index.html';
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        host: resolve(__dirname, 'host/index.html'),
      },
    },
    target: 'es2015',
  },
})
