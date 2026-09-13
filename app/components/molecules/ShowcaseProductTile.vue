<script setup lang="ts">
import type { ShowcaseProduct } from '#shared/types/miniapp';
import { formatNumber } from '~/utils/format';

/**
 * Товар на витрине: фото, цена в баллах, остаток и выбор количества прямо на карточке.
 *
 * «Плюс» гаснет на доступном остатке: витрина не даёт собрать больше, чем лежит на полке.
 * Решает всё равно оформление — остаток мог уйти, пока водитель выбирал.
 */
defineProps<{
  product: ShowcaseProduct;
  quantity: number;
  noPhotoLabel: string;
  pointsUnit: string;
  piecesUnit: string;
  inStockLabel: string;
}>();

defineEmits<{ increment: []; decrement: [] }>();

const STEP_CLASSES =
  'flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300';
</script>

<template>
  <article
    class="flex flex-col gap-2 rounded-2xl border p-3"
    :class="quantity > 0 ? 'border-emerald-500' : 'border-slate-200'"
  >
    <MoleculesProductPhoto
      :photo-path="product.photoPath"
      :updated-at="product.updatedAt"
      :name="product.name"
      :empty-label="noPhotoLabel"
      size="tile"
    />

    <h3 class="text-sm leading-snug font-semibold text-slate-900">{{ product.name }}</h3>
    <p v-if="product.description" class="line-clamp-3 text-xs leading-snug text-slate-500">
      {{ product.description }}
    </p>

    <p class="text-base font-semibold text-emerald-700 tabular-nums">
      {{ formatNumber(product.pricePoints) }} {{ pointsUnit }}
    </p>
    <p class="text-xs text-slate-500 tabular-nums">
      {{ inStockLabel }}: {{ product.available }} {{ piecesUnit }}
    </p>

    <div class="mt-auto flex items-center justify-between pt-1">
      <button
        type="button"
        :class="STEP_CLASSES"
        :disabled="quantity === 0"
        aria-label="−"
        @click="$emit('decrement')"
      >
        −
      </button>
      <span class="text-lg font-semibold tabular-nums">{{ quantity }}</span>
      <button
        type="button"
        :class="STEP_CLASSES"
        :disabled="quantity >= product.available"
        aria-label="+"
        @click="$emit('increment')"
      >
        +
      </button>
    </div>
  </article>
</template>
