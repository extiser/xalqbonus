<script setup lang="ts" generic="Key extends string">
/**
 * Переключатель из нескольких пунктов — `.seg` в `_reference/design/web/dashboard/01-money.html`
 * (issue #438), как «По темпу · Программа» на «Глубине»: подложка — поднятая поверхность,
 * скругление 999, поле 4, зазор 4; пункт — Manrope 13 / 600 цветом названия плитки, поле 6 × 12;
 * выбранный — фоном плитки, текст белым. Двух разных переключателей на дашборде быть не должно.
 *
 * Роли — `tablist` и `tab` с `aria-selected`, как в эталоне: переключатель меняет то, что
 * показано под ним. Своего состояния нет: выбранный приходит свойством, смена — событием.
 */
export type SegmentedOption<OptionKey extends string> = {
  key: OptionKey;
  label: string;
  /** Полное название для экранного диктора: «К сентябрю 2025». */
  ariaLabel?: string;
};

defineProps<{
  options: readonly SegmentedOption<Key>[];
  selected: Key;
}>();

const emit = defineEmits<{ select: [key: Key] }>();
</script>

<template>
  <div class="inline-flex shrink-0 gap-1 rounded-full bg-web-raised p-1" role="tablist">
    <button
      v-for="option in options"
      :key="option.key"
      type="button"
      role="tab"
      :aria-selected="option.key === selected"
      :aria-label="option.ariaLabel"
      class="cursor-pointer rounded-full border-0 px-3 py-1.5 font-manrope text-[13px] leading-[1.45] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
      :class="option.key === selected ? 'bg-web-tile text-web-text' : 'bg-transparent text-web-title hover:text-web-text'"
      @click="emit('select', option.key)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
