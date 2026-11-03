import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the app icons in public/ from public/logo.svg.
// Re-run with: npm run icons
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: '#16130e' } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: '#16130e' } },
  },
  images: ['public/logo.svg'],
})
