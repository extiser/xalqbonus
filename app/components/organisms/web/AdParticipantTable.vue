<script setup lang="ts">
import { useRouter } from 'vue-router';
import { DASH, formatDate, formatDayMonth } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { AdParticipantList } from '#shared/types/applications';

/**
 * Плитка «Участники программы, пришли по рекламе» списка заявок (issue #471) — `01-list.html`,
 * 12 × 3, растёт по числу строк. Участники, открывшие бота или приложение по метке рекламы,
 * строка на человека по последнему касанию: водитель (позывной жирным · имя), метка (название,
 * под ним код), когда перешёл, последняя поездка. Строка ведёт в карточку водителя.
 */
defineProps<{
  state: LoadState;
  list: AdParticipantList | null;
}>();

const emit = defineEmits<{ page: [offset: number] }>();

const router = useRouter();

const driverPath = (personId: string): string => `/drivers/${personId}`;

const HEAD_CLASSES = 'pr-3 pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
const CELL_CLASSES = 'border-t border-web-line py-[11px] pr-3 align-top whitespace-nowrap group-hover:bg-web-cyan/3';
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="3" grow title="Участники программы, пришли по рекламе" metric="applicationsAdParticipants">
    <div v-if="state === 'loading' && list === null" class="mt-3.5">
      <AtomsWebHint text="Загружаем участников…" />
    </div>
    <div v-else-if="state === 'error' || list === null" class="mt-3.5">
      <AtomsWebHint text="Участники не загрузились. Это отказ запроса, а не пустой список." />
    </div>
    <div v-else-if="list.total === 0" class="mt-3.5">
      <AtomsWebHint text="По рекламе ещё не приходил никто из участников программы" />
    </div>
    <template v-else>
      <div class="-mx-1 mt-3.5 overflow-x-auto px-1">
        <table class="w-full border-collapse font-manrope text-[14px]">
          <thead>
            <tr>
              <th :class="HEAD_CLASSES" class="w-px text-right">№</th>
              <th :class="HEAD_CLASSES" class="text-left">Водитель</th>
              <th :class="HEAD_CLASSES" class="text-left">Метка</th>
              <th :class="HEAD_CLASSES" class="text-left">Перешёл</th>
              <th :class="HEAD_CLASSES" class="text-right">Последняя поездка</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(person, index) in list.rows"
              :key="person.personId"
              class="group cursor-pointer"
              @click="router.push(driverPath(person.personId))"
            >
              <td :class="CELL_CLASSES" class="text-right"><AtomsWebRowNumber :value="list.offset + index + 1" /></td>
              <td :class="CELL_CLASSES">
                <NuxtLink
                  :to="driverPath(person.personId)"
                  class="text-web-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
                  @click.stop
                >
                  <b class="font-bold">{{ person.callsign ?? DASH }}</b>
                  <span class="ml-1 text-web-grey">· {{ person.name ?? DASH }}</span>
                </NuxtLink>
              </td>
              <td :class="CELL_CLASSES">
                {{ person.promoName ?? person.promoCode }}
                <div v-if="person.promoName !== null" class="mt-0.5 text-[12px] font-medium text-web-grey">
                  {{ person.promoCode }}
                </div>
              </td>
              <td :class="CELL_CLASSES" class="text-web-grey">{{ formatDate(person.touchedAt) }}</td>
              <td :class="[CELL_CLASSES, person.lastTripAt === null ? 'text-web-title' : '']" class="text-right">
                {{ person.lastTripAt === null ? 'нет' : formatDayMonth(person.lastTripAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-auto flex items-center justify-between gap-3 pt-3 max-web:flex-col max-web:items-start">
        <AtomsWebHint text="Строка открывает карточку водителя. Показаны последние переходы, по одному на человека." />
        <MoleculesWebPagerBar :total="list.total" :limit="list.limit" :offset="list.offset" @change="emit('page', $event)" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
