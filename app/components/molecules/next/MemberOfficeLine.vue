<script setup lang="ts">
/**
 * Офис строкой — над витриной `_reference/design/catalog/catalog-showcase.html` (`.where`)
 * и под заголовком подтверждения заказа (`catalog-confirm.html`, `.sheet-head .office`).
 *
 * Роль «Офис в каталоге», размер над витриной: «Офис · » 15/400 серым, имя 15/700 белым.
 * Водитель видит, чью витрину смотрит. Рядом, через 8, — «Сменить» подчёркнутой ссылкой:
 * второстепенное действие рядом с текстом, как «Отказаться» на экране приглашения
 * (линия цвета текста на 40 %, отступ 3). В подтверждении «Сменить» нет — там офис справка.
 *
 * Строчная, как `.office` в макете: высоту строки задаёт блок, в котором она стоит. Над витриной
 * это блок кеглем 16 (`.where > div`) — строка 22, в подтверждении блок кеглем 15 (`.office`) —
 * строка 21. Свой кегль 15 на блоке давал бы 21 везде, и витрина поднималась бы на 1 px.
 *
 * Без имени — каталог без офиса (`catalog-no-office.html`): «Офис · » и ссылка действия,
 * «Выбрать» (issue #234). Офис есть, и он ещё не выбран.
 */
defineProps<{
  /** Подпись перед именем: «Офис». */
  label: string;
  /** Имя офиса из базы: «Кадышева». Нет — офис не выбран, и после «Офис · » стоит только ссылка. */
  name?: string;
  /** Подпись ссылки действия: «Сменить», «Выбрать». Нет — ссылки нет. */
  changeLabel?: string;
}>();

defineEmits<{ change: [] }>();
</script>

<template>
  <span class="font-manrope leading-[normal]">
    <!-- Без имени пробела после точки нет: до ссылки отступ ставит она сама, как `.change` в макете -->
    <span class="text-[15px] font-normal text-xb-light">{{ name ? `${label} · ` : `${label} ·` }}<b v-if="name" class="font-bold text-xb-text">{{ name }}</b></span>
    <button
      v-if="changeLabel"
      type="button"
      class="ml-2 cursor-pointer border-0 bg-transparent p-0 font-manrope text-[14px] font-medium text-xb-light underline decoration-[rgba(169,178,191,0.4)] underline-offset-[3px]"
      @click="$emit('change')"
    >
      {{ changeLabel }}
    </button>
  </span>
</template>
