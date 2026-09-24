<script setup lang="ts">
/**
 * Шторка «Отменить заказ?» на экране заказа (решение Руслана 25-09-2026, issue #210).
 *
 * Своего макета у неё нет: собрана по эталону шторок (`MemberSheet`) и паре кнопок
 * `MemberConfirmSheet` — сверху «Да» гранатовой L, под ней «Нет» серой. Вопрос и есть заголовок:
 * «Отменить заказ? Баллы вернутся на баланс.» — что станет с баллами, водитель узнаёт до нажатия.
 *
 * Шторка одна и поверх неё ничего не открывается. Пока отмена в пути (`busy`), «Да» ждёт
 * с кольцом, а «Нет» и Escape не закрывают: запрос уже ушёл, и шторка, закрытая посреди него,
 * оставила бы водителя гадать, отменён ли заказ. Отказ — текстом алым мягким над кнопками,
 * видом как в `MemberConfirmSheet`; шторка остаётся открытой, «Да» можно нажать снова.
 */
withDefaults(
  defineProps<{
    open: boolean;
    busy?: boolean;
    /** Текст отказа отмены. */
    error?: string;
    texts: {
      question: string;
      yes: string;
      no: string;
    };
  }>(),
  { busy: false, error: undefined },
);

defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.question" @close="!busy && $emit('cancel')">
    <!-- Слотом только при отказе: пустой слот оставил бы шторке отступ под несуществующим текстом -->
    <template v-if="error" #default>
      <p class="m-0 px-1 text-center text-[14px] font-normal leading-[1.45] text-xb-scarlet-soft">{{ error }}</p>
    </template>

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" :busy="busy" @click="$emit('confirm')">{{ texts.yes }}</AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" :disabled="busy" @click="$emit('cancel')">{{ texts.no }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
