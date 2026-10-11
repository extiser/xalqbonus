<script setup lang="ts">
import { DASH, formatDate } from '~/utils/format';
import type { ApplicationCard } from '#shared/types/applications';

/**
 * Плитка «Откуда» карточки заявки (issue #471) — `02-card.html`, 4 × 2: метка, вход — чат бота
 * или приложение, — и когда кандидат перешёл по метке. Тем, кому открыт раздел «Промо», плитка
 * ведёт в карточку метки. Её же берёт карточка человека из «Не закончили» (issue #475): там
 * момент перехода — когда он нажал `/start`, и ряд подписан так.
 */
withDefaults(
  defineProps<{
    source: ApplicationCard['source'];
    channel: ApplicationCard['application']['channel'];
    /** Карточка метки; нет — плитка никуда не ведёт. */
    promoPath?: string;
    /** Подпись ряда с моментом перехода. */
    touchedLabel?: string;
  }>(),
  { promoPath: undefined, touchedLabel: 'Перешёл' },
);
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="2" :medium="6" title="Откуда" :to="promoPath">
    <dl class="m-0 mt-2.5 flex flex-col">
      <MoleculesWebFactRow label="Метка">
        <span class="min-w-0 truncate">
          {{ source.promoName ?? source.promoCode }}<span v-if="source.promoName !== null" class="text-[12px] font-medium text-web-grey"> · {{ source.promoCode }}</span>
        </span>
      </MoleculesWebFactRow>
      <MoleculesWebFactRow label="Вход">{{ channel === 'bot' ? 'чат бота' : 'приложение' }}</MoleculesWebFactRow>
      <MoleculesWebFactRow :label="touchedLabel">{{ source.touchedAt === null ? DASH : formatDate(source.touchedAt) }}</MoleculesWebFactRow>
    </dl>
  </MoleculesWebTile>
</template>
