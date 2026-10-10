<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DASH, formatDayMonth } from '~/utils/format';
import type { PromoJoinedPerson } from '#shared/types/promo';

/**
 * Плитка «Вступили по этой метке» карточки метки (issue #380) — `03-card.html`, 12 × 3.
 *
 * Водитель (позывной жирным, имя), когда перешёл, когда вступил, первая поездка — «да, ДД.ММ»
 * или «нет» цветом названия. Сверху последние; показаны 5, «Показать всех» раскрывает список —
 * плитка растёт по содержимому (`grow`), а не обрезает его. Строка ведёт в карточку водителя.
 */
const props = defineProps<{
  joined: readonly PromoJoinedPerson[];
}>();

/** Сколько строк видно до «Показать всех». */
const COLLAPSED_ROWS = 5;

const router = useRouter();
const expanded = ref(false);

const shown = computed(() => (expanded.value ? props.joined : props.joined.slice(0, COLLAPSED_ROWS)));
const collapsible = computed(() => !expanded.value && props.joined.length > COLLAPSED_ROWS);

const hint = computed(() =>
  collapsible.value
    ? `Строка ведёт в карточку водителя. Сверху — последние; показаны ${COLLAPSED_ROWS} из ${props.joined.length}.`
    : 'Строка ведёт в карточку водителя. Сверху — последние.',
);

const driverPath = (personId: string): string => `/drivers/${personId}`;

const HEAD_CLASSES = 'pr-3 pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
const CELL_CLASSES = 'border-t border-web-line py-[11px] pr-3 whitespace-nowrap group-hover:bg-web-cyan/3';
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="3" grow title="Вступили по этой метке">
    <template #aside>
      <AtomsWebActionButton v-if="collapsible" label="Показать всех" @click="expanded = true" />
    </template>
    <div v-if="joined.length === 0" class="mt-3.5">
      <AtomsWebHint text="По этой метке ещё никто не вступил" />
    </div>
    <template v-else>
      <div class="-mx-1 mt-3.5 overflow-x-auto px-1">
        <table class="w-full border-collapse font-manrope text-[14px]">
          <thead>
            <tr>
              <th :class="HEAD_CLASSES" class="w-px text-right">№</th>
              <th :class="HEAD_CLASSES" class="text-left">Водитель</th>
              <th :class="HEAD_CLASSES" class="text-right">Перешёл</th>
              <th :class="HEAD_CLASSES" class="text-right">Вступил</th>
              <th :class="HEAD_CLASSES" class="text-right">Первая поездка</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(person, index) in shown"
              :key="person.personId"
              class="group cursor-pointer"
              @click="router.push(driverPath(person.personId))"
            >
              <td :class="CELL_CLASSES" class="text-right"><AtomsWebRowNumber :value="index + 1" /></td>
              <td :class="CELL_CLASSES">
                <NuxtLink
                  :to="driverPath(person.personId)"
                  class="text-web-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
                  @click.stop
                >
                  <b class="font-bold">{{ person.callsign ?? DASH }}</b>
                  <span class="ml-1 text-web-grey">{{ person.name ?? '' }}</span>
                </NuxtLink>
              </td>
              <td :class="CELL_CLASSES" class="text-right text-web-grey">{{ formatDayMonth(person.touchedAt) }}</td>
              <td :class="CELL_CLASSES" class="text-right">{{ formatDayMonth(person.joinedAt) }}</td>
              <td :class="[CELL_CLASSES, person.firstTripAt ? '' : 'text-web-title']" class="text-right">
                {{ person.firstTripAt ? `да, ${formatDayMonth(person.firstTripAt)}` : 'нет' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-auto pt-2.5">
        <AtomsWebHint :text="hint" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
