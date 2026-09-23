<script setup lang="ts">
/**
 * Строка состояния карточки: цветное слово и серое уточнение после точки —
 * «**Ждёт выдачи** · заберите до 23.09, 14:32».
 *
 * Сборка по «Правилу цвета в строке» (`product/design/README.md`): цветом отмечено только
 * состояние, всё после точки серое. Тем же цветом уточнение тянуло бы на себя вторым акцентом
 * внутри одной строки. Слово 13/600, хвост 13/300 — шкала шрифтов, роли «Состояние цветным
 * словом» и «Уточнение серым».
 *
 * Строке разрешено переноситься: на 320 px три части в одну не влезают, и последняя
 * уходит вниз — поэтому порядок частей в `hint` важен, наименее срочное в конце.
 */
type StateTone = 'green' | 'scarlet' | 'gold' | 'quiet';

defineProps<{
  tone: StateTone;
  state: string;
  hint?: string;
}>();

/**
 * Зелёный — «сходи и забери», алый — отмена, золото — подарок на главной,
 * спокойный — закрытое, от водителя ничего не требующее.
 */
const TONE_CLASSES: Record<StateTone, string> = {
  green: 'text-xb-green',
  scarlet: 'text-xb-scarlet',
  gold: 'text-xb-gold-light',
  quiet: 'text-xb-light',
};
</script>

<template>
  <span class="block text-[13px]">
    <span class="font-semibold" :class="TONE_CLASSES[tone]">{{ state }}</span>
    <span v-if="hint" class="font-light text-xb-grey"> · {{ hint }}</span>
  </span>
</template>
