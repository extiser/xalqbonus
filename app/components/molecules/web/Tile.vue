<script setup lang="ts">
import { resolveComponent } from 'vue';
import type { MetricKey, MetricValues } from '#shared/metrics';

/**
 * Плитка веба — `.tile` кодекса `_reference/design/web/codex.html`: фон плитки без контура,
 * скругление 32, поле 28. Сверху — название и справа круглая кнопка-вход, если плитка ведёт
 * глубже; под ними — содержимое слотом.
 *
 * Размер — смысловое свойство, как `size` у кнопки: 3, 4, 6, 8 или 12 колонок сетки на 1–3 ряда,
 * других нет (кодекс, «Сетка»). Когда размеров мало, экран собирается из готовых кусков
 * и не разъезжается. Ставится плитка только в `MoleculesWebBento`. Исключение — 4 ряда
 * у таблицы на всю ширину: список меток «Промо» (issue #380).
 *
 * На телефоне, ниже 900, размер не действует: одна колонка, высота по содержимому от 120,
 * поле 24 (кодекс, «Телефон»).
 *
 * Плитка с `to` нажимается целиком — так в кодексе: «кнопка-вход — круг 40 на поднятом цвете,
 * вся плитка нажимается». Круг тогда только знак, что плитка ведёт дальше, и других действий
 * внутри такой плитки нет: ссылка в ссылке — ошибка разметки. Без `to` справа в шапке стоит
 * слот `aside` — бейдж «цифры условные», кнопка действия или переключатель; на телефоне шапка
 * с ним переносится, и он уходит под название (`01-money.html`, issue #438).
 *
 * Растёт плитка только с `grow` — таблица, у которой число строк заранее неизвестно (issue #380):
 * её содержимое растит ряд сетки (`MoleculesWebBento`), и соседи по ряду растут вместе с ней.
 * Остальные плитки ряд не двигают (`contain: size`) и, как раньше, обрезают то, что
 * не поместилось: иначе плитка дашборда, у которой на узком ноутбуке текст выходит за край,
 * молча вытянула бы ряд и сдвинула экран. На телефоне высота у всех по содержимому.
 *
 * Содержимое раскладывает тот, кто собирает плитку: сама она колонка с `min-width: 0`
 * и не знает, что в ней — число, разбор или график.
 */
type TileCols = 3 | 4 | 6 | 8 | 12;
type TileRows = 1 | 2 | 3 | 4;

defineProps<{
  cols: TileCols;
  rows: TileRows;
  title: string;
  /** Золотая точка программы перед названием — «Цена программы». */
  marker?: 'program';
  /** Ключ метрики: после названия встаёт значок подсказки (`AtomsWebTileTitle`). */
  metric?: MetricKey;
  /** Значения подстановок в тексте подсказки — пороги, которые приносит ручка. */
  metricValues?: MetricValues;
  /** Куда ведёт плитка: появляется кнопка-вход, и нажимается вся плитка. */
  to?: string;
  /** Плитка растит ряд по содержимому, а не обрезает его: таблица с неизвестным числом строк. */
  grow?: boolean;
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
  4: 'row-span-4',
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
      grow ? '' : 'web:[contain:size]',
    ]"
  >
    <div class="flex items-center justify-between gap-3" :class="!to && $slots.aside ? 'max-web:flex-wrap' : ''">
      <AtomsWebTileTitle :label="title" :marker="marker" :metric="metric" :metric-values="metricValues" />
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
