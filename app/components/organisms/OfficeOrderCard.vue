<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { OfficeOrder, OrderEmployee } from '#shared/types/orders';
import { deskIssueQuestion } from '~/utils/deskQuestion';
import { formatDate } from '~/utils/format';
import {
  employeeRoleLabel,
  orderCancelReasonLabel,
  orderChannelLabel,
  orderPaymentLabel,
  orderStatusLabel,
} from '~/utils/labels';
import { orderLinePrice, orderPaymentUnit, orderTotal } from '~/utils/orderAmount';

/**
 * Карточка заказа в вебе: кто, что, сколько и когда — и два действия.
 *
 * Действия те же, что у стойки в Mini App, и тоже в два нажатия: выдачу не вернуть, а отмена
 * возвращает баллы водителю. Кнопки есть только у висящего заказа.
 *
 * Сумма — в валюте заказа: баллы у заказа за баллы, сумы у розничного (issue #294).
 *
 * Два вида, смысловым свойством `variant`. `standalone` — отдельная карточка под «Выдать
 * по коду»: всё о заказе, от статуса до телефона. `row` — раскрытая строка «Заказов офиса»:
 * только то, чего в строке нет, — состав с суммой, кто работал с заказом, и действия.
 * Статус, оплата, канал, водитель, позывной, телефон и время стоят в самой строке.
 */
type OrderCardVariant = 'standalone' | 'row';

const props = withDefaults(
  defineProps<{
    order: OfficeOrder;
    acting: boolean;
    error: string | null;
    variant?: OrderCardVariant;
  }>(),
  { variant: 'standalone' },
);

const emit = defineEmits<{ issue: []; cancel: []; close: [] }>();

const confirming = ref<'issue' | 'cancel' | null>(null);

type WorkerRow = { label: string; value: string; hint?: string };

const employeeRow = (label: string, employee: OrderEmployee | null): WorkerRow[] =>
  employee ? [{ label, value: employee.name, hint: employeeRoleLabel(employee.role) }] : [];

/**
 * Кто работал с заказом — пустые строки не показываются. Отменил сотрудник — он по имени
 * и роли; водитель и просрочка — словами: человека-сотрудника там не было.
 */
const workers = computed<WorkerRow[]>(() => {
  const { order } = props;
  const cancelled: WorkerRow[] =
    order.cancelReason === 'employee'
      ? employeeRow('Отменил', order.cancelledBy)
      : order.cancelReason === 'driver'
        ? [{ label: 'Отменил', value: 'водитель' }]
        : order.cancelReason === 'expired'
          ? [{ label: 'Отменил', value: 'срок истёк' }]
          : [];

  return [...employeeRow('Оформил', order.createdBy), ...employeeRow('Выдал', order.issuedBy), ...cancelled];
});

watch(
  () => [props.order.orderId, props.order.status],
  () => {
    confirming.value = null;
  },
);
</script>

<template>
  <MoleculesSectionPanel
    :title="`Заказ № ${order.number}`"
    :note="variant === 'standalone' ? order.officeName : undefined"
  >
    <dl v-if="variant === 'standalone'">
      <MoleculesFactRow label="Статус" :value="orderStatusLabel(order.status)" />
      <MoleculesFactRow label="Оплата" :value="orderPaymentLabel(order.payment)" />
      <MoleculesFactRow label="Канал" :value="orderChannelLabel(order.channel)" />
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

    <div :class="variant === 'standalone' ? 'mt-4' : undefined">
      <MoleculesOrderLineList
        :lines="order.lines.map((line) => ({ ...line, unitPrice: orderLinePrice(line) }))"
        :total="orderTotal(order)"
        total-label="Сумма"
        :unit="orderPaymentUnit(order.payment)"
        pieces-unit="шт."
      />
    </div>

    <dl v-if="variant === 'row' && workers.length > 0" class="mt-4">
      <MoleculesFactRow
        v-for="worker in workers"
        :key="worker.label"
        :label="worker.label"
        :value="worker.value"
        :hint="worker.hint"
      />
    </dl>

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
