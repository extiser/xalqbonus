<script setup lang="ts">
/**
 * Строка настройки: название, текущее значение и шеврон — «Язык · Русский ›».
 *
 * Переход, а не переключатель: случайное нажатие не должно выключать все сообщения бота
 * (решение #134). Нажатие отдаётся событием, что за ним открывается — решает экран.
 *
 * `inert` — строка-состояние: значение есть, а перехода нет, и шеврона тоже. «Пароль для входа
 * с компьютера · Задан» в профиле сотрудника (`_reference/design/staff/06-profile-password-set.html`,
 * issue #250): смена пароля живёт на сайте, а строка остаётся, чтобы «Настройки» не пустели.
 */
defineProps<{
  label: string;
  value: string;
  inert?: boolean;
}>();

defineEmits<{ open: [] }>();
</script>

<template>
  <div v-if="inert" class="flex min-h-[52px] w-full items-center gap-3 px-4 font-manrope text-[15px] font-normal">
    <span class="grow text-xb-text">{{ label }}</span>
    <span class="text-xb-grey">{{ value }}</span>
  </div>
  <button
    v-else
    type="button"
    class="flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 text-left font-manrope text-[15px] font-normal"
    @click="$emit('open')"
  >
    <span class="grow text-xb-text">{{ label }}</span>
    <span class="text-xb-grey">{{ value }}</span>
    <span class="-mr-1">
      <AtomsNextMemberChevron tone="dim" />
    </span>
  </button>
</template>
