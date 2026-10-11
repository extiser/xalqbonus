<script setup lang="ts">
import { computed } from 'vue';
import { formatDate, formatWaitDuration } from '~/utils/format';
import type { ApplicationCard } from '#shared/types/applications';

/**
 * Плитка «Ход заявки» карточки заявки (issue #471) — `02-card.html`, 12 × 1: шаги слева
 * направо — подана, первый ответ, ждёт ответа (только пока ждёт), оформлен или отказ, первая
 * поездка. Текущий шаг — циан, без ореола (кодекс, «Без ореола у отметок»). На телефоне шаги
 * идут сверху вниз.
 */
const props = defineProps<{
  card: ApplicationCard;
  /** Момент, от которого считается «ждёт ответа», мс. */
  now: number;
}>();

type Step = { key: string; title: string; text: string; current: boolean };

const steps = computed((): Step[] => {
  const { application, firstReply, events, firstTrip } = props.card;
  const submittedAt = new Date(application.createdAt).getTime();
  const waiting = application.waitingSince !== null;
  const open = application.status === 'new' || application.status === 'in_progress';
  const closed = application.status === 'hired' || application.status === 'rejected';
  const lastMark = [...events].reverse().find((event) => event.kind === application.status);

  const result: Step[] = [
    { key: 'submitted', title: 'Подана', text: formatDate(application.createdAt), current: false },
    {
      key: 'first-reply',
      title: 'Первый ответ',
      text:
        firstReply === null
          ? 'ещё нет'
          : `через ${formatWaitDuration(new Date(firstReply.at).getTime() - submittedAt)} · ${firstReply.employeeName}`,
      current: false,
    },
  ];

  if (application.waitingSince !== null) {
    result.push({
      key: 'waiting',
      title: 'Ждёт ответа',
      text: `${formatWaitDuration(props.now - new Date(application.waitingSince).getTime())}, с ${formatDate(application.waitingSince)}`,
      current: true,
    });
  }

  result.push(
    closed
      ? {
          key: 'mark',
          title: application.status === 'hired' ? 'Оформлен' : 'Отказ',
          text: lastMark === undefined ? '' : `${formatDate(lastMark.createdAt)} · ${lastMark.employeeName}`,
          current: false,
        }
      : { key: 'mark', title: 'Оформлен или отказ', text: 'ставит сотрудник', current: !waiting && open },
    {
      key: 'first-trip',
      title: 'Первая поездка',
      text: firstTrip === null ? 'после оформления' : formatDate(firstTrip.at),
      current: !waiting && application.status === 'hired' && firstTrip === null,
    },
  );

  return result;
});
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="1" inline title="Ход заявки">
    <ol
      class="m-0 grid flex-1 list-none gap-4 p-0 max-web:mt-4 max-web:grid-cols-1"
      :class="steps.length === 5 ? 'web:grid-cols-5' : 'web:grid-cols-4'"
    >
      <li
        v-for="(step, index) in steps"
        :key="step.key"
        class="relative min-w-0 pt-[18px] max-web:pt-0 max-web:pl-[22px]"
        :aria-current="step.current ? 'step' : undefined"
      >
        <!-- Линия до следующего шага: на ноутбуке вправо, на телефоне вниз. -->
        <span
          v-if="index < steps.length - 1"
          aria-hidden="true"
          class="absolute top-1 left-0 -right-4 h-0.5 bg-web-teal max-web:top-2.5 max-web:right-auto max-web:-bottom-4 max-web:left-1 max-web:h-auto max-web:w-0.5"
        />
        <span
          aria-hidden="true"
          class="absolute top-0 left-0 size-2.5 rounded-full max-web:top-1"
          :class="step.current ? 'bg-web-cyan' : 'bg-web-teal-mid'"
        />
        <b class="block font-manrope text-[14px] font-semibold" :class="step.current ? 'text-web-cyan' : 'text-web-text'">
          {{ step.title }}
        </b>
        <span class="mt-1 block truncate font-manrope text-[12px] leading-[1.4] text-web-grey max-web:whitespace-normal">
          {{ step.text }}
        </span>
      </li>
    </ol>
  </MoleculesWebTile>
</template>
