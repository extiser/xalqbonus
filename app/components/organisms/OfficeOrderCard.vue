<script setup lang="ts">
import { ref, watch } from 'vue';
import type { OfficeOrder } from '#shared/types/orders';
import { deskIssueQuestion } from '~/utils/deskQuestion';
import { formatDate } from '~/utils/format';
import { orderCancelReasonLabel, orderStatusLabel } from '~/utils/labels';

/**
 * Карточка заказа в вебе: кто, что, сколько и когда — и два действия.
 *
 * Действия те же, что у стойки в Mini App, и тоже в два нажатия: выдачу не вернуть, а отмена
 * возвращает баллы водителю. Кнопки есть только у висящего заказа.
 */
const props = defineProps<{
  order: OfficeOrder;
  acting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ issue: []; cancel: []; close: [] }>();

const confirming = ref<'issue' | 'cancel' | null>(null);

watch(
  () => [props.order.orderId, props.order.status],
  () => {
    confirming.value = null;
  },
);
</script>

<template>
  <MoleculesSectionPanel :title="`Заказ № ${order.number}`" :note="order.officeName">
    <dl>
      <MoleculesFactRow label="Статус" :value="orderStatusLabel(order.status)" />
      <MoleculesFactRow label="Водитель" :value="order.driverName" />
      <MoleculesFactRow label="Позывной" :value="order.callsign" mono />
      <MoleculesFactRow label="Телефон" :value="order.phone" mono />
      <MoleculesFactRow v-if="order.code" label="Код" :value="order.code" mono />
      <MoleculesFactRow label="Оформлен" :value="formatDate(order.createdAt)" />
      <MoleculesFactRow
        v-if="order.status === 'pending'"
        label="Забрать до"
        :value="formatDate(order.expiresAt)"
      />
      <MoleculesFactRow v-if="order.issuedAt" label="Выдан" :value="formatDate(order.issuedAt)" />
      <MoleculesFactRow
        v-if="order.cancelledAt"
        label="Отменён"
        :value="formatDate(order.cancelledAt)"
        :hint="order.cancelReason ? orderCancelReasonLabel(order.cancelReason) : undefined"
      />
    </dl>

    <div class="mt-4">
      <MoleculesOrderLineList
        :lines="order.lines"
        :total="order.totalPoints"
        total-label="Сумма"
        points-unit="баллов"
        pieces-unit="шт."
      />
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-700">{{ error }}</p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <template v-if="order.status === 'pending' && confirming === null">
        <AtomsActionButton label="Выдать" tone="primary" :disabled="acting" @click="confirming = 'issue'" />
        <AtomsActionButton label="Отменить заказ" tone="danger" :disabled="acting" @click="confirming = 'cancel'" />
      </template>

      <template v-else-if="confirming === 'issue'">
        <span class="text-sm">{{ deskIssueQuestion(order.driverName, `заказ № ${order.number}`) }}</span>
        <AtomsActionButton label="Да, выдать" tone="primary" :disabled="acting" @click="emit('issue')" />
        <AtomsActionButton label="Не выдавать" :disabled="acting" @click="confirming = null" />
      </template>

      <template v-else-if="confirming === 'cancel'">
        <span class="text-sm">Отменить заказ № {{ order.number }}? Баллы вернутся водителю, товар — в остатки.</span>
        <AtomsActionButton label="Да, отменить" tone="danger" :disabled="acting" @click="emit('cancel')" />
        <AtomsActionButton label="Не отменять" :disabled="acting" @click="confirming = null" />
      </template>

      <AtomsActionButton v-if="confirming === null" label="Закрыть" :disabled="acting" @click="emit('close')" />
    </div>
  </MoleculesSectionPanel>
</template>
