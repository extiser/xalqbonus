<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import type { LandingOption } from '#shared/types/landings';

/**
 * Выбор лендинга метки (issue #478) — `.sel` и `.sel-list` в `_reference/design/web/promo/02-new-landing.html`:
 * поле 48 со скруглением 14, список под полем поверх следующих полей на поднятой поверхности.
 * Первым — «Экран заявки» с пометкой «по умолчанию» (`null`), дальше — лендинги, которые можно
 * выбрать; выбранный — с галочкой.
 *
 * Список закрывается выбором, Escape и щелчком мимо. Стрелки ходят по пунктам. Запросов
 * нет: лендинги приносит страница.
 */
const props = defineProps<{
  options: readonly LandingOption[];
  error?: string | null;
  /** Id текста ошибки — для `aria-describedby`. */
  describedBy?: string;
  labelledBy: string;
}>();

/** Id лендинга; `null` — экран заявки по умолчанию. */
const value = defineModel<string | null>({ required: true });

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const listId = useId();

type Choice = { id: string | null; name: string };

const choices = computed((): Choice[] => [{ id: null, name: 'Экран заявки' }, ...props.options]);

const selectedName = computed(() => choices.value.find((choice) => choice.id === value.value)?.name ?? 'Экран заявки');

const optionButtons = (): HTMLButtonElement[] =>
  root.value ? [...root.value.querySelectorAll<HTMLButtonElement>('[role="option"]')] : [];

const toggle = async (): Promise<void> => {
  open.value = !open.value;

  if (!open.value) return;

  await nextTick();

  const index = choices.value.findIndex((choice) => choice.id === value.value);

  optionButtons()[Math.max(0, index)]?.focus();
};

const choose = (choice: Choice): void => {
  value.value = choice.id;
  open.value = false;
  trigger.value?.focus();
};

const onListKey = (event: KeyboardEvent): void => {
  const buttons = optionButtons();
  const index = buttons.findIndex((button) => button === document.activeElement);

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    trigger.value?.focus();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    buttons[Math.min(buttons.length - 1, index + 1)]?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    buttons[Math.max(0, index - 1)]?.focus();
  }
};

const onOutside = (event: MouseEvent): void => {
  if (open.value && root.value && event.target instanceof Node && !root.value.contains(event.target)) {
    open.value = false;
  }
};

onMounted(() => document.addEventListener('mousedown', onOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutside));

defineExpose({ focus: () => trigger.value?.focus() });
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-labelledby="labelledBy"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] border-0 bg-web-raised px-4 text-left font-manrope text-[15px] font-medium text-web-text outline-none"
      :class="
        error
          ? 'inset-ring-[1.5px] inset-ring-web-scarlet'
          : open
            ? 'inset-ring-[1.5px] inset-ring-web-cyan/60'
            : 'inset-ring inset-ring-web-line focus-visible:inset-ring-[1.5px] focus-visible:inset-ring-web-cyan/60'
      "
      @click="toggle"
    >
      <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ selectedName }}</span>
      <PhCaretDown weight="bold" aria-hidden="true" class="size-[18px] shrink-0 text-web-grey" />
    </button>
    <ul
      v-show="open"
      :id="listId"
      role="listbox"
      :aria-labelledby="labelledBy"
      class="absolute inset-x-0 top-[calc(100%+6px)] z-[5] m-0 max-h-[280px] list-none overflow-y-auto rounded-[14px] bg-web-raised p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] inset-ring inset-ring-web-line"
      @keydown="onListKey"
    >
      <li v-for="choice in choices" :key="choice.id ?? 'default'">
        <button
          type="button"
          role="option"
          :aria-selected="choice.id === value"
          class="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border-0 px-3 py-2 text-left font-manrope text-[15px] font-medium text-web-text hover:bg-web-tile focus-visible:bg-web-tile focus-visible:outline-none"
          :class="choice.id === value ? 'bg-web-tile' : 'bg-transparent'"
          @click="choose(choice)"
        >
          <span class="min-w-0 break-words">{{ choice.name }}</span>
          <span
            v-if="choice.id === null"
            class="ml-auto shrink-0 rounded-full bg-web-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-web-cyan"
          >по умолчанию</span>
          <svg
            v-if="choice.id === value"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            class="size-3.5 shrink-0 text-web-cyan"
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>
      </li>
    </ul>
  </div>
</template>
