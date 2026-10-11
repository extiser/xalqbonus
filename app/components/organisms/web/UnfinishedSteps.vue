<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from '~/utils/format';
import type { ProgressStep } from '~/components/molecules/web/ProgressSteps.vue';
import type { UnfinishedCard } from '#shared/types/applications';

/**
 * Плитка «Ход заявки» карточки человека из «Не закончили» (issue #475) — `04-unfinished-card.html`,
 * 12 × 1: нажал `/start` → прислал номер → написал имя → заявка. Текущий шаг — тот, которого бот
 * ждёт: номер на шаге `awaiting_contact`, имя на `awaiting_name`.
 */
const props = defineProps<{
  draft: UnfinishedCard['draft'];
}>();

const steps = computed((): ProgressStep[] => {
  const { step, startedAt, phoneAt } = props.draft;
  const awaitingContact = step === 'awaiting_contact';

  return [
    { key: 'started', title: 'Нажал /start', text: formatDate(startedAt), current: false },
    {
      key: 'phone',
      title: 'Прислал номер',
      text: awaitingContact ? `ждём с ${formatDate(startedAt)}` : formatDate(phoneAt),
      current: awaitingContact,
    },
    {
      key: 'name',
      title: 'Написал имя',
      text: awaitingContact ? 'после номера' : `ждём с ${formatDate(phoneAt)}`,
      current: !awaitingContact,
    },
    { key: 'application', title: 'Заявка', text: 'подаст, когда напишет имя', current: false },
  ];
});
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="1" inline title="Ход заявки">
    <MoleculesWebProgressSteps :steps="steps" />
  </MoleculesWebTile>
</template>
