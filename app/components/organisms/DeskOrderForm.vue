<script setup lang="ts">
import { computed } from 'vue';
import type { DeskCustomer, DeskOfferedProduct } from '~/types/deskOrder';
import type { LoadState } from '~/types/loadState';
import type { OrderLineListItem } from '~/types/orderLineList';
import { DASH, formatNumber } from '~/utils/format';
import type { DriverSearchRow } from '#shared/types/driver';
import type { DeskOrderRequestBody } from '#shared/types/orders';

/**
 * Оформление заказа у стойки (issue #294): водитель поиском → способ оплаты → товары офиса
 * с остатком и ценой выбранного способа → итог и подтверждение.
 *
 * Заказ выдаётся той же операцией, что оформлен: кода и срока у него нет, товар уходит
 * с полки сразу. Поэтому подтверждение — отдельным нажатием, как у выдачи по коду.
 *
 * Карточка на странице всегда, как «Выдать по коду», и закрывать её некуда: после выбора
 * водителя есть «Сбросить» — назад к пустому поиску. Туда же карточка возвращается сама после
 * удачного оформления, и над поиском — строка итога (`notice`).
 *
 * Недопустимое экран не даёт выбрать, но решает сервер: уволенный виден со статусом «Уволен»
 * и без кнопки выбора, у водителя без счёта оплата баллами погашена, товар без цены способа
 * в нём не предлагается. За данными компонент не ходит — всё приходит свойствами, решения
 * уходят событиями (docs/frontend.md → «Данные в компоненты не ходят»).
 */
type Payment = DeskOrderRequestBody['payment'];

const props = defineProps<{
  officeName: string;
  searchState: LoadState | null;
  searchRows: DriverSearchRow[];
  customer: DeskCustomer | null;
  payment: Payment | null;
  productsState: LoadState;
  products: DeskOfferedProduct[];
  quantities: Record<string, string>;
  lines: OrderLineListItem[];
  total: number;
  overStock: boolean;
  overBalance: boolean;
  canSubmit: boolean;
  confirming: boolean;
  submitting: boolean;
  error: string | null;
  /** Итог прошлого оформления: «Заказ № N оформлен и выдан». */
  notice: string | null;
}>();

/** Строка поиска водителя — у вызывающего: сброс обязан её очищать. */
const query = defineModel<string>('query', { required: true });

const emit = defineEmits<{
  search: [];
  pick: [row: DriverSearchRow];
  reset: [];
  payment: [payment: Payment];
  quantity: [productId: string, value: string];
  confirm: [];
  unconfirm: [];
  submit: [];
  retryProducts: [];
}>();

const rowName = (row: DriverSearchRow): string =>
  [row.lastName, row.firstName, row.middleName].filter((part): part is string => Boolean(part)).join(' ') ||
  'Без имени';

const unit = computed(() => (props.payment === 'retail' ? 'сум' : 'баллов'));

const PAYMENT_CHOICES: { value: Payment; label: string }[] = [
  { value: 'points', label: 'За баллы' },
  { value: 'retail', label: 'За розницу' },
];

const pointsLocked = computed(() => props.customer?.balance === null);

const summary = computed(() => `${formatNumber(props.total)} ${unit.value}`);
</script>

