import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    {
      name: 'rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url, 'http://localhost');
          const pathname = url.pathname;

          if (pathname === '/host') {
            req.url = '/host/' + url.search;
          } else if (pathname.startsWith('/host/') && !pathname.includes('.')) {
            // Rewrite /host/XYZ to /host/index.html
            req.url = '/host/index.html' + url.search;
          } else if (pathname === '/login') {
            req.url = '/login/index.html' + url.search;
          } else if (pathname.startsWith('/login/') && !pathname.includes('.')) {
            req.url = '/login/index.html' + url.search;
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
        login: resolve(__dirname, 'login/index.html'),
      },
    },
    target: 'es2015',
  },
})
