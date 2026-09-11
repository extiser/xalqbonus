<script setup lang="ts">
/**
 * Раскладка Mini App: одна колонка во весь экран телефона, без служебной шапки.
 *
 * Шапки с навигацией здесь нет и не будет: у водителя один экран за раз, а переходы
 * между разделами приложения делает сам Telegram своей кнопкой «назад».
 *
 * Цвета заданы явно, а не унаследованы от темы Telegram: клиент открывает страницу
 * и в тёмной теме, и в светлой, и прозрачный фон в тёмной дал бы белый текст на белом.
 */
</script>

<template>
  <div class="min-h-screen bg-white font-sans text-slate-900">
    <main class="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
      <slot />
    </main>
  </div>
</template>
