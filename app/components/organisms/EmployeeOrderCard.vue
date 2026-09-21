<script setup lang="ts">
import { ref, watch } from 'vue';
import type { OfficeOrder } from '#shared/types/orders';
import { deskIssueQuestion } from '~/utils/deskQuestion';
import { formatDate } from '~/utils/format';
import { orderStatusLabel } from '~/utils/labels';

/**
 * Карточка заказа у стойки в Mini App: номер, водитель с позывным и телефоном, состав, сумма
 * и сроки. Подтверждение выдачи называет водителя по имени (issue #172).
 *
 * «Выдать» и «Отменить» — обе в два нажатия. Выдачу назад не вернуть, отмена возвращает баллы
 * водителю, и одно случайное касание большим пальцем не должно делать ни того, ни другого.
 */
const props = defineProps<{
  order: OfficeOrder;
  acting: boolean;
  error: string | null;
}>();

defineEmits<{ issue: []; cancel: []; close: [] }>();

/** Какое действие ждёт подтверждения. Состояние вида: сервер о нём не знает. */
const confirming = ref<'issue' | 'cancel' | null>(null);

// Другой заказ или сменившийся статус — вопрос о прошлом состоянии больше не задан.
watch(
  () => [props.order.orderId, props.order.status],
  () => {
    confirming.value = null;
  },
);
</script>

<template>
  <section class="flex flex-col gap-5">
    <header class="flex flex-col gap-0.5">
      <p class="text-sm text-slate-500">{{ order.officeName }}</p>
      <h1 class="text-2xl font-semibold">Заказ № {{ order.number }}</h1>
      <p v-if="order.status !== 'pending'" class="text-sm text-slate-600">
        {{ orderStatusLabel(order.status) }}
      </p>
    </header>

    <div class="flex flex-col gap-0.5">
      <p class="text-lg font-semibold">{{ order.driverName ?? '—' }}</p>
      <p class="text-sm text-slate-500">
        Позывной: <span class="font-mono tabular-nums">{{ order.callsign ?? '—' }}</span>
      </p>
      <p class="text-sm text-slate-500">
        Телефон: <span class="tabular-nums">{{ order.phone ?? '—' }}</span>
      </p>
    </div>

    <MoleculesOrderLineList
      :lines="order.lines"
      :total="order.totalPoints"
      total-label="Сумма"
      points-unit="баллов"
      pieces-unit="шт."
    />

    <dl class="flex flex-col gap-1 text-sm">
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Оформлен</dt>
        <dd class="tabular-nums">{{ formatDate(order.createdAt) }}</dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Забрать до</dt>
        <dd class="tabular-nums">{{ formatDate(order.expiresAt) }}</dd>
      </div>
    </dl>

    <div class="flex flex-col gap-2">
      <p v-if="error" class="text-sm leading-relaxed text-red-700">{{ error }}</p>

      <template v-if="order.status === 'pending' && confirming === null">
        <AtomsMiniAppButton label="Выдать" :disabled="acting" @click="confirming = 'issue'" />
        <AtomsMiniAppButton
          variant="secondary"
          label="Отменить заказ"
          :disabled="acting"
          @click="confirming = 'cancel'"
        />
      </template>

      <template v-else-if="confirming === 'issue'">
        <p class="text-base leading-relaxed">
          {{ deskIssueQuestion(order.driverName, `заказ № ${order.number}`) }}
        </p>
        <AtomsMiniAppButton label="Да, выдать" :disabled="acting" @click="$emit('issue')" />
        <AtomsMiniAppButton
          variant="secondary"
          label="Не выдавать"
          :disabled="acting"
          @click="confirming = null"
        />
      </template>

      <template v-else-if="confirming === 'cancel'">
        <p class="text-base leading-relaxed">
          Отменить заказ № {{ order.number }}? Баллы вернутся водителю, товар — на полку.
        </p>
        <AtomsMiniAppButton
          variant="danger"
          label="Да, отменить"
          :disabled="acting"
          @click="$emit('cancel')"
        />
        <AtomsMiniAppButton
          variant="secondary"
          label="Не отменять"
          :disabled="acting"
          @click="confirming = null"
        />
      </template>

      <AtomsMiniAppButton
        v-if="confirming === null"
        variant="secondary"
        label="Закрыть"
        :disabled="acting"
        @click="$emit('close')"
      />
    </div>
  </section>
</template>
