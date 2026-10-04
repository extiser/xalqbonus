<script setup lang="ts">
import { resolveComponent } from 'vue';

/**
 * Плитка веба — `.tile` кодекса `_reference/design/web/codex.html`: фон плитки без контура,
 * скругление 32, поле 28. Сверху — название и справа круглая кнопка-вход, если плитка ведёт
 * глубже; под ними — содержимое слотом.
 *
 * Размер — смысловое свойство, как `size` у кнопки: 3, 4, 6, 8 или 12 колонок сетки на 1–3 ряда,
 * других нет (кодекс, «Сетка»). Когда размеров мало, экран собирается из готовых кусков
 * и не разъезжается. Ставится плитка только в `MoleculesWebBento`.
 *
 * На телефоне, ниже 900, размер не действует: одна колонка, высота по содержимому от 120,
 * поле 24 (кодекс, «Телефон»).
 *
 * Плитка с `to` нажимается целиком — так в кодексе: «кнопка-вход — круг 40 на поднятом цвете,
 * вся плитка нажимается». Круг тогда только знак, что плитка ведёт дальше, и других действий
 * внутри такой плитки нет: ссылка в ссылке — ошибка разметки. Без `to` справа в шапке стоит
 * слот `aside` — бейдж «цифры условные» или кнопка действия.
 *
 * Содержимое раскладывает тот, кто собирает плитку: сама она колонка с `min-width: 0`
 * и не знает, что в ней — число, разбор или график.
 */
type TileCols = 3 | 4 | 6 | 8 | 12;
type TileRows = 1 | 2 | 3;

defineProps<{
  cols: TileCols;
  rows: TileRows;
  title: string;
  /** Золотая точка программы перед названием — «Цена программы». */
  marker?: 'program';
  /** Куда ведёт плитка: появляется кнопка-вход, и нажимается вся плитка. */
  to?: string;
}>();

const NuxtLink = resolveComponent('NuxtLink');

const COLS_CLASSES: Record<TileCols, string> = {
  3: 'col-span-3',
  4: 'col-span-4',
  6: 'col-span-6',
  8: 'col-span-8',
  12: 'col-span-12',
};

const ROWS_CLASSES: Record<TileRows, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
};
</script>

<template>
  <component
    :is="to ? NuxtLink : 'section'"
    :to="to"
    class="relative flex min-w-0 flex-col overflow-hidden rounded-web-tile bg-web-tile p-web-pad text-web-text no-underline max-web:col-auto max-web:row-auto max-web:min-h-[120px] max-web:p-6"
    :class="[
      COLS_CLASSES[cols],
      ROWS_CLASSES[rows],
      to ? 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan' : '',
    ]"
  >
    <div class="flex items-center justify-between gap-3">
      <AtomsWebTileTitle :label="title" :marker="marker" />
      <span v-if="to" class="grid size-10 shrink-0 place-items-center rounded-full bg-web-raised" aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-4 stroke-web-text"
        >
          <path d="M6 3l5 5-5 5" />
        </svg>
      </span>
      <slot v-else name="aside" />
    </div>
    <slot />
  </component>
</template>
