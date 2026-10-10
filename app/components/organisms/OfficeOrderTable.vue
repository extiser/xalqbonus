<script setup lang="ts">
import { formatPhone } from '#shared/phone';
import type { OfficeOrder, OfficeOrdersResponse } from '#shared/types/orders';
import type { LoadState } from '~/types/loadState';
import { DASH, formatDate } from '~/utils/format';
import {
  orderChannelLabel,
  orderPaymentLabel,
  orderStatusLabel,
  orderStatusTone,
} from '~/utils/labels';
import { formatOrderTotal } from '~/utils/orderAmount';

/**
 * Заказы офиса страницей: номер, статус, водитель с позывным и телефоном, способ оплаты, канал,
 * сумма, когда оформлен и когда выдан. Сумма — в валюте заказа: баллы или сумы (issue #294).
 * Раскрытая карточка показывает только то, чего в строке нет.
 *
 * Висящие стоят первыми — порядок задаёт сервер. Номер раскрывает карточку с действиями прямо
 * в таблице, строкой под нажатой на всю ширину; повторное нажатие сворачивает. Какая строка
 * раскрыта, решает вызывающий (`expandedOrderId`), что в ней — тоже, слотом `expanded`: таблица
 * не знает ни о выдаче, ни об отмене.
 * Три состояния нарисованы, а не подразумеваются (docs/frontend.md → «Три состояния
 * обязательны»).
 *
 * Отказ списка, у которого есть свой текст с сервера, — «у вас нет доступа к этому офису»
 * (issue #250), — говорит им (`errorText`); остальные — общим «не прочитались».
 */
defineProps<{
  state: LoadState;
  data: OfficeOrdersResponse | null;
  errorText?: string;
  /** Раскрытая строка. Пусто — все свёрнуты. */
  expandedOrderId?: string | null;
}>();

const emit = defineEmits<{ toggle: [order: OfficeOrder]; page: [offset: number] }>();

defineSlots<{ expanded(props: { order: OfficeOrder }): unknown }>();

/** Колонок в строке — раскрытая карточка занимает их все. */
const COLUMN_COUNT = 9;

</script>

<template>
  <MoleculesSectionPanel title="Заказы офиса" note="Висящие первыми, дальше свежие вперёд.">
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем заказы…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      :message="errorText ?? 'Заказы не прочитались. Это отказ запроса, а не отсутствие заказов.'"
    />
    <MoleculesStateNotice
      v-else-if="!data || data.orders.length === 0"
      state="empty"
      message="Заказов с таким статусом в этом офисе нет."
    />
    <div v-else>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-slate-500">
            <tr>
              <th class="w-px py-2 pr-4 text-right font-medium">№</th>
              <th class="py-2 pr-4 font-medium">Номер</th>
              <th class="py-2 pr-4 font-medium">Статус</th>
              <th class="py-2 pr-4 font-medium">Водитель</th>
              <th class="py-2 pr-4 font-medium">Оплата</th>
              <th class="py-2 pr-4 font-medium">Канал</th>
              <th class="py-2 pr-4 text-right font-medium">Сумма</th>
              <th class="py-2 pr-4 font-medium">Оформлен</th>
              <th class="py-2 font-medium">Выдан</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(order, index) in data.orders" :key="order.orderId">
              <tr class="border-t border-slate-200">
                <td class="py-2 pr-4 text-right whitespace-nowrap"><AtomsRowNumber :value="data.offset + index + 1" /></td>
                <td class="py-2 pr-4">
                  <button
                    type="button"
                    class="font-semibold text-slate-900 tabular-nums underline underline-offset-2 hover:text-slate-600"
                    :aria-expanded="expandedOrderId === order.orderId"
                    @click="emit('toggle', order)"
                  >
                    № {{ order.number }}
                  </button>
                </td>
                <td class="py-2 pr-4">
                  <AtomsStatusBadge
                    :tone="orderStatusTone(order.status)"
                    :label="orderStatusLabel(order.status)"
                  />
                </td>
                <td class="py-2 pr-4">
                  <p>{{ order.driverName ?? DASH }}</p>
                  <!-- «16895 · +998 93 527-43-00» — вторая строка водителя. Телефон закрыт
                       в записях вебвизора, позывной — нет (issue #432). -->
                  <p v-if="order.callsign || order.phone" class="text-xs text-slate-500 tabular-nums">
                    {{ order.callsign }}<template v-if="order.callsign && order.phone"> · </template>
                    <span v-if="order.phone" class="ym-hide-content">{{ formatPhone(order.phone).display }}</span>
                  </p>
                </td>
                <td class="py-2 pr-4">{{ orderPaymentLabel(order.payment) }}</td>
                <td class="py-2 pr-4">{{ orderChannelLabel(order.channel) }}</td>
                <td class="py-2 pr-4 text-right whitespace-nowrap tabular-nums">{{ formatOrderTotal(order) }}</td>
                <td class="py-2 pr-4 whitespace-nowrap tabular-nums">{{ formatDate(order.createdAt) }}</td>
                <td class="py-2 whitespace-nowrap tabular-nums">{{ order.issuedAt ? formatDate(order.issuedAt) : '' }}</td>
              </tr>
              <tr v-if="expandedOrderId === order.orderId">
                <td :colspan="COLUMN_COUNT" class="pb-4">
                  <slot name="expanded" :order="order" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div class="border-t border-slate-200 pt-3">
        <MoleculesPagerBar
          :total="data.total"
          :limit="data.limit"
          :offset="data.offset"
          @change="emit('page', $event)"
        />
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
