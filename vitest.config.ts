import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            include: ['src/index.ts'],
            reporter: ['text', 'text-summary', 'lcov']
        }
    }
});
