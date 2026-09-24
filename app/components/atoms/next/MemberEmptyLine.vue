<script setup lang="ts">
/**
 * «Здесь пусто» под группой без ждущих — `_reference/design/orders/orders-screen-nopending.html`
 * (`.zero`, в `rewards-screen-nopending.html` побайтно тот же).
 *
 * Группа не пропадает, а остаётся с нулём и этой строкой: исчезнувшая группа читается как
 * «раздел раньше был, а теперь пропал» (Руслан, 24-09-2026). Отступы вокруг ставит контейнер —
 * от подписи группы и до следующей по 36 px.
 */
defineProps<{
  label: string;
}>();
</script>

<template>
  <p class="m-0 text-center text-[15px] font-light text-xb-grey">{{ label }}</p>
</template>
