<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PhCheck, PhCopy } from '@phosphor-icons/vue';

/**
 * Кнопка-значок «скопировать» в строке — карточка заявки (issue #471, `02-card.html`): 28,
 * скругление 10 (кодекс, «Скругление внутри плитки»), серый значок, при наведении — циан
 * на поднятой.
 *
 * Подпись при наведении — своя у каждой кнопки (`label`: «Скопировать номер»); после нажатия
 * на 1,5 с — «Скопировано», и значок сменяется галочкой. `aria-label` тот же, что подпись:
 * у значка нет текста.
 */
const props = defineProps<{
  /** Что положить в буфер. */
  value: string;
  label: string;
}>();

/** Сколько держится «Скопировано». */
const COPIED_MS = 1_500;

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const tooltip = computed(() => (copied.value ? 'Скопировано' : props.label));

const copy = async (): Promise<void> => {
  await navigator.clipboard.writeText(props.value);
  copied.value = true;

  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
  }, COPIED_MS);
};

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template>
  <MoleculesWebTooltip :text="tooltip">
    <button
      type="button"
      :aria-label="tooltip"
      class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-web-grey hover:bg-web-raised hover:text-web-cyan focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web-cyan"
      @click="copy"
    >
      <PhCheck v-if="copied" weight="bold" aria-hidden="true" class="size-4 text-web-cyan" />
      <PhCopy v-else weight="duotone" aria-hidden="true" class="size-4" />
    </button>
  </MoleculesWebTooltip>
</template>
