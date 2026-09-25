<script setup lang="ts">
/**
 * Код выдачи с подписью над ним — у заказа и у награды.
 *
 * Крупный и в разрядку: водитель показывает экран или называет код вслух у стойки,
 * а сотрудник читает его с чужого телефона, часто на солнце. Подпись — 13/500, одна у заказа
 * и награды (шкала шрифтов, «Подпись над кодом выдачи»).
 *
 * Цвет подписи и кода — тон: `green` у заказа, `gold` у награды — всё про награды золотое
 * (`_reference/design/orders/reward-screen.html`, Руслан, 25-09-2026).
 *
 * `l` — экран заказа: код самое крупное на экране, по центру. `m` — карточка награды
 * в разделе: код меньше и по левому краю карточки, как всё остальное в ней.
 */
type CodeSize = 'l' | 'm';
type CodeTone = 'green' | 'gold';

withDefaults(
  defineProps<{
    title: string;
    code: string;
    size: CodeSize;
    tone?: CodeTone;
  }>(),
  { tone: 'green' },
);

const TONE_CLASSES: Record<CodeTone, string> = {
  green: 'text-xb-green',
  gold: 'text-xb-gold-light',
};

const WRAP_CLASSES: Record<CodeSize, string> = {
  l: 'items-center gap-2 text-center',
  m: 'items-start gap-[3px]',
};

const CODE_CLASSES: Record<CodeSize, string> = {
  l: 'text-[52px] leading-[1.05] tracking-[10px]',
  m: 'text-[34px] leading-[1.2] tracking-[6px]',
};
</script>

<template>
  <div class="flex flex-col" :class="WRAP_CLASSES[size]">
    <span class="text-[13px] font-medium" :class="TONE_CLASSES[tone]">{{ title }}</span>
    <span class="font-unbounded font-bold tabular-nums" :class="[TONE_CLASSES[tone], CODE_CLASSES[size]]">{{ code }}</span>
  </div>
</template>
