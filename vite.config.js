import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler|zustand)/,
              priority: 30,
            },
            {
              name: 'three-vendor',
              test: /node_modules[\\/](@react-three|three|troika-three-text|troika-three-utils|meshline)/,
              maxSize: 300000,
              priority: 20,
            },
            {
              name: 'motion-vendor',
              test: /node_modules[\\/](framer-motion|motion-dom|motion-utils|gsap)/,
              priority: 15,
            },
            {
              name: 'vendor',
              test: /node_modules/,
              maxSize: 300000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
