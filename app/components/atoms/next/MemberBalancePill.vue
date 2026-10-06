<script setup lang="ts">
/**
 * Баланс пилюлей: гранат, число и слово «баллов» — `_reference/design/home/catalog-bar.html`, `.bal`.
 *
 * Одна на все шапки Mini App с балансом: разделы, липкая шапка главной, экран акции. Слово рядом
 * с числом держит то же, что раньше подпись «Ваши баллы» над ним, — число не читается как цена
 * или сумма заказа, — и пилюля встаёт в один ряд с пилюлями обещаний на главной.
 *
 * Число и слово приходят готовыми строками. Число на главной набирается вместе с крупным,
 * и набор считает тот, кто владеет крупным числом; форма слова выбрана по итоговому балансу,
 * чтобы во время набора слово не менялось.
 *
 * Пилюля не сжимается и не переносится: место в шапке уступает имя — оно обрезается многоточием.
 */
defineProps<{
  amount: string;
  unit: string;
}>();
</script>

<template>
  <span
    class="box-border flex h-9 shrink-0 items-center rounded-full border border-white/16 bg-white/8 pl-[11px] pr-3.5 font-manrope"
  >
    <span class="flex items-center gap-1.5 whitespace-nowrap text-[14px] font-bold tabular-nums text-xb-text">
      <span class="flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="15" /></span>
      <span>{{ amount }}</span>
      <span class="-ml-0.5 font-normal text-xb-secondary">{{ unit }}</span>
    </span>
  </span>
</template>
