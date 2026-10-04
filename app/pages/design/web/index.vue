<script setup lang="ts">
import { useDesignFonts } from '~/design/fonts';

/**
 * Основа веба в стиле бенто на одном листе: сетка, роли шрифтов и плитки дашборда — для сверки
 * глазами с кодексом `_reference/design/web/codex.html` и экраном `dashboard/01-money.html`.
 *
 * Только для разработки, как всё под `/design`: в сборке страницы нет, адрес отвечает 404.
 * Раскладки нет, данных нет — цифры с макета, условные.
 */
if (!import.meta.dev) throw createError({ statusCode: 404 });

definePageMeta({ layout: false });

useDesignFonts();
useHead({ title: 'Основа веба — бенто' });

type TileCols = 3 | 4 | 6 | 8 | 12;
type TileRows = 1 | 2 | 3;

/**
 * Все размеры плитки, сложенные так, чтобы сетка закрывалась рядами: 8 + 4, потом 6 + 3 + 3
 * со стопкой 3 × 2 над 3 × 1, потом 6 + 6 и широкие. Площадь всех пятнадцати — 16,5 ряда,
 * поэтому одна половина ряда остаётся пустой — справа от 6 × 2.
 */
const GRID_SIZES: { cols: TileCols; rows: TileRows }[] = [
  { cols: 8, rows: 3 },
  { cols: 4, rows: 3 },
  { cols: 8, rows: 2 },
  { cols: 4, rows: 2 },
  { cols: 8, rows: 1 },
  { cols: 4, rows: 1 },
  { cols: 6, rows: 3 },
  { cols: 3, rows: 3 },
  { cols: 3, rows: 2 },
  { cols: 3, rows: 1 },
  { cols: 6, rows: 2 },
  { cols: 6, rows: 1 },
  { cols: 12, rows: 1 },
  { cols: 12, rows: 2 },
  { cols: 12, rows: 3 },
];

type FontRole = 'hero' | 'figure' | 'unit' | 'page' | 'title' | 'delta' | 'row' | 'hint';

/** Восемь ролей кодекса, «Шрифты»: образец рисует компонент, в котором роль живёт. */
const FONT_ROLES: { role: FontRole; spec: string; meta: string }[] = [
  { role: 'hero', spec: 'Герой · Unbounded 60 / 700, −3, высота строки 1', meta: 'одна цифра экрана; на телефоне 44, −2' },
  { role: 'figure', spec: 'Число плитки · Unbounded 34 / 700, −1, 1,05', meta: 'плитки 3 × 1 и больше' },
  { role: 'unit', spec: 'Единица при числе · Manrope 16 / 500, отступ 8', meta: 'цвет названия плитки' },
  { role: 'page', spec: 'Заголовок страницы · Unbounded 26 / 700', meta: 'один на страницу' },
  { role: 'title', spec: 'Название плитки · Manrope 18 / 500, 1,25', meta: 'что это за число, с заглавной, без двоеточия' },
  { role: 'delta', spec: 'Изменение · Manrope 15 / 600', meta: 'знак обязателен, база словом' },
  { role: 'row', spec: 'Строка · Manrope 15 / 400–500', meta: 'списки, разбор, таблицы' },
  { role: 'hint', spec: 'Уточнение · Manrope 13 / 300, 1,4', meta: 'откуда цифра, когда посчитана' },
];
</script>

