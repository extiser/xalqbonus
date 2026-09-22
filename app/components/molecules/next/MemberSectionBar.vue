<script setup lang="ts">
/**
 * Шапка раздела — одна на все внутренние экраны водителя (`product/design/artboard/section-bar`).
 *
 * Три места в строке: назад — заголовок — действие. Место справа занято всегда, даже когда
 * действия нет: иначе заголовок при переходе между разделами сдвигался бы вбок, и переход
 * читался бы как смена экрана целиком.
 *
 * Заголовок переносится, а не режется: узбекский длиннее русского примерно на четверть,
 * и обрезанное название раздела нечитаемо. Шапка растёт, содержимое съезжает вниз.
 *
 * Липкая, с размытием 14 px и тонкой границей: списки разделов длинные, выход назад
 * не должен требовать прокрутки вверх, а под шапкой видно, что список продолжается.
 * Верхний отступ — от `safe-area-inset-top`: Telegram открывает Mini App под своей панелью.
 *
 * Действие справа приходит слотом — значком внутри того же круга, что у «назад»;
 * нажатие отдаётся событием `action`.
 */
defineProps<{
  title: string;
  /** Подпись кнопки «назад» для экранного чтеца: на экране у неё только стрелка. */
  backLabel: string;
  /** Подпись действия справа. Без слота `action` не читается. */
  actionLabel?: string;
}>();

defineEmits<{ back: []; action: [] }>();
</script>

<template>
  <header
    class="sticky top-0 z-[5] flex items-center gap-3 border-b border-white/6 bg-[rgba(11,13,17,0.82)] px-4 pb-3.5 pt-[calc(14px+env(safe-area-inset-top))] backdrop-blur-[14px]"
  >
    <AtomsNextMemberIconButton :label="backLabel" size="m" @click="$emit('back')">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M14.5 5.5L8 12l6.5 6.5" stroke="#E4E8EE" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </AtomsNextMemberIconButton>

    <h1 class="m-0 min-w-0 grow font-unbounded text-[19px] font-semibold leading-[1.25] tracking-[-0.5px] text-xb-text">
      {{ title }}
    </h1>

    <AtomsNextMemberIconButton v-if="$slots.action" :label="actionLabel ?? ''" size="m" @click="$emit('action')">
      <slot name="action" />
    </AtomsNextMemberIconButton>
    <span v-else class="size-10 shrink-0" aria-hidden="true" />
  </header>
</template>
