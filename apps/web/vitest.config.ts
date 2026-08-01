import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Сгенерированные значения токенов для кода, который не может
            // использовать CSS-переменные (Canvas, Satori). Алиас продублирован
            // из tsconfig: Vitest его оттуда не читает.
            '@tokens': path.resolve(__dirname, './design-system/build/tokens.ts'),
        },
    },
});
