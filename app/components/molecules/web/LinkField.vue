<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PhArrowsClockwise, PhCheck, PhCopy } from '@phosphor-icons/vue';

/**
 * Ссылка только для чтения со значками действий внутри справа — поле «Ссылка» окна новой метки
 * и `.linkline` карточки метки (`_reference/design/web/promo/02-new.html`, `03-card.html`).
 *
 * Код метки в конце ссылки подсвечен циан. Длинная ссылка обрезается слева — начало ссылки
 * одинаково у всех меток, а код должен быть виден всегда.
 *
 * «Скопировать ссылку» кладёт её в буфер, и значок на 1,5 с сменяется галочкой. «Другой код»
 * (`refreshable`) — событием наверх: код выдаёт сервер, а не поле. У значков подписи
 * при наведении (`codex.md`, «Формы — решено»).
 */
const props = defineProps<{
  /** Ссылка целиком. Пусто — ещё не пришла. */
  link: string | null;
  /** Код в конце ссылки — его поле подсвечивает. */
  code: string | null;
  /** Значок «Другой код». */
  refreshable?: boolean;
  /** `form` — высота 48, как у текстовых полей формы; `tile` — 44, в плитке карточки. */
  size: 'form' | 'tile';
  error?: string | null;
  describedBy?: string;
}>();

defineEmits<{ refresh: [] }>();

/** Сколько держится галочка после копирования. */
const COPIED_MS = 1_500;

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const parts = computed(() => {
  const link = props.link ?? '';
  const code = props.code ?? '';

  return code !== '' && link.endsWith(code)
    ? { head: link.slice(0, link.length - code.length), code }
    : { head: link, code: '' };
});

const copy = async (): Promise<void> => {
  if (!props.link) return;

  await navigator.clipboard.writeText(props.link);
  copied.value = true;

  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
  }, COPIED_MS);
};

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});

const BUTTON_CLASSES =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-web-grey hover:bg-web-tile hover:text-web-cyan focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web-cyan disabled:cursor-default disabled:opacity-50';
</script>

<template>
  <div
    class="flex items-center gap-1 bg-web-cyan/4 pr-1.5 pl-4 font-mono font-medium text-web-title"
    :class="[
      size === 'form' ? 'h-12 rounded-[14px] text-[14px]' : 'h-11 rounded-[12px] text-[13px]',
      error ? 'inset-ring-[1.5px] inset-ring-web-scarlet' : 'inset-ring inset-ring-web-line',
    ]"
    :aria-invalid="error ? 'true' : undefined"
    :aria-describedby="describedBy"
  >
    <!-- Справа налево — обрезается начало ссылки; `bdi` держит саму ссылку слева направо. -->
    <span class="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap [direction:rtl]">
      <bdi>{{ parts.head }}<b class="font-semibold text-web-cyan">{{ parts.code }}</b></bdi>
    </span>
    <button
      v-if="refreshable"
      type="button"
      title="Другой код"
      aria-label="Другой код"
      :class="BUTTON_CLASSES"
      @click="$emit('refresh')"
    >
      <PhArrowsClockwise weight="duotone" aria-hidden="true" class="size-5" />
    </button>
    <button
      type="button"
      :title="copied ? 'Скопировано' : 'Скопировать ссылку'"
      :aria-label="copied ? 'Скопировано' : 'Скопировать ссылку'"
      :disabled="!link"
      :class="BUTTON_CLASSES"
      @click="copy"
    >
      <PhCheck v-if="copied" weight="bold" aria-hidden="true" class="size-5 text-web-cyan" />
      <PhCopy v-else weight="duotone" aria-hidden="true" class="size-5" />
    </button>
  </div>
</template>
