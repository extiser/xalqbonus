<script setup lang="ts">
import type { OfficeStockResponse } from '#shared/types/catalog';
import type { LoadState } from '~/types/loadState';

/**
 * Остатки офиса: весь каталог с двумя числами и двумя действиями на строку.
 *
 * Весь каталог, а не только лежащее в офисе: приход в офис, где товара ещё не было, —
 * штатный случай, и товар с нулями обязан быть видно, иначе его нечем выбрать для прихода.
 *
 * Резерв показан рядом со свободным остатком и правкой не меняется: он принадлежит висящим
 * заказам, и уменьшить его значит отобрать у водителя товар, который тот уже оплатил баллами.
 */
defineProps<{
  state: LoadState;
  data: OfficeStockResponse | null;
  /** По какой строке идёт операция. `null` — ни по какой. */
  busyProductId: string | null;
  /** Ответ сервера на последнюю операцию. `null` — показывать нечего. */
  error: string | null;
  /** Без прихода и правки: ДЕМО ОФИС у того, кто его не правит (issue #212). */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  receive: [payload: { productId: string; quantity: number; note: string }];
  adjust: [payload: { productId: string; onHand: number; note: string }];
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Остатки"
    note="Истина по остатку — журнал движений под таблицей; числа здесь — его кэш, и правит их только операция, пишущая движение."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем остатки…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Остатки не прочитались. Это отказ запроса, а не пустые остатки."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.rows.length === 0"
      state="empty"
      message="В каталоге ещё нет товаров: заводятся они в разделе «Каталог»."
    />
    <div v-else>
      <p v-if="error" class="mb-3 text-sm text-red-700">{{ error }}</p>
      <MoleculesStockRow
        v-for="row in data.rows"
        :key="row.productId"
        :row="row"
        :busy="busyProductId === row.productId"
        :readonly="readonly"
        @receive="emit('receive', { productId: row.productId, ...$event })"
        @adjust="emit('adjust', { productId: row.productId, ...$event })"
      />
    </div>
  </MoleculesSectionPanel>
</template>
