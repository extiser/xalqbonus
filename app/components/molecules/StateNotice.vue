<script setup lang="ts">
/**
 * Загрузка, пустота и отказ — тремя разными сообщениями.
 *
 * «Прогонов ещё не было» и «журнал прогонов не читается» для смотрящего означают
 * противоположное, а выглядят одинаково, если состояния не различать. Экран
 * наблюдаемости, показывающий пусто при отказе запроса, врёт ровно так же, как старый бот,
 * выглядевший работающим.
 */
type NoticeState = 'loading' | 'empty' | 'error';

defineProps<{
  state: NoticeState;
  message: string;
}>();

const STATE_CLASSES: Record<NoticeState, string> = {
  loading: 'text-slate-500',
  empty: 'text-slate-500',
  error: 'text-red-700',
};
</script>

<template>
  <p class="py-6 text-center text-sm" :class="STATE_CLASSES[state]">
    {{ message }}
  </p>
</template>
