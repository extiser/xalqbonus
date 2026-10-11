<script setup lang="ts">
import { PhKeyboard } from '@phosphor-icons/vue';
import type { ApplicationCard } from '#shared/types/applications';

/**
 * Плитка «Кандидат» карточки заявки (issue #471) — `02-card.html`, 4 × 2, без значка подсказки:
 * это не метрика, а поля кандидата. Ряды по 40 с чертой: имя, телефон с кнопкой «скопировать»
 * и пометкой «вручную», Telegram ID с кнопкой «скопировать», можно ли писать в бот.
 */
defineProps<{
  application: ApplicationCard['application'];
}>();
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="2" :medium="6" title="Кандидат">
    <dl class="m-0 mt-2.5 flex flex-col">
      <MoleculesWebFactRow label="Имя">{{ application.name }}</MoleculesWebFactRow>
      <MoleculesWebFactRow label="Телефон">
        <span class="whitespace-nowrap">{{ application.phone }}</span>
        <MoleculesWebTooltip
          v-if="application.phoneManual"
          text="Номер введён вручную. Кандидат не поделился номером из Telegram."
        >
          <span
            tabindex="0"
            class="inline-flex cursor-default items-center gap-1 text-[12px] text-web-grey focus-visible:text-web-text focus-visible:outline-none"
          >
            <PhKeyboard weight="duotone" aria-hidden="true" class="size-3.5" />вручную
          </span>
        </MoleculesWebTooltip>
        <AtomsWebCopyButton :value="application.phone.replace(/[\s-]/g, '')" label="Скопировать номер" />
      </MoleculesWebFactRow>
      <MoleculesWebFactRow label="Telegram ID">
        {{ application.telegramUserId }}
        <AtomsWebCopyButton :value="application.telegramUserId" label="Скопировать Telegram ID" />
      </MoleculesWebFactRow>
      <MoleculesWebFactRow label="Писать в бот">{{ application.writeAllowed ? 'можно' : 'нельзя' }}</MoleculesWebFactRow>
    </dl>
  </MoleculesWebTile>
</template>
