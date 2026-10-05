<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { PhArrowRight, PhCaretDown } from '@phosphor-icons/vue';
import { formatMonthTitle, monthForms, shiftMonth } from '#shared/monthNames';
import { DISPLAY_TIME_ZONE } from '~/utils/format';

/**
 * Выбор месяца дашборда — `.period` в `_reference/design/web/dashboard/02-levers.html`:
 * «Октябрь 2026» и стрелки назад и вперёд по кругу 34. На краю диапазона стрелка погашена.
 *
 * Название месяца — кнопка списка месяцев (issue #395, `dashboard/month-picker-list.html`):
 * окно под пилюлей по её правому краю, новые месяцы сверху, по годам. Закрывается выбором,
 * повторным нажатием, щелчком мимо и Escape. Слева от пилюли, когда выбран не последний
 * месяц, — ссылка к нему (`dashboard/month-picker-today.html`): последний доступный и есть
 * идущий, а первого числа — прошлый.
 *
 * Месяцы — `YYYY-MM`. Где живёт выбранный — решает страница: компонент только отдаёт
 * месяц событием.
 */
const props = defineProps<{
  month: string;
  firstMonth: string;
  lastMonth: string;
}>();

const emit = defineEmits<{ change: [month: string] }>();

type MonthGroup = { year: string; months: string[] };

const listId = useId();

const title = computed(() => formatMonthTitle(props.month));
const canGoBack = computed(() => props.month > props.firstMonth);
const canGoForward = computed(() => props.month < props.lastMonth);

/** «К октябрю 2026» — подпись ссылки к последнему месяцу. */
const lastMonthLabel = computed(() => `К ${monthForms(props.lastMonth).dative} ${props.lastMonth.slice(0, 4)}`);

/** «Данные — с октября 2025» — подпись под списком. */
const firstMonthLabel = computed(() => `Данные — с ${monthForms(props.firstMonth).genitive} ${props.firstMonth.slice(0, 4)}`);

/** «Октябрь» — месяц строки списка: год стоит подзаголовком над ним. */
const monthName = (month: string): string => {
  const { nominative } = monthForms(month);

  return `${nominative.charAt(0).toUpperCase()}${nominative.slice(1)}`;
};

/** Месяцы от последнего к первому, по годам. */
const groups = computed((): MonthGroup[] => {
  const result: MonthGroup[] = [];

  for (let month = props.lastMonth; month >= props.firstMonth; month = shiftMonth(month, -1)) {
    const year = month.slice(0, 4);
    const group = result.at(-1);

    if (group?.year === year) group.months.push(month);
    else result.push({ year, months: [month] });
  }

  return result;
});

const MONTH_OF_ZONE = new Intl.DateTimeFormat('en-GB', { timeZone: DISPLAY_TIME_ZONE, year: 'numeric', month: '2-digit' });

