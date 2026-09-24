<script setup lang="ts">
import { useDesignFonts } from '~/design/fonts';

/**
 * Раскладка экранов Mini App по новым макетам: загрузка, заглушки, регистрация и отказ
 * выключенному сотруднику (issue #194), главная, история и заказы участника (issue #210).
 * Цепочка обмена, награды и экран сотрудника пока живут в `miniapp`.
 *
 * Тёмный фон во весь экран и колонка шириной в экран, но не шире 520 px, по центру —
 * как на `/design`: на 16 Pro Max логическая ширина 440, 520 — запас сверху. Полей нет:
 * их задают сами экраны, у каждого свои — живой фон, например, идёт от края до края.
 */
useDesignFonts();
</script>

<template>
  <!-- touch-manipulation: двойной тап не увеличивает экран (issue #210) -->
  <div class="min-h-dvh touch-manipulation bg-xb-screen">
    <main class="mx-auto w-full max-w-[520px]">
      <slot />
    </main>
  </div>
</template>
