<script setup lang="ts">
import type { SyncSkipRow } from '#shared/types/sync';
import { DASH, formatDateTime, formatNumber } from '~/utils/format';
import { skipReasonLabel } from '~/utils/labels';

/**
 * Строка нерешённого пропущенного.
 *
 * Ссылка — идентификатор заказа либо `словарь=значение`, деталь — недостающее поле, профиль
 * водителя или имя словаря. Адресов, телефонов и имён здесь нет и быть не может.
 */
defineProps<{
  skip: SyncSkipRow;
}>();
</script>

<template>
  <article class="border-t border-slate-200 py-2.5 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <AtomsStatusBadge tone="warn" :label="skipReasonLabel(skip.reason)" />
      <span class="font-mono text-sm break-all text-slate-900">{{ skip.reference }}</span>
      <span class="font-mono text-sm text-slate-500">{{ skip.detail ?? DASH }}</span>
    </div>
    <p class="mt-1 text-xs text-slate-500">
      прогонов: {{ formatNumber(skip.timesSeen) }} · впервые {{ formatDateTime(skip.firstSeenAt) }}
      · последний раз {{ formatDateTime(skip.lastSeenAt) }}
    </p>
  </article>
</template>
