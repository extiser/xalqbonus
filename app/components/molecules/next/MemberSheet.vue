<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';

/**
 * Шторка водительского Mini App — по эталону `product/design/comeback/04-day-chests-sheet.html`.
 *
 * Выезжает снизу, под ней затемнение. Полоски-ручки и свайпа нет: у Mini App своё
 * сворачивание жестом, и второе на шторке спорило бы с ним. Нажатие на затемнение шторку
 * не закрывает — закрывают только кнопки внизу, там, где палец уже лежит.
 *
 * Шторка стоит в разметке всегда и только уезжает вниз: иначе выезд нечем было бы
 * проиграть. Закрытая выключена из фокуса и чтения (`inert`).
 *
 * `close` отдаётся на Escape — единственное закрытие, которое шторка знает сама; кнопки
 * приходят слотом и закрывают её через родителя.
 */
const props = defineProps<{
  open: boolean;
  title: string;
  /** Подпись под заголовком. Несколько абзацев — массивом, каждый своей строкой. */
  subtitle?: string | readonly string[];
  /**
   * Подпись схлопывается — когда над наградой правило больше ничего не добавляет.
   * Схлопывается плавно, теми же 0.9 с, что сундук разгоняется: иначе шторку гнало бы
   * то вверх, то вниз.
   */
  subtitleHidden?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

const subtitleLines = computed((): readonly string[] => {
  if (props.subtitle === undefined) {
    return [];
  }

  return typeof props.subtitle === 'string' ? [props.subtitle] : props.subtitle;
});
</script>

<template>
  <div
    class="member-sheet-backdrop fixed inset-0 z-30 bg-black/62 transition-opacity duration-[280ms] ease-out"
    :class="open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
    aria-hidden="true"
  />
  <section
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :inert="!open"
    class="member-sheet fixed bottom-0 left-1/2 z-[31] box-border w-full max-w-[520px] rounded-t-[26px] bg-xb-sheet px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-8 font-manrope text-xb-text shadow-[0_-18px_50px_-20px_rgba(0,0,0,0.9)]"
    :class="open ? 'member-sheet-open' : ''"
  >
    <div class="text-center">
      <div class="mb-2.5 text-[24px] font-extrabold tracking-[-0.2px]">{{ title }}</div>
      <div class="member-sheet-subtitle" :class="subtitleHidden ? 'member-sheet-subtitle-hidden' : ''">
        <div class="min-h-0 overflow-hidden">
          <p
            v-for="line in subtitleLines"
            :key="line"
            class="m-0 mt-1 text-[13px] font-light leading-[1.65] text-xb-light"
          >
            {{ line }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="$slots.default" class="mt-[22px]">
      <slot />
    </div>

    <div v-if="$slots.buttons" class="mt-6 flex flex-col gap-2.5">
      <slot name="buttons" />
    </div>
  </section>
</template>

<style scoped>
/* Выезд — `transform`, а не `top`: анимация идёт на композиторе и не дёргает раскладку. */
.member-sheet {
  transform: translate(-50%, 100%);
  transition: transform 0.34s cubic-bezier(0.22, 0.7, 0.3, 1);
}

.member-sheet-open {
  transform: translate(-50%, 0);
}

.member-sheet-subtitle {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition:
    grid-template-rows 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97),
    opacity 0.9s ease;
}

.member-sheet-subtitle-hidden {
  grid-template-rows: 0fr;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .member-sheet-subtitle,
  .member-sheet,
  .member-sheet-backdrop {
    transition: none;
  }
}
</style>
