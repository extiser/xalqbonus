<script setup lang="ts">
/**
 * Шаги хода заявки слева направо (issue #471, #475) — плитка «Ход заявки» карточек раздела
 * «Заявки». Текущий шаг — циан, без ореола (кодекс, «Без ореола у отметок»). На телефоне шаги
 * идут сверху вниз.
 */
export type ProgressStep = { key: string; title: string; text: string; current: boolean };

defineProps<{
  steps: readonly ProgressStep[];
}>();
</script>

<template>
  <ol
    class="m-0 grid flex-1 list-none gap-4 p-0 max-web:mt-4 max-web:grid-cols-1"
    :class="steps.length === 5 ? 'web:grid-cols-5' : 'web:grid-cols-4'"
  >
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      class="relative min-w-0 pt-[18px] max-web:pt-0 max-web:pl-[22px]"
      :aria-current="step.current ? 'step' : undefined"
    >
      <!-- Линия до следующего шага: на ноутбуке вправо, на телефоне вниз. -->
      <span
        v-if="index < steps.length - 1"
        aria-hidden="true"
        class="absolute top-1 left-0 -right-4 h-0.5 bg-web-teal max-web:top-2.5 max-web:right-auto max-web:-bottom-4 max-web:left-1 max-web:h-auto max-web:w-0.5"
      />
      <span
        aria-hidden="true"
        class="absolute top-0 left-0 size-2.5 rounded-full max-web:top-1"
        :class="step.current ? 'bg-web-cyan' : 'bg-web-teal-mid'"
      />
      <b class="block font-manrope text-[14px] font-semibold" :class="step.current ? 'text-web-cyan' : 'text-web-text'">
        {{ step.title }}
      </b>
      <span class="mt-1 block truncate font-manrope text-[12px] leading-[1.4] text-web-grey max-web:whitespace-normal">
        {{ step.text }}
      </span>
    </li>
  </ol>
</template>
