<script setup lang="ts">
import { computed } from 'vue';
import type { LoadState } from '~/types/loadState';
import { formatDayMonth } from '~/utils/format';
import { landingLabelCount } from '~/utils/landings';
import type { LandingList, LandingRow } from '#shared/types/landings';

/**
 * Плитка «Лендинги» 4 × 6 вкладки «Лендинги» (issue #478) — `.lnd-list` в
 * `_reference/design/web/promo/04-landings.html`.
 *
 * Первая строка — экран заявки по умолчанию: он встроен в приложение. Дальше — загруженные,
 * ниже черты «В архиве» — убранные в архив. Справа у строки — сколько меток показывают лендинг.
 * Выбранная строка — на поднятой поверхности с контуром циан 18 %; выбор уходит событием,
 * адрес меняет страница.
 */
export type LandingSelection = 'default' | string;

const props = defineProps<{
  state: LoadState;
  list: LandingList | null;
  selected: LandingSelection;
}>();

const emit = defineEmits<{ select: [selection: LandingSelection] }>();

const active = computed(() => props.list?.landings.filter((landing) => !landing.archived) ?? []);
const archived = computed(() => props.list?.landings.filter((landing) => landing.archived) ?? []);

/** «загружен 09.10, обновлён 11.10», у архива — «…, в архиве с 08.10». */
const metaOf = (landing: LandingRow): string =>
  [
    `загружен ${formatDayMonth(landing.createdAt)}`,
    landing.updatedAt === null ? null : `обновлён ${formatDayMonth(landing.updatedAt)}`,
    landing.archivedAt === null ? null : `в архиве с ${formatDayMonth(landing.archivedAt)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

const ROW_CLASSES =
  'grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-[14px] border-0 px-3.5 py-3 text-left font-manrope focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';

const rowClasses = (selection: LandingSelection): string[] => [
  ROW_CLASSES,
  selection === props.selected ? 'bg-web-raised inset-ring inset-ring-web-cyan/18' : 'bg-transparent hover:bg-web-cyan/3',
];
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="6" title="Лендинги" grow :medium="12">
    <div v-if="state === 'loading'" class="mt-3.5">
      <AtomsWebHint text="Загружаем лендинги…" />
    </div>
    <div v-else-if="state === 'error' || !list" class="mt-3.5">
      <AtomsWebHint text="Список лендингов не загрузился. Это отказ запроса, а не пустой список." />
    </div>
    <template v-else>
      <ul class="m-0 mt-3.5 flex list-none flex-col gap-1 p-0">
        <li>
          <button
            type="button"
            :class="rowClasses('default')"
            :aria-current="selected === 'default' ? 'true' : undefined"
            @click="emit('select', 'default')"
          >
            <span class="text-[15px] leading-[1.3] font-semibold text-web-text">
              Экран заявки<span
                class="ml-1.5 inline-block rounded-full bg-web-cyan/10 px-2 py-0.5 align-[1px] text-[11px] font-semibold text-web-cyan"
              >по умолчанию</span>
            </span>
            <span
              class="col-start-2 row-span-2 row-start-1 text-right text-[13px] font-semibold whitespace-nowrap"
              :class="list.defaultScreen.labelCount === 0 ? 'text-web-axis' : 'text-web-title'"
            >{{ landingLabelCount(list.defaultScreen.labelCount) }}</span>
            <span class="col-start-1 text-[12px] font-medium text-web-grey">встроен в приложение</span>
          </button>
        </li>
        <li v-for="landing in active" :key="landing.id">
          <button
            type="button"
            :class="rowClasses(landing.id)"
            :aria-current="selected === landing.id ? 'true' : undefined"
            @click="emit('select', landing.id)"
          >
            <span class="min-w-0 text-[15px] leading-[1.3] font-semibold break-words text-web-text">{{ landing.name }}</span>
            <span
              class="col-start-2 row-span-2 row-start-1 text-right text-[13px] font-semibold whitespace-nowrap"
              :class="landing.labelCount === 0 ? 'text-web-axis' : 'text-web-title'"
            >{{ landingLabelCount(landing.labelCount) }}</span>
            <span class="col-start-1 text-[12px] font-medium text-web-grey">
              {{ metaOf(landing) }}<template v-if="!landing.selectable"> · <span class="text-web-scarlet-muted">не прошёл проверку</span></template>
            </span>
          </button>
        </li>
      </ul>

      <template v-if="archived.length > 0">
        <p class="m-0 mt-2 border-t border-web-line px-3.5 pt-4 pb-1.5 font-manrope text-[12px] font-medium text-web-axis">В архиве</p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="landing in archived" :key="landing.id">
            <button
              type="button"
              :class="rowClasses(landing.id)"
              :aria-current="selected === landing.id ? 'true' : undefined"
              @click="emit('select', landing.id)"
            >
              <span class="min-w-0 text-[15px] leading-[1.3] font-semibold break-words text-web-title">{{ landing.name }}</span>
              <span
                class="col-start-2 row-span-2 row-start-1 text-right text-[13px] font-semibold whitespace-nowrap"
                :class="landing.labelCount === 0 ? 'text-web-axis' : 'text-web-title'"
              >{{ landingLabelCount(landing.labelCount) }}</span>
              <span class="col-start-1 text-[12px] font-medium text-web-grey">{{ metaOf(landing) }}</span>
            </button>
          </li>
        </ul>
      </template>

      <div class="mt-auto pt-5">
        <AtomsWebHint
          text="Строка открывает лендинг в предпросмотре справа. Лендинг в архиве нельзя выбрать у новой метки. У старых меток он работает как раньше."
        />
      </div>
    </template>
  </MoleculesWebTile>
</template>
