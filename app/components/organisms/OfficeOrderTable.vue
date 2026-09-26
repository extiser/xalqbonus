<script setup lang="ts">
import type { OfficeOrder, OfficeOrdersResponse } from '#shared/types/orders';
import type { LoadState } from '~/types/loadState';
import { formatDate, formatNumber } from '~/utils/format';
import { orderStatusLabel, orderStatusTone } from '~/utils/labels';

/**
 * Заказы офиса страницей: номер, статус, водитель, сумма и когда оформлен.
 *
 * Висящие стоят первыми — порядок задаёт сервер. Номер открывает карточку с действиями.
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
}>();

const emit = defineEmits<{ open: [order: OfficeOrder]; page: [offset: number] }>();
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
              <th class="py-2 pr-4 font-medium">Номер</th>
              <th class="py-2 pr-4 font-medium">Статус</th>
              <th class="py-2 pr-4 font-medium">Водитель</th>
              <th class="py-2 pr-4 text-right font-medium">Сумма</th>
              <th class="py-2 font-medium">Оформлен</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in data.orders" :key="order.orderId" class="border-t border-slate-200">
              <td class="py-2 pr-4">
                <button
                  type="button"
                  class="font-semibold text-slate-900 tabular-nums underline underline-offset-2 hover:text-slate-600"
                  @click="emit('open', order)"
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
                {{ order.driverName ?? '—' }}
                <span v-if="order.callsign" class="text-slate-500"> · {{ order.callsign }}</span>
              </td>
              <td class="py-2 pr-4 text-right tabular-nums">{{ formatNumber(order.totalPoints) }}</td>
              <td class="py-2 whitespace-nowrap tabular-nums">{{ formatDate(order.createdAt) }}</td>
            </tr>
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
