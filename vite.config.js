import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
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
});
