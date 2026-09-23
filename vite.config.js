import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import productsHandler from './api/products.js';
import uploadHandler from './api/upload.js';
import healthHandler from './api/health.js';
import authHandler from './api/auth.js';

function apiDevPlugin() {
  return {
    name: 'api-dev-serverless-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = fullUrl.pathname;

        // Auth API
        if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
          req.query = Object.fromEntries(fullUrl.searchParams);
          if (req.method === 'POST') {
            let rawBody = '';
            for await (const chunk of req) rawBody += chunk;
            try {
              req.body = JSON.parse(rawBody);
            } catch {
              req.body = {};
            }
          }
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };
          return authHandler(req, res);
        }

        // Health & Diagnostics
        if (pathname === '/api/health' || pathname.startsWith('/api/health/')) {
          req.query = Object.fromEntries(fullUrl.searchParams);
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data, null, 2));
            return res;
          };
          return healthHandler(req, res);
        }

        // Products API
        if (pathname === '/api/products' || pathname.startsWith('/api/products/')) {
          req.query = Object.fromEntries(fullUrl.searchParams);
          if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
            let rawBody = '';
            for await (const chunk of req) rawBody += chunk;
            try {
              req.body = JSON.parse(rawBody);
            } catch {
              req.body = {};
            }
          }
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };
          return productsHandler(req, res);
        }

        // Image Upload API
        if (pathname === '/api/upload' || pathname.startsWith('/api/upload/')) {
          req.query = Object.fromEntries(fullUrl.searchParams);
          if (req.method === 'POST') {
            let rawBody = '';
            for await (const chunk of req) rawBody += chunk;
            try {
              req.body = JSON.parse(rawBody);
            } catch {
              req.body = {};
            }
          }
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };
          return uploadHandler(req, res);
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Populate process.env for local development serverless functions
  Object.keys(env).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = env[key];
    }
  });

  return {
    plugins: [apiDevPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          product: resolve(__dirname, 'product.html'),
          shop: resolve(__dirname, 'shop.html'),
          checkout: resolve(__dirname, 'checkout.html')
        }
      }
    }
  };
});
