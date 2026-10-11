<script setup lang="ts">
import { useRouter } from 'vue-router';
import { DASH, formatDate, formatWaitDuration } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { UnfinishedList, UnfinishedRow } from '#shared/types/applications';

/**
 * Таблица вкладки «Не закончили» плитки «Заявки» (issue #475) — `03-unfinished.html`. Стоит
 * в плитке списка заявок под пилюлями вместо таблицы заявок: шапка, поиск и пилюли — плитки.
 *
 * Колонки: №, человек в Telegram (имя, под ним `@имя` или Telegram ID), дошёл до (шаг, под
 * номером — номер), откуда (метка, под ней код), когда нажал `/start`, кто ведёт, сколько ждёт
 * ответа. Номер строки сплошной через страницы. Ждёт ответа — циан с «написал сам»; не ждёт —
 * прочерк. Строка открывает карточку человека, имя — ссылка туда же, для клавиатуры.
 */
defineProps<{
  state: LoadState;
  list: UnfinishedList | null;
  /** Момент, от которого считается «ждёт ответа», мс. */
  now: number;
}>();

const emit = defineEmits<{ page: [offset: number] }>();

const router = useRouter();

const STEP_LABELS: Readonly<Record<UnfinishedRow['step'], string>> = {
  awaiting_contact: 'Нажал /start',
  awaiting_name: 'Прислал номер',
};

const cardPath = (id: string): string => `/applications/unfinished/${id}`;

const HEAD_CLASSES = 'pr-3 pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
const CELL_CLASSES = 'border-t border-web-line py-[11px] pr-3 align-top whitespace-nowrap group-hover:bg-web-cyan/3';
const SUB_CLASSES = 'mt-0.5 text-[12px] font-medium text-web-grey';
</script>

<template>
  <div v-if="state === 'loading' && list === null" class="mt-3.5">
    <AtomsWebHint text="Загружаем список…" />
  </div>
  <div v-else-if="state === 'error' || list === null" class="mt-3.5">
    <AtomsWebHint text="Список не загрузился. Это отказ запроса, а не пустой список." />
  </div>
  <template v-else>
    <!-- Значок последней колонки висит за её правым краем: прокрутке оставлено место справа. -->
    <div class="mt-3.5 -mr-[30px] -ml-1 overflow-x-auto pr-[30px] pl-1">
      <table class="w-full border-collapse font-manrope text-[14px]">
        <thead>
          <tr>
            <th :class="HEAD_CLASSES" class="w-px text-right">№</th>
            <th :class="HEAD_CLASSES" class="text-left">Человек в Telegram</th>
            <th :class="HEAD_CLASSES" class="text-left">
              <MoleculesWebMetricLabel label="Дошёл до" metric="applicationsUnfinishedStep" />
            </th>
            <th :class="HEAD_CLASSES" class="text-left">Откуда</th>
            <th :class="HEAD_CLASSES" class="text-left">
              <MoleculesWebMetricLabel label="Нажал /start" metric="applicationsUnfinishedStarted" />
            </th>
            <th :class="HEAD_CLASSES" class="text-left">
              <MoleculesWebMetricLabel label="Ведёт" metric="applicationsUnfinishedLead" />
            </th>
            <th :class="HEAD_CLASSES" class="text-right">
              <MoleculesWebColumnLabel label="Ждёт ответа" metric="applicationsUnfinishedWaitFor" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="list.rows.length === 0">
            <td :class="CELL_CLASSES" colspan="7" class="text-web-grey">Никого нет</td>
          </tr>
          <tr
            v-for="(row, index) in list.rows"
            :key="row.id"
            class="group cursor-pointer"
            @click="router.push(cardPath(row.id))"
          >
            <td :class="CELL_CLASSES" class="text-right"><AtomsWebRowNumber :value="list.offset + index + 1" /></td>
            <td :class="CELL_CLASSES">
              <NuxtLink
                :to="cardPath(row.id)"
                class="block text-[15px] font-semibold text-web-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
                @click.stop
              >
                {{ row.telegramName }}
              </NuxtLink>
              <div :class="SUB_CLASSES">
                {{ row.telegramUsername === null ? `ID ${row.telegramUserId}` : `@${row.telegramUsername}` }}
              </div>
            </td>
            <td :class="CELL_CLASSES">
              {{ STEP_LABELS[row.step] }}
              <div v-if="row.phone !== null" :class="SUB_CLASSES">{{ row.phone }}</div>
            </td>
            <td :class="CELL_CLASSES">
              <template v-if="row.promoName !== null">
                {{ row.promoName }}
                <div :class="SUB_CLASSES">{{ row.promoCode }}</div>
              </template>
              <template v-else>{{ row.promoCode }}</template>
            </td>
            <td :class="CELL_CLASSES" class="text-web-grey">{{ formatDate(row.startedAt) }}</td>
            <td :class="[CELL_CLASSES, row.handledBy === null ? 'text-web-grey' : '']">
              {{ row.handledBy ?? DASH }}
            </td>
            <td :class="CELL_CLASSES" class="text-right">
              <span v-if="row.waitingSince !== null" class="font-semibold text-web-cyan">
                {{ formatWaitDuration(now - new Date(row.waitingSince).getTime()) }}
                <span class="mt-0.5 block text-[12px] font-normal text-web-grey">написал сам</span>
              </span>
              <span v-else class="text-web-grey">{{ DASH }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-auto flex items-center justify-between gap-3 pt-3 max-web:flex-col max-web:items-start">
      <AtomsWebHint
        text="Нажали /start больше часа назад или написали сами, но заявку не подали. Сверху те, кто написал сам. Ниже те, кому ещё никто не писал, свежие первыми. Внизу те, кому уже написали. Строка открывает переписку."
      />
      <MoleculesWebPagerBar :total="list.total" :limit="list.limit" :offset="list.offset" @change="emit('page', $event)" />
    </div>
  </template>
</template>
