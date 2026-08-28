import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Ограничение по расширению обязательно: в tests/ лежит fleet-export-resume.py —
    // питоновский тест разведки, Vitest его не понимает.
    include: ['tests/**/*.test.ts'],
    // Пустой прогон не считается провалом: тесты пишутся только на ядро начисления баллов
    // (docs/infra.md → «Тесты»), а ядра пока нет — команда при этом обязана жить.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '#server': path.resolve(__dirname, './server'),
    },
  },
});
