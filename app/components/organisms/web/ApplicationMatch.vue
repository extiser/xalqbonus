<script setup lang="ts">
import { computed } from 'vue';
import { formatCalendarDate, formatDayKey, pluralize } from '~/utils/format';
import { CANDIDATE_MATCH_LABELS, FORMER_DRIVER_DAYS } from '#shared/candidateApplications';
import type { ApplicationCard } from '#shared/types/applications';

/**
 * Плитка «Сверка» карточки заявки (issue #471) — `02-card.html`, 4 × 2: итог сверки номера
 * крупно и одна-две фразы подробностей. Если человек найден — по номеру или по прежней
 * привязке Telegram, — плитка ведёт в его карточку водителя.
 */
const props = defineProps<{
  match: ApplicationCard['match'];
  /** Момент, от которого считается «N дней назад», мс. */
  now: number;
}>();

const DAY_MS = 24 * 60 * 60 * 1_000;

const MATCH_VALUES = { formerDriverDays: String(FORMER_DRIVER_DAYS) };

/** Сколько суток от последней поездки до сегодняшних по Ташкенту. */
const daysSince = (day: string): number =>
  Math.round((Date.parse(`${formatDayKey(new Date(props.now))}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);

const details = computed((): string => {
  const { match, lastTripDay, formerLinkPersonId } = props.match;
  let first: string;

  switch (match) {
    case 'not_in_park':
      first = 'Номера нет в реестре парка, и Fleet его не знает.';
      break;
    case 'not_in_registry':
      first = 'Номера нет в реестре парка, а Fleet его знает.';
      break;
    case 'working':
    case 'former':
      if (lastTripDay === null) {
        first = 'Номер есть в реестре парка.';
      } else {
        const days = daysSince(lastTripDay);

        first = `Номер есть в реестре парка. Последняя поездка ${formatCalendarDate(lastTripDay)}, ${days} ${pluralize(days, 'день', 'дня', 'дней')} назад.`;
      }
      break;
    case 'no_trips':
      first = 'Номер есть в реестре парка. Поездок нет.';
      break;
    case 'lookup_failed':
      first = 'Сверить не удалось. Сверим ещё раз при следующем открытии.';
      break;
  }

  return `${first} ${formerLinkPersonId === null ? 'В программе не был.' : 'Этот Telegram был у участника программы.'}`;
});

const driverPath = computed((): string | undefined => {
  const personId = props.match.matchedPersonId ?? props.match.formerLinkPersonId;

  return personId === null ? undefined : `/drivers/${personId}`;
});
</script>

<template>
  <MoleculesWebTile
    :cols="4"
    :rows="2"
    :medium="6"
    title="Сверка"
    metric="applicationsMatch"
    :metric-values="MATCH_VALUES"
    :to="driverPath"
  >
    <div class="mt-3.5 font-manrope text-[18px] font-semibold text-web-text">{{ CANDIDATE_MATCH_LABELS[match.match] }}</div>
    <p class="m-0 mt-1.5 font-manrope text-[14px] leading-[1.5] text-web-title">{{ details }}</p>
  </MoleculesWebTile>
</template>