/** Месяц, который сейчас идёт по Ташкенту, — `YYYY-MM`. */
const zoneMonthOf = (moment: Date): string => {
  const parts = MONTH_OF_ZONE.formatToParts(moment);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}`;
};

const open = ref(false);
// Считается при открытии: список рисуется только в браузере, и сервер с ним не расходится.
const runningMonth = ref('');
const area = ref<HTMLElement | null>(null);
const toggleButton = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLElement | null>(null);

/** Прокрутка окна так, чтобы выбранный месяц был виден. */
const revealSelected = (): void => {
  const selected = list.value?.querySelector<HTMLElement>('[aria-current="true"]');

  if (!list.value || !selected) return;

  const top = selected.offsetTop;
  const bottom = top + selected.offsetHeight;

  if (top < list.value.scrollTop) list.value.scrollTop = top;
  else if (bottom > list.value.scrollTop + list.value.clientHeight) list.value.scrollTop = bottom - list.value.clientHeight;
};

const toggle = async (): Promise<void> => {
  open.value = !open.value;

  if (!open.value) return;

  runningMonth.value = zoneMonthOf(new Date());
  await nextTick();
  revealSelected();
};

const choose = (month: string): void => {
  open.value = false;

  if (month !== props.month) emit('change', month);
};

const closeOnOutsideClick = (event: MouseEvent): void => {
  if (!open.value || !(event.target instanceof Node)) return;
  if (area.value?.contains(event.target)) return;
  open.value = false;
};

const closeOnEscape = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !open.value) return;
  open.value = false;
  toggleButton.value?.focus();
};

onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick);
  document.addEventListener('keydown', closeOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick);
  document.removeEventListener('keydown', closeOnEscape);
});

const ARROW_CLASSES =
  'grid size-[34px] cursor-pointer place-items-center rounded-full border-0 bg-web-raised p-0 disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-web-cyan';
const TEXT_BUTTON_CLASSES =
  'flex cursor-pointer items-center rounded-full border-0 bg-transparent px-1 py-2 font-manrope text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-web-cyan';
const ITEM_CLASSES =
  'flex w-full cursor-pointer items-center justify-between rounded-xl border-0 px-3 py-2.5 text-left font-manrope text-[14px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web-cyan';
</script>

<template>
  <!-- Не помещаются в строку — ссылка к последнему месяцу уходит строкой выше пилюли. -->
  <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
    <button
      v-if="month !== lastMonth"
      type="button"
      :class="TEXT_BUTTON_CLASSES"
      class="gap-1.5 text-web-title hover:text-web-cyan"
      @click="emit('change', lastMonth)"
    >
      {{ lastMonthLabel }}
      <PhArrowRight weight="bold" aria-hidden="true" class="size-3.5" />
    </button>

    <div
      ref="area"
      class="relative flex items-center gap-2.5 rounded-full bg-web-tile py-1.5 pr-1.5 pl-[18px] font-manrope text-[14px] font-semibold text-web-text"
    >
      <button
        ref="toggleButton"
        type="button"
        :class="TEXT_BUTTON_CLASSES"
        class="gap-1.5 text-web-text"
        :aria-expanded="open"
        :aria-controls="listId"
        @click="toggle"
      >
        <span aria-live="polite">{{ title }}</span>
        <PhCaretDown weight="bold" aria-hidden="true" class="size-3.5 text-web-title" />
      </button>
      <button
        type="button"
        :class="ARROW_CLASSES"
        aria-label="Прошлый месяц"
        :disabled="!canGoBack"
        @click="emit('change', shiftMonth(month, -1))"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 stroke-web-text" aria-hidden="true">
          <path d="M10 3L5 8l5 5" />
        </svg>
      </button>
      <button
        type="button"
        :class="ARROW_CLASSES"
        aria-label="Следующий месяц"
        :disabled="!canGoForward"
        @click="emit('change', shiftMonth(month, 1))"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 stroke-web-text" aria-hidden="true">
          <path d="M6 3l5 5-5 5" />
        </svg>
      </button>

      <div
        v-if="open"
        :id="listId"
        ref="list"
        role="group"
        aria-label="Выбор месяца"
        class="absolute top-[calc(100%+10px)] right-0 z-30 max-h-[420px] w-60 overflow-y-auto rounded-[22px] bg-web-raised p-2 shadow-[0_16px_40px_rgba(0,0,0,0.5)] inset-ring inset-ring-web-line"
      >
        <template v-for="group in groups" :key="group.year">
          <div class="px-3 pt-2.5 pb-1 font-manrope text-[11px] font-semibold tracking-[0.04em] text-web-grey">{{ group.year }}</div>
          <button
            v-for="item in group.months"
            :key="item"
            type="button"
            :class="[
              ITEM_CLASSES,
              item === month
                ? 'bg-web-cyan/12 text-web-cyan inset-ring inset-ring-web-cyan/45'
                : 'bg-transparent text-web-text hover:bg-web-tile',
            ]"
            :aria-current="item === month ? 'true' : undefined"
            @click="choose(item)"
          >
            {{ monthName(item) }}
            <span
              v-if="item === runningMonth"
              class="text-[11px] font-semibold"
              :class="item === month ? 'text-web-cyan/80' : 'text-web-title'"
            >идёт</span>
          </button>
        </template>
        <div class="mt-3 border-t border-web-line pt-2.5 text-center font-manrope text-[12px] font-light text-web-grey">
          {{ firstMonthLabel }}
        </div>
      </div>
    </div>
  </div>
</template>
