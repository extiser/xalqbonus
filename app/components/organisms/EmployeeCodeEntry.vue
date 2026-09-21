<script setup lang="ts">
/**
 * Поле кода на экране сотрудника в Mini App: водитель называет пять цифр, сотрудник набирает.
 * Код — заказа или награды: поле одно, что перед ним, сотрудник заранее не решает (issue #172).
 *
 * Запрос уходит по пятой цифре сам — это решает страница по событию `complete`. Итог прошлой
 * выдачи стоит над полем зелёным, отказ поиска — под ним красным: первое читают после
 * действия, второе — вместо результата.
 */
defineProps<{
  officeName: string;
  searching: boolean;
  error: string | null;
  notice: string | null;
}>();

const code = defineModel<string>({ required: true });

defineEmits<{ complete: [code: string] }>();
</script>

<template>
  <section class="flex flex-col gap-3">
    <header class="flex flex-col gap-0.5">
      <p class="text-sm text-slate-500">{{ officeName }}</p>
      <h1 class="text-2xl font-semibold">Код выдачи</h1>
    </header>

    <p v-if="notice" class="rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
      {{ notice }}
    </p>

    <AtomsCodeInput
      v-model="code"
      label="Код заказа или награды, пять цифр"
      autofocus
      @complete="$emit('complete', $event)"
    />

    <p v-if="searching" class="text-sm text-slate-500">Ищем…</p>
    <p v-else-if="error" class="text-sm leading-relaxed text-red-700">{{ error }}</p>
  </section>
</template>
