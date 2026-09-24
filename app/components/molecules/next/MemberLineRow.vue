<script setup lang="ts">
/**
 * Строка состава — `_reference/design/orders/order-screen.html` (`.rb`): миниатюра, название,
 * подпись под ним, справа цена с гранатом. Одна на состав заказа и награду на её экране.
 *
 * Вид строки корзины из подтверждения заказа, только без счётчика: заказ оформлен, количество
 * не меняется (Руслан, 23-09-2026). Количество и цена за штуку — второй строкой под названием:
 * на узком экране они иначе ломают название.
 *
 * Фото товара приходит на белом и кладётся умножением на светлую подложку — как на плитке
 * каталога. У произвольной награды фото нет: вместо миниатюры значок подарка
 * (`reward-screen-custom.html`), цены нет тоже.
 *
 * Зачёркнутая цена — у награды-товара: цена из каталога мелко сверху, под ней «0» — сколько
 * стоил бы подарок в баллах (`reward-screen.html`, Руслан, 24-09-2026).
 */
defineProps<{
  title: string;
  /** «2 шт. · 150 баллов за штуку», «1 шт.». */
  caption: string;
  /** Фото товара. */
  image?: string;
  /** Цена строки числом: «300». */
  price?: string;
  /** Цена из каталога, зачёркнутая над ценой: «1 500». */
  oldPrice?: string;
  /** Значок вместо миниатюры. */
  icon?: 'gift';
}>();
</script>

<template>
  <div class="flex items-start gap-3 border-t border-white/6 py-3 leading-[normal]">
    <span
      v-if="icon === 'gift'"
      class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/6"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <rect x="4" y="10" width="16" height="10" rx="2" stroke="#8A93A2" stroke-width="1.7" />
        <path d="M3 8h18v2H3z" stroke="#8A93A2" stroke-width="1.7" stroke-linejoin="round" />
        <path d="M12 8v12" stroke="#8A93A2" stroke-width="1.7" />
        <path d="M12 8c-2-3.5-5.5-3-5-1s3 1 5 1c2 0 4.5 1 5-1s-3-2.5-5 1z" stroke="#8A93A2" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
    </span>
    <span v-else class="relative size-11 shrink-0 overflow-hidden rounded-xl bg-xb-photo">
      <img v-if="image" :src="image" alt="" class="absolute inset-1 size-9 object-contain mix-blend-multiply" />
    </span>

    <span class="min-w-0 grow">
      <span class="block text-[15px] font-normal leading-[1.3] text-xb-text">{{ title }}</span>
      <span class="mt-[3px] block text-[13px] font-light text-xb-grey">{{ caption }}</span>
    </span>

    <span
      v-if="price && oldPrice"
      class="flex shrink-0 flex-col items-end gap-px text-[15px] font-semibold tabular-nums text-xb-secondary"
    >
      <s class="text-[12px] font-medium text-xb-grey">{{ oldPrice }}</s>
      <span class="inline-flex items-center gap-1">
        <span class="relative top-px flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="13" /></span>
        {{ price }}
      </span>
    </span>
    <span
      v-else-if="price"
      class="flex shrink-0 items-center gap-1 pt-px text-[15px] font-semibold tabular-nums text-xb-secondary"
    >
      <span class="relative top-px flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="13" /></span>
      {{ price }}
    </span>
  </div>
</template>
