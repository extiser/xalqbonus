<script setup lang="ts">
import { formatNumber } from '~/utils/format';
import type { ProductListResponse } from '#shared/types/catalog';
import type { LoadState } from '~/types/loadState';

/**
 * Каталог товаров: фото, название, цена в баллах и обе цены в сумах, признак архива.
 *
 * Закупочная цена показана здесь же, и это вторая причина, по которой раздел открыт
 * владельцу и админу: три цены рядом — материал отчёта парку о стоимости балла
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 */
defineProps<{
  state: LoadState;
  data: ProductListResponse | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Товары"
    note="Товар не удаляется, а уходит в архив: на него ссылаются позиции заказов, и позиция обязана помнить, что именно было заказано."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем каталог…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Каталог не прочитался. Это отказ запроса, а не отсутствие товаров."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.products.length === 0"
      state="empty"
      message="Товаров ещё не заводили."
    />
    <ul v-else>
      <li
        v-for="product in data.products"
        :key="product.productId"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
      >
        <MoleculesProductPhoto
          :photo-path="product.photoPath"
          :updated-at="product.updatedAt"
          :name="product.name"
        />
        <div class="min-w-40 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <NuxtLink
              :to="`/products/${product.productId}`"
              class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
            >
              {{ product.name }}
            </NuxtLink>
            <AtomsStatusBadge v-if="product.archivedAt" tone="muted" label="В архиве" />
          </div>
          <p v-if="product.description" class="mt-0.5 text-xs text-slate-500">
            {{ product.description }}
          </p>
        </div>
        <div class="w-28 text-right">
          <p class="text-xs text-slate-500">баллов</p>
          <p class="text-sm font-semibold text-slate-900">
            {{ formatNumber(product.pricePoints) }}
          </p>
        </div>
        <div class="w-44 text-right">
          <p class="text-xs text-slate-500">розница · закупка, сум</p>
          <p class="text-sm text-slate-700">
            {{ formatNumber(product.priceRetail) }} · {{ formatNumber(product.priceCost) }}
          </p>
        </div>
      </li>
    </ul>
  </MoleculesSectionPanel>
</template>
