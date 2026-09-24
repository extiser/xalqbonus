<script setup lang="ts">
/**
 * Пилюля на фото товара — `_reference/design/catalog/catalog-showcase.html` (`.pill`).
 *
 * Белая, на светлой подложке фото. Остаток — «8 шт» приглушённым серым (`xb-muted`, на пробу
 * вместо серого из HOT, Руслан, 23-09-2026). Скидка — «SALE −60%» гранатом со значком процента,
 * у всех товаров со скидкой одним видом.
 *
 * На телефонах до 360 px пилюля мельче, а слово SALE уходит: рядом с остатком оно в одну строку
 * не влезает. Значок и процент остаются. Пилюля не переносится никогда.
 */
type PillKind = 'stock' | 'sale';

defineProps<{
  kind: PillKind;
  /** «8 шт», «−60%». */
  label: string;
  /** Слово перед скидкой: «SALE». На узких телефонах уходит. */
  word?: string;
}>();
</script>

<template>
  <span
    class="member-tile-pill inline-flex h-6 items-center gap-[3px] whitespace-nowrap rounded-full bg-white font-manrope text-[12px] leading-[normal] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
    :class="kind === 'sale' ? 'member-tile-pill-sale font-bold text-xb-garnet' : 'font-semibold text-xb-muted'"
  >
    <svg v-if="kind === 'sale'" viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true" class="shrink-0">
      <path
        d="M12 2.8l2.1 1.6 2.6-.2.9 2.5 2.3 1.2-.4 2.6 1.4 2.2-1.9 1.9.1 2.6-2.5.8-1.1 2.4-2.6-.4L12 21.2l-2.1-1.6-2.6.4-1.1-2.4-2.5-.8.1-2.6-1.9-1.9 1.4-2.2-.4-2.6 2.3-1.2.9-2.5 2.6.2z"
        fill="#E8365D"
      />
      <path d="M9.3 14.7l5.4-5.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="9.6" cy="9.6" r="1.2" fill="#fff" />
      <circle cx="14.4" cy="14.4" r="1.2" fill="#fff" />
    </svg>
    <span v-if="word" class="member-tile-pill-word">{{ word }}&nbsp;</span>{{ label }}
  </span>
</template>

<style scoped>
/* Поля: 9 по бокам, у скидки слева 6 — значок уже даёт воздух. До 360 px — 7 и кегль 11. */
.member-tile-pill {
  padding: 0 9px;
}

.member-tile-pill-sale {
  padding-left: 6px;
}

/* Граница включительно, как в макете: на 360 слово уже уходит. */
@media (max-width: 360px) {
  .member-tile-pill {
    padding-right: 7px;
    font-size: 11px;
  }

  .member-tile-pill:not(.member-tile-pill-sale) {
    padding-left: 7px;
  }

  .member-tile-pill-word {
    display: none;
  }
}
</style>
