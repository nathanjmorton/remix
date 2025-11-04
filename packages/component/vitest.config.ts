import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 1000,
    hookTimeout: 1000,
    teardownTimeout: 1000,

    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [
        {
          browser: 'chromium',
          headless: true,
        },
      ],
    },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
