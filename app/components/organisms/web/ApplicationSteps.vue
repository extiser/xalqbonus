<script setup lang="ts">
import { computed } from 'vue';
import { formatDate, formatWaitDuration } from '~/utils/format';
import type { ProgressStep } from '~/components/molecules/web/ProgressSteps.vue';
import type { ApplicationCard } from '#shared/types/applications';

/**
 * Плитка «Ход заявки» карточки заявки (issue #471) — `02-card.html`, 12 × 1: шаги слева
 * направо — подана, первый ответ, ждёт ответа (только пока ждёт), оформлен или отказ, первая
 * поездка. Текущий шаг — циан (`MoleculesWebProgressSteps`).
 */
const props = defineProps<{
  card: ApplicationCard;
  /** Момент, от которого считается «ждёт ответа», мс. */
  now: number;
}>();

const steps = computed((): ProgressStep[] => {
  const { application, firstReply, events, firstTrip } = props.card;
  const submittedAt = new Date(application.createdAt).getTime();
  const waiting = application.waitingSince !== null;
  const open = application.status === 'new' || application.status === 'in_progress';
  const closed = application.status === 'hired' || application.status === 'rejected';
  const lastMark = [...events].reverse().find((event) => event.kind === application.status);

  const result: ProgressStep[] = [
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
    <MoleculesWebProgressSteps :steps="steps" />
  </MoleculesWebTile>
</template>
