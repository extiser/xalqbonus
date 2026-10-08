<script setup lang="ts">
/**
 * Вердикт словами — `.verdict` в `_reference/design/web/dashboard/01-money.html` (issue #438):
 * пилюля Manrope 15 / 600 белым на подложке тона 10 %, слева кружок 22 тона со знаком цветом
 * страницы. Хороший — зелёный с галочкой, плохой — алый со стрелкой вниз.
 *
 * Что сказать и хорошо ли это, решает тот, кто ставит вердикт: атом только рисует.
 */
type VerdictTone = 'good' | 'bad';

defineProps<{
  text: string;
  tone: VerdictTone;
}>();

const PILL_CLASSES: Record<VerdictTone, string> = {
  good: 'bg-web-green/10',
  bad: 'bg-web-scarlet/10',
};

const MARK_CLASSES: Record<VerdictTone, string> = {
  good: 'bg-web-green',
  bad: 'bg-web-scarlet',
};
</script>

<template>
  <div
    class="inline-flex items-center gap-2.5 self-start rounded-full py-2 pr-4 pl-2.5 font-manrope text-[15px] font-semibold text-web-text"
    :class="PILL_CLASSES[tone]"
  >
    <i class="grid size-[22px] shrink-0 place-items-center rounded-full" :class="MARK_CLASSES[tone]" aria-hidden="true">
      <svg
        viewBox="0 0 12 12"
        fill="none"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-3 stroke-web-page"
      >
        <path v-if="tone === 'good'" d="M2.5 6.2l2.3 2.3 4.7-5" />
        <path v-else d="M6 2.5v7M3 6.5l3 3 3-3" />
      </svg>
    </i>
    {{ text }}
  </div>
</template>