<template>
  <div class="min-h-dvh bg-web-page px-10 pt-12 pb-24 font-manrope text-[15px] leading-[1.45] text-web-text max-web:px-4 max-web:py-6">
    <main class="mx-auto flex w-full max-w-[1240px] flex-col gap-16">
      <header class="flex flex-col gap-3">
        <h1 class="m-0 font-unbounded text-[34px] leading-[1.1] font-bold tracking-[-0.5px]">Основа веба — бенто</h1>
        <p class="m-0 max-w-[780px] text-web-grey">
          Токены, роли шрифтов, сетка и плитки по кодексу веба (web/codex.html). Цифры — с экрана дашборда
          web/dashboard/01-money.html, условные.
        </p>
      </header>

      <section class="flex flex-col">
        <h2 class="m-0 mb-2 text-[13px] leading-none font-semibold tracking-[1.2px] text-web-grey uppercase">1 · Сетка</h2>
        <p class="m-0 mb-5 max-w-[840px] text-web-title">
          12 колонок, ряд 120, зазор 16, скругление плитки 32, поля 28. Размеры — 3, 4, 6, 8, 12 колонок на 1–3 ряда,
          других нет. Ниже 900 — одна колонка, плитки по содержимому от 120, поле 24, зазор 12.
        </p>
        <MoleculesWebBento>
          <MoleculesWebTile
            v-for="size in GRID_SIZES"
            :key="`${size.cols}x${size.rows}`"
            :cols="size.cols"
            :rows="size.rows"
            :title="`${size.cols} × ${size.rows}`"
          />
        </MoleculesWebBento>
      </section>

      <section class="flex flex-col">
        <h2 class="m-0 mb-2 text-[13px] leading-none font-semibold tracking-[1.2px] text-web-grey uppercase">2 · Шрифты</h2>
        <p class="m-0 mb-5 max-w-[840px] text-web-title">
          Unbounded — только числа и заголовок страницы, остальное — Manrope. Каждая роль живёт в своём компоненте.
        </p>
        <div class="flex flex-col">
          <div
            v-for="font in FONT_ROLES"
            :key="font.role"
            class="grid grid-cols-[42%_1fr_1fr] items-baseline gap-x-3 border-t border-web-line px-3 py-3.5 max-web:grid-cols-1 max-web:gap-y-1 max-web:px-0 max-web:py-2.5"
          >
            <div class="min-w-0">
              <AtomsWebFigure v-if="font.role === 'hero'" value="48,2" size="hero" />
              <AtomsWebFigure v-else-if="font.role === 'figure'" value="2 914" size="tile" />
              <AtomsWebFigure v-else-if="font.role === 'unit'" value="140,4" unit="млн сум" size="tile" />
              <AtomsWebPageTitle v-else-if="font.role === 'page'" label="Дашборд" />
              <AtomsWebTileTitle v-else-if="font.role === 'title'" label="Поездки за месяц" />
              <AtomsWebDelta v-else-if="font.role === 'delta'" value="+12 %" base="к сентябрю" tone="up" />
              <MoleculesWebBreakdownRow v-else-if="font.role === 'row'" label="Строка списка или разбора" value="+6,2 млн" tone="up" />
              <AtomsWebHint v-else text="Посчитано ночью, 05:00" />
            </div>
            <span>{{ font.spec }}</span>
            <span class="text-[13px] text-web-grey max-web:hidden">{{ font.meta }}</span>
          </div>
        </div>
      </section>

      <section class="flex flex-col">
        <h2 class="m-0 mb-2 text-[13px] leading-none font-semibold tracking-[1.2px] text-web-grey uppercase">3 · Плитки</h2>
        <p class="m-0 mb-5 max-w-[840px] text-web-title">
          Сверху — название и круглая кнопка-вход, если плитка ведёт глубже. Под названием — число, под числом — с чем
          сравнили. Плитка со входом нажимается целиком.
        </p>
        <MoleculesWebBento>
          <MoleculesWebTile :cols="8" :rows="3" title="Доход за вычетом программы">
            <template #aside>
              <AtomsWebBadge label="цифры условные" />
            </template>
            <div class="mt-[18px]">
              <AtomsWebFigure value="134,6" unit="млн сум" size="hero" />
            </div>
            <div class="mt-3 flex flex-wrap gap-x-7 gap-y-1.5">
              <AtomsWebDelta value="+8,3 млн" base="к сентябрю" tone="up" trend />
              <AtomsWebDelta value="+21,4 млн" base="к октябрю 2025" tone="up" />
            </div>
            <div class="mt-auto pt-2.5">
              <AtomsWebHint
                text="Доход парка — комиссия с каждой поездки по данным Яндекса, минус цена программы. Расходы парка не введены, поэтому это не «прибыль». Посчитано сегодня в 05:00."
              />
            </div>
          </MoleculesWebTile>

          <MoleculesWebTile :cols="4" :rows="3" title="Почему изменилось" to="/design">
            <div class="mt-[18px] flex flex-col gap-3">
              <MoleculesWebBreakdownRow label="Поездок больше" hint="83 120 против 79 400" value="+6,2 млн" tone="up" />
              <MoleculesWebBreakdownRow label="Доход с поездки" hint="1 689 против 1 659 сум" value="+2,5 млн" tone="up" />
              <MoleculesWebBreakdownRow
                label="Программа дороже"
                hint="выдано баллов на 5,8 млн"
                value="−0,4 млн"
                tone="down"
                marker="program"
              />
              <MoleculesWebBreakdownRow label="К сентябрю" value="+8,3 млн" tone="up" variant="total" />
            </div>
            <div class="mt-auto pt-2.5">
              <AtomsWebHint text="Нажмите — тот же разбор к октябрю 2025" />
            </div>
          </MoleculesWebTile>

          <MoleculesWebTile :cols="3" :rows="1" title="Доход парка">
            <div class="mt-3"><AtomsWebFigure value="140,4" unit="млн" size="tile" /></div>
          </MoleculesWebTile>
          <MoleculesWebTile :cols="3" :rows="1" title="Цена программы" marker="program">
            <div class="mt-3"><AtomsWebFigure value="5,8" unit="млн" size="tile" /></div>
          </MoleculesWebTile>
          <MoleculesWebTile :cols="3" :rows="1" title="Поездок">
            <div class="mt-3"><AtomsWebFigure value="83 120" size="tile" /></div>
          </MoleculesWebTile>
          <MoleculesWebTile :cols="3" :rows="1" title="Доход с поездки">
            <div class="mt-3"><AtomsWebFigure value="1 689" unit="сум" size="tile" /></div>
          </MoleculesWebTile>

          <MoleculesWebTile :cols="6" :rows="1" title="Затухают — поимённо">
            <template #aside>
              <AtomsWebActionButton label="Сделать сегмент" to="/design" />
            </template>
          </MoleculesWebTile>
          <MoleculesWebTile :cols="6" :rows="1" title="LTV : CAC">
            <template #aside>
              <AtomsWebActionButton label="Задать" />
            </template>
          </MoleculesWebTile>
        </MoleculesWebBento>
      </section>
    </main>
  </div>
</template>