<template>
  <MoleculesSectionPanel
    title="Оформить заказ"
    :note="`Офис «${officeName}». Водитель у стойки: найдите его, выберите оплату и товары — заказ выдаётся сразу, без кода.`"
  >
    <div class="space-y-6">
      <p v-if="notice" class="text-sm font-medium text-emerald-700">{{ notice }}</p>

      <!-- Шаг 1. Водитель -->
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-900">Водитель</h3>

        <div v-if="customer" class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="text-sm font-semibold text-slate-900">{{ customer.name }}</span>
          <span v-if="customer.callsign" class="text-sm text-slate-500">{{ customer.callsign }}</span>
          <AtomsStatusBadge
            :tone="customer.isMember ? 'ok' : 'muted'"
            :label="customer.isMember ? 'в программе' : 'не в программе'"
          />
          <AtomsStatusBadge v-if="customer.isDemo" tone="demo" label="ДЕМО" />
          <span class="text-sm text-slate-500 tabular-nums">
            {{ customer.balance === null ? 'счёта нет' : `${formatNumber(customer.balance)} баллов` }}
          </span>
        </div>

        <div v-else class="space-y-2">
          <MoleculesDriverSearchForm v-model="query" :autofocus="false" @submit="emit('search')" />
          <MoleculesStateNotice v-if="searchState === 'loading'" state="loading" message="Ищем…" />
          <MoleculesStateNotice
            v-else-if="searchState === 'error'"
            state="error"
            message="Поиск не удался. Это отказ запроса, а не отсутствие водителя."
          />
          <MoleculesStateNotice
            v-else-if="searchState === 'ready' && searchRows.length === 0"
            state="empty"
            message="Никого не нашлось."
          />
          <ul v-else-if="searchRows.length > 0" class="divide-y divide-slate-200">
            <li
              v-for="row in searchRows"
              :key="row.personId"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
            >
              <div class="min-w-48 flex-1">
                <p class="text-sm font-medium text-slate-900">{{ rowName(row) }}</p>
                <p class="text-xs text-slate-500">
                  {{ row.callsigns.join(', ') || DASH }} ·
                  <span class="ym-hide-content">{{ row.phones.join(', ') || DASH }}</span> ·
                  {{ row.balance === null ? 'счёта нет' : `${formatNumber(row.balance)} баллов` }}
                </p>
              </div>
              <AtomsStatusBadge v-if="row.fired" tone="alarm" label="Уволен" />
              <AtomsStatusBadge
                v-else
                :tone="row.isMember ? 'ok' : 'muted'"
                :label="row.isMember ? 'в программе' : 'не в программе'"
              />
              <AtomsStatusBadge v-if="row.isDemo" tone="demo" label="ДЕМО" />
              <AtomsActionButton label="Выбрать" :disabled="row.fired" @click="emit('pick', row)" />
            </li>
          </ul>
        </div>
      </div>

      <!-- Шаг 2. Способ оплаты -->
      <div v-if="customer" class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-900">Оплата</h3>
        <div class="flex flex-wrap items-center gap-2">
          <AtomsActionButton
            v-for="choice in PAYMENT_CHOICES"
            :key="choice.value"
            :label="choice.label"
            :tone="payment === choice.value ? 'primary' : 'secondary'"
            :disabled="submitting || (choice.value === 'points' && pointsLocked)"
            @click="emit('payment', choice.value)"
          />
        </div>
        <p v-if="pointsLocked" class="text-sm text-slate-500">
          У водителя нет счёта в программе — за баллы оформить нельзя.
        </p>
      </div>

      <!-- Шаг 3. Товары офиса -->
      <div v-if="customer && payment" class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-900">Товары</h3>
        <MoleculesStateNotice v-if="productsState === 'loading'" state="loading" message="Читаем товары офиса…" />
        <div v-else-if="productsState === 'error'" class="space-y-2">
          <MoleculesStateNotice
            state="error"
            message="Товары офиса не прочитались. Это отказ запроса, а не пустая полка."
          />
          <AtomsActionButton label="Повторить" @click="emit('retryProducts')" />
        </div>
        <MoleculesStateNotice
          v-else-if="products.length === 0"
          state="empty"
          :message="
            payment === 'retail'
              ? 'В офисе нет товаров с розничной ценой на полке.'
              : 'В офисе нет товаров с ценой в баллах на полке.'
          "
        />
        <ul v-else class="divide-y divide-slate-200">
          <li
            v-for="product in products"
            :key="product.productId"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
          >
            <div class="min-w-48 flex-1">
              <p class="text-sm font-medium text-slate-900">{{ product.name }}</p>
              <p class="text-xs text-slate-500 tabular-nums">
                {{ formatNumber(product.unitPrice) }} {{ unit }} · на полке {{ formatNumber(product.available) }} шт.
              </p>
            </div>
            <div class="w-24">
              <AtomsNumberInput
                :model-value="quantities[product.productId] ?? ''"
                :min="0"
                :max="product.available"
                placeholder="0"
                :aria-label="`Количество: ${product.name}`"
                @update:model-value="emit('quantity', product.productId, $event)"
              />
            </div>
          </li>
        </ul>
      </div>

      <!-- Шаг 4. Итог и подтверждение -->
      <div v-if="lines.length > 0" class="space-y-3">
        <h3 class="text-sm font-semibold text-slate-900">Итог</h3>
        <MoleculesOrderLineList :lines="lines" :total="total" total-label="Сумма" :unit="unit" pieces-unit="шт." />
        <p v-if="payment === 'points' && customer?.balance != null" class="text-sm text-slate-500 tabular-nums">
          После оформления на счету останется {{ formatNumber(customer.balance - total) }} баллов.
        </p>
        <p v-if="overStock" class="text-sm text-red-700">На полке меньше, чем набрано.</p>
        <p v-if="overBalance" class="text-sm text-red-700">У водителя не хватает баллов на этот заказ.</p>
      </div>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

      <div v-if="customer" class="flex flex-wrap items-center gap-2">
        <template v-if="!confirming">
          <AtomsActionButton
            v-if="lines.length > 0"
            label="Оформить"
            tone="primary"
            :disabled="!canSubmit || submitting"
            @click="emit('confirm')"
          />
          <AtomsActionButton label="Сбросить" :disabled="submitting" @click="emit('reset')" />
        </template>
        <template v-else>
          <span class="text-sm">
            Оформить и выдать {{ customer?.name }} на {{ summary }}? Отменить выданный заказ нельзя.
          </span>
          <AtomsActionButton
            :label="submitting ? 'Оформляем…' : 'Да, оформить'"
            tone="primary"
            :disabled="submitting"
            @click="emit('submit')"
          />
          <AtomsActionButton label="Не оформлять" :disabled="submitting" @click="emit('unconfirm')" />
        </template>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
