<script setup lang="ts">
import type { StaffOrderView } from '~/types/staffView';

/**
 * Заказ у стойки — `_reference/design/staff/03-order-card.html`, шторки — `03-order-issue-sheet.html`
 * и `03-order-cancel-sheet.html` (issue #250).
 *
 * Сверху вниз: кто, что, сроки; кнопки внизу, в зоне большого пальца. «Выдать» — зелёная 64,
 * «Отменить заказ» — алым контуром, как отмена у водителя. Оба действия — через шторку: вопрос
 * называет водителя, и это единственное, что ловит опечатку в коде.
 *
 * «Да, выдать» — той же зелёной, что на карточке: действие одно и то же. «Да, отменить» — алая
 * обычного размера: отмена — потеря, но не главное действие стойки. «Назад» — серая.
 *
 * Какая шторка открыта, решает родитель. Пока идёт запрос (`acting`), кнопка шторки ждёт
 * с кольцом, «Назад» гаснет, и шторка не закрывается.
 */
defineProps<{
  order: StaffOrderView;
  sheet: 'none' | 'issue' | 'cancel';
  acting: boolean;
}>();

const emit = defineEmits<{ back: []; askIssue: []; askCancel: []; issue: []; cancel: []; close: [] }>();

const close = (acting: boolean): void => {
  if (!acting) {
    emit('close');
  }
};
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(24px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="order.title" back-label="Назад" @back="$emit('back')" />

    <div class="flex grow flex-col gap-2.5 px-4 pb-5 pt-2">
      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel label="Водитель" />
      </div>
      <MoleculesNextStaffDriverCard :driver="order.driver" />

      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel label="Состав" />
      </div>
      <div class="px-0.5 pt-1">
        <MoleculesNextMemberOrderLines :lines="order.lines" :total="order.total" :texts="{ total: 'Сумма' }" />
      </div>

      <MoleculesNextStaffDateRows :dates="order.dates" />
    </div>

    <div class="mt-auto flex flex-col gap-2.5 px-4 pt-2">
      <AtomsNextMemberButton size="xl" tone="green" @click="$emit('askIssue')">Выдать</AtomsNextMemberButton>
      <div class="relative z-[2]">
        <AtomsNextMemberButton size="l" tone="danger" @click="$emit('askCancel')">Отменить заказ</AtomsNextMemberButton>
      </div>
    </div>

    <MoleculesNextMemberSheet :open="sheet === 'issue'" :title="order.issueTitle" :subtitle="order.issueSubtitle" @close="close(acting)">
      <template #buttons>
        <AtomsNextMemberButton size="xl" tone="green" :busy="acting" @click="$emit('issue')">Да, выдать</AtomsNextMemberButton>
        <AtomsNextMemberButton size="l" tone="grey" :disabled="acting" @click="close(acting)">Назад</AtomsNextMemberButton>
      </template>
    </MoleculesNextMemberSheet>

    <MoleculesNextMemberSheet :open="sheet === 'cancel'" :title="order.cancelTitle" :subtitle="order.cancelSubtitle" @close="close(acting)">
      <template #buttons>
        <AtomsNextMemberButton size="l" tone="scarlet" :busy="acting" @click="$emit('cancel')">Да, отменить</AtomsNextMemberButton>
        <AtomsNextMemberButton size="l" tone="grey" :disabled="acting" @click="close(acting)">Назад</AtomsNextMemberButton>
      </template>
    </MoleculesNextMemberSheet>
  </div>
</template>
