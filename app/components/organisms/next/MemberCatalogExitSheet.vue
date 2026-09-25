<script setup lang="ts">
/**
 * Шторка «Выйти из каталога?» — `_reference/design/catalog/catalog-exit-sheet.html` (issue #234).
 *
 * Корзина не запоминается: иначе висящих корзин будет вагон (Руслан, 25-09-2026). Поэтому уход
 * из каталога с непустой корзиной спрашивает, а с пустой — нет; решает страница.
 *
 * По эталону шторок (`MemberSheet`) и шторке отмены заказа: заголовок-вопрос, под ним
 * последствие — «Товары из корзины не сохранятся.» слотом `subtitle`, 15 / 400 светлым, как
 * «Баллы вернутся на баланс.» в `MemberCancelOrderSheet`. Сверху «Остаться» гранатовой L —
 * то, чего водитель скорее хочет, под ней «Выйти» серой.
 *
 * «Остаться» и Escape закрывают шторку, и всё остаётся на месте; по затемнению шторка
 * не закрывается, как все шторки.
 */
defineProps<{
  open: boolean;
  texts: {
    title: string;
    /** Последствие под вопросом: «Товары из корзины не сохранятся.» */
    hint: string;
    stay: string;
    exit: string;
  };
}>();

defineEmits<{ stay: []; exit: [] }>();
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.title" @close="$emit('stay')">
    <!-- Межстрочный 1.65 — как у подписи шторок, кегль и цвет — свои -->
    <template #subtitle>
      <p class="m-0 text-center text-[15px] font-normal leading-[1.65] text-xb-secondary">{{ texts.hint }}</p>
    </template>

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" @click="$emit('stay')">{{ texts.stay }}</AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('exit')">{{ texts.exit }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
