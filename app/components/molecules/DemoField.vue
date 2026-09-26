<script setup lang="ts">
/**
 * Поле «Демо» формы заведения (issue #212): чем будет новая запись — демо или живой.
 *
 * Показывает его страница только владельцу и только до заведения: признак ставится один раз
 * и потом не меняется, поэтому у заведённой записи вместо поля стоит пометка «ДЕМО» в шапке.
 * Правило пишется подписью под полем: иначе галочку ставят «на пробу», рассчитывая снять.
 */
defineProps<{
  /** Кого затронет демо-запись — своими словами для каждого раздела. */
  hint: string;
}>();

const isDemo = defineModel<boolean>({ required: true });
</script>

<template>
  <div class="space-y-1">
    <label class="flex items-center gap-3">
      <input
        v-model="isDemo"
        type="checkbox"
        class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      />
      <span class="text-sm font-medium text-slate-900">Демо</span>
    </label>
    <p class="text-sm text-slate-500">
      {{ hint }} Ставится при заведении и потом не меняется.
    </p>
  </div>
</template>
