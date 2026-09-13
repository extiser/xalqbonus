<script setup lang="ts">
import { computed } from 'vue';
import type { MemberOrderTexts, MiniAppShowcaseResponse } from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';
import { formatNumber } from '~/utils/format';

/**
 * Витрина офиса: плитка товаров и внизу итог — сумма и сколько останется на балансе.
 *
 * «Оформить» гаснет, пока сумма выше баланса, и под кнопкой сказано почему: погасшая кнопка
 * без объяснения неотличима от сломанной. Пустая витрина говорит словами, а не показывает
 * пустую сетку.
 */
const props = defineProps<{
  state: LoadState;
  showcase: MiniAppShowcaseResponse | null;
  /** Текст отказа от сервера — у архивного офиса. `null` — свой «не удалось загрузить». */
  errorMessage: string | null;
  quantities: Record<string, number>;
  total: number;
  texts: MemberOrderTexts;
}>();

defineEmits<{
  increment: [productId: string];
  decrement: [productId: string];
  checkout: [];
}>();

const balanceAfter = computed(() => (props.showcase?.balancePoints ?? 0) - props.total);

/** Почему кнопка погашена. `null` — не погашена. */
const blockReason = computed(() => {
  if (props.total === 0) {
    return props.texts.checkoutNothingSelected;
  }

  return balanceAfter.value < 0 ? props.texts.checkoutOverBalance : null;
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <header v-if="showcase" class="flex flex-col gap-0.5">
      <h1 class="text-2xl font-semibold">{{ showcase.office.name }}</h1>
      <p class="text-sm text-slate-500">{{ showcase.office.address }}</p>
    </header>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      :message="errorMessage ?? texts.showcaseFailed"
    />
    <MoleculesStateNotice
      v-else-if="!showcase || showcase.products.length === 0"
      state="empty"
      :message="texts.showcaseEmpty"
    />

    <template v-else>
      <div class="grid grid-cols-2 gap-3">
        <MoleculesShowcaseProductTile
          v-for="product in showcase.products"
          :key="product.productId"
          :product="product"
          :quantity="quantities[product.productId] ?? 0"
          :no-photo-label="texts.noPhoto"
          :points-unit="texts.points"
          :pieces-unit="texts.pieces"
          :in-stock-label="texts.inStock"
          @increment="$emit('increment', product.productId)"
          @decrement="$emit('decrement', product.productId)"
        />
      </div>

      <!-- Итог прилипает к низу экрана: товаров бывает на несколько экранов, и сумма
           обязана быть видна там, где водитель нажимает «плюс». -->
      <div class="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white pt-3 pb-4">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-sm text-slate-500">{{ texts.cartTotal }}</span>
          <span class="text-lg font-semibold tabular-nums">
            {{ formatNumber(total) }} {{ texts.points }}
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-sm text-slate-500">{{ texts.balanceAfter }}</span>
          <span
            class="text-base font-medium tabular-nums"
            :class="balanceAfter < 0 ? 'text-red-700' : 'text-slate-700'"
          >
            <!-- Минус типографский, как в истории: у дефиса другая ширина. -->
            {{ balanceAfter < 0 ? `−${formatNumber(-balanceAfter)}` : formatNumber(balanceAfter) }}
            {{ texts.points }}
          </span>
        </div>
        <AtomsMiniAppButton
          :label="texts.checkout"
          :disabled="blockReason !== null"
          @click="$emit('checkout')"
        />
        <p
          v-if="blockReason"
          class="text-center text-sm"
          :class="total > 0 ? 'text-red-700' : 'text-slate-500'"
        >
          {{ blockReason }}
        </p>
      </div>
    </template>
  </section>
</template>
