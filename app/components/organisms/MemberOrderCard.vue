<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MemberOrder, MemberOrderTexts } from '#shared/types/miniapp';

/**
 * Экран заказа: крупно код и номер, офис, состав и срок.
 *
 * Код — самое крупное на экране: его зачитывают вслух у стойки, держа телефон в руке.
 *
 * Отмена — в два нажатия: первое спрашивает, второе отменяет. Одно нажатие рядом с кодом,
 * который показывают менеджеру, — это отменённый по ошибке заказ у самой стойки.
 */
const props = defineProps<{
  order: MemberOrder;
  cancelling: boolean;
  cancelError: string | null;
  texts: MemberOrderTexts;
}>();

defineEmits<{ cancel: [] }>();

/** Спрошено ли подтверждение. Состояние вида, а не данных: сервер о нём не знает. */
const confirming = ref(false);

// Другой заказ или сменившийся статус — вопрос о прошлом состоянии больше не задан.
watch(
  () => [props.order.orderId, props.order.status],
  () => {
    confirming.value = false;
  },
);
</script>

<template>
  <section class="flex flex-col gap-5">
    <header class="flex flex-col gap-0.5">
      <h1 class="text-2xl font-semibold">{{ order.title }}</h1>
      <p class="text-sm" :class="order.code ? 'text-emerald-800' : 'text-slate-600'">
        {{ order.statusText }}
      </p>
      <p v-if="order.reasonText" class="text-sm text-slate-500">{{ order.reasonText }}</p>
    </header>

    <div v-if="order.code" class="rounded-3xl bg-emerald-50 px-5 py-6 text-center">
      <p class="text-sm text-emerald-900">{{ texts.codeTitle }}</p>
      <p
        class="mt-2 font-mono text-6xl font-semibold tracking-[0.15em] text-emerald-900 tabular-nums"
      >
        {{ order.code }}
      </p>
      <p v-if="order.expiresNote" class="mt-3 text-sm text-emerald-900">
        {{ order.expiresNote }}
      </p>
    </div>

    <div class="flex flex-col gap-0.5">
      <p class="text-base font-medium text-slate-700">{{ order.officeName }}</p>
      <p class="text-sm text-slate-500">{{ order.officeAddress }}</p>
    </div>

    <MoleculesOrderLineList
      :lines="order.lines"
      :total="order.totalPoints"
      :total-label="texts.cartTotal"
      :points-unit="texts.points"
      :pieces-unit="texts.pieces"
    />

    <div v-if="order.status === 'pending'" class="flex flex-col gap-2">
      <p v-if="cancelError" class="text-sm leading-relaxed text-red-700">{{ cancelError }}</p>

      <AtomsMiniAppButton
        v-if="!confirming"
        variant="secondary"
        :label="texts.cancelOrder"
        @click="confirming = true"
      />

      <template v-else>
        <p class="text-base leading-relaxed">{{ texts.cancelQuestion }}</p>
        <AtomsMiniAppButton
          variant="danger"
          :label="texts.cancelYes"
          :disabled="cancelling"
          @click="$emit('cancel')"
        />
        <AtomsMiniAppButton
          variant="secondary"
          :label="texts.cancelNo"
          :disabled="cancelling"
          @click="confirming = false"
        />
      </template>
    </div>
  </section>
</template>
