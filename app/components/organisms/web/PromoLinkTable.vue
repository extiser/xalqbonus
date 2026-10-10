<script setup lang="ts">
import { useRouter } from 'vue-router';
import { DASH, formatMomentDate, formatNumber, formatWholeShare } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { MetricKey } from '#shared/metrics';
import { PROMO_MEDIUM_LABELS } from '#shared/promo';
import type { PromoLinkRow } from '#shared/types/promo';

/**
 * Плитка «Метки» списка «Промо» (issue #380) — таблица `01-list.html`, 12 × 4. Растёт
 * по числу меток (`grow`): двенадцатая метка не обрезается, а растит ряд.
 *
 * Текст — по левому краю, числа — по правому; в шапке числовой колонки значок подсказки стоит
 * после подписи и вынесен за её правый край — правый край подписи совпадает с правым краем чисел
 * (`codex.md`, «Подсказка метрики», `MoleculesWebColumnLabel`). У последней колонки значок выходит
 * за таблицу — прокрутке оставлено место справа, иначе он сам давал бы прокрутку вбок. Строка открывает карточку метки; название — ссылка туда же, для клавиатуры.
 *
 * Данные — свойством: сама плитка в сеть не ходит.
 */
defineProps<{
  state: LoadState;
  links: readonly PromoLinkRow[] | null;
}>();

const router = useRouter();

const NUMBER_COLUMNS: readonly { label: string; metric: MetricKey }[] = [
  { label: 'Перешли', metric: 'promoWent' },
  { label: 'Вступили', metric: 'promoJoined' },
  { label: 'Первая поездка', metric: 'promoFirstTrip' },
  { label: 'До поездки', metric: 'promoConversion' },
  { label: 'Уже были', metric: 'promoAlready' },
];

const cardPath = (code: string): string => `/promo/${encodeURIComponent(code)}`;

const HEAD_CLASSES = 'pr-3 pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
const CELL_CLASSES = 'border-t border-web-line py-[11px] pr-3 whitespace-nowrap group-hover:bg-web-cyan/3';
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="4" grow title="Метки">
    <div v-if="state === 'loading'" class="mt-3.5">
      <AtomsWebHint text="Считаем переходы…" />
    </div>
    <div v-else-if="state === 'error' || links === null" class="mt-3.5">
      <AtomsWebHint text="Метки не загрузились. Это отказ запроса, а не пустой список." />
    </div>
    <div v-else-if="links.length === 0" class="mt-3.5">
      <AtomsWebHint text="Меток пока нет — заведите первую кнопкой «Новая метка»" />
    </div>
    <template v-else>
      <div class="mt-3.5 -mr-5 -ml-1 overflow-x-auto pr-5 pl-1">
        <table class="w-full border-collapse font-manrope text-[14px]">
          <thead>
            <tr>
              <th :class="HEAD_CLASSES" class="w-px text-right">№</th>
              <th :class="HEAD_CLASSES" class="text-left">Метка</th>
              <th :class="HEAD_CLASSES" class="text-left">Носитель</th>
              <th :class="HEAD_CLASSES" class="text-left">Место</th>
              <th v-for="column in NUMBER_COLUMNS" :key="column.metric" :class="HEAD_CLASSES" class="text-right">
                <MoleculesWebColumnLabel :label="column.label" :metric="column.metric" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(link, index) in links"
              :key="link.code"
              class="group cursor-pointer"
              @click="router.push(cardPath(link.code))"
            >
              <td :class="CELL_CLASSES" class="text-right"><AtomsWebRowNumber :value="index + 1" /></td>
              <td :class="CELL_CLASSES">
                <NuxtLink
                  :to="cardPath(link.code)"
                  class="block font-manrope text-[15px] font-semibold text-web-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
                  @click.stop
                >
                  {{ link.name }}
                </NuxtLink>
                <div class="mt-0.5 text-[12px] font-medium text-web-grey">
                  {{ link.code }} · с {{ formatMomentDate(link.createdAt) }}
                </div>
              </td>
              <td :class="CELL_CLASSES">{{ PROMO_MEDIUM_LABELS[link.medium] }}</td>
              <td :class="CELL_CLASSES" class="text-web-grey">{{ link.placement ?? DASH }}</td>
              <td :class="CELL_CLASSES" class="text-right">{{ formatNumber(link.went) }}</td>
              <td :class="CELL_CLASSES" class="text-right">{{ formatNumber(link.joined) }}</td>
              <td :class="CELL_CLASSES" class="text-right">{{ formatNumber(link.firstTrip) }}</td>
              <td :class="CELL_CLASSES" class="text-right font-bold text-web-text">
                {{ formatWholeShare(link.firstTrip, link.went) }}
              </td>
              <td :class="CELL_CLASSES" class="text-right text-web-title">{{ formatNumber(link.already) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-auto pt-2.5">
        <AtomsWebHint
          text="Строка открывает карточку метки: ссылка, QR для печати и переходы по дням. Цифры — за всё время метки."
        />
      </div>
    </template>
  </MoleculesWebTile>
</template>
