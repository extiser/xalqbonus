<script setup lang="ts">
import type { UnfinishedCard } from '#shared/types/applications';

/**
 * Плитка «Человек в Telegram» карточки человека из «Не закончили» (issue #475) —
 * `04-unfinished-card.html`, 4 × 2. Ряды по 40 с чертой: имя в Telegram, `@имя` (нет — ряда нет),
 * присланный номер с кнопкой «скопировать» (не прислал — ряда нет), Telegram ID с кнопкой
 * «скопировать». «Писать в бот» нет: он сам открыл бота.
 */
defineProps<{
  draft: UnfinishedCard['draft'];
}>();
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="2" :medium="6" title="Человек в Telegram">
    <dl class="m-0 mt-2.5 flex flex-col">
      <MoleculesWebFactRow label="Имя в Telegram">{{ draft.telegramName }}</MoleculesWebFactRow>
      <MoleculesWebFactRow v-if="draft.telegramUsername !== null" label="Telegram">@{{ draft.telegramUsername }}</MoleculesWebFactRow>
      <MoleculesWebFactRow v-if="draft.phone !== null" label="Прислал номер">
        <span class="whitespace-nowrap">{{ draft.phone }}</span>
        <AtomsWebCopyButton :value="draft.phone.replace(/[\s-]/g, '')" label="Скопировать номер" />
      </MoleculesWebFactRow>
      <MoleculesWebFactRow label="Telegram ID">
        {{ draft.telegramUserId }}
        <AtomsWebCopyButton :value="draft.telegramUserId" label="Скопировать Telegram ID" />
      </MoleculesWebFactRow>
    </dl>
  </MoleculesWebTile>
</template>
