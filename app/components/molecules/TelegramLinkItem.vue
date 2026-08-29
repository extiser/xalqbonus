<script setup lang="ts">
import type { DriverTelegramLink } from '#shared/types/driver';
import { formatDateTime } from '~/utils/format';
import { linkCloseReasonLabel, linkConfirmedByLabel } from '~/utils/labels';

/**
 * Одна привязка Telegram — действующая или закрытая.
 *
 * Закрытые показываются наравне: перепривязка закрывает строку и заводит новую рядом,
 * а не правит на месте, и вопрос «кто и когда сидел на этом аккаунте» должен иметь ответ
 * через год (docs/drivers.md).
 */
defineProps<{
  link: DriverTelegramLink;
}>();
</script>

<template>
  <article class="border-t border-slate-200 py-2 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="font-mono text-sm text-slate-900">{{ link.telegramChatId }}</span>
      <AtomsStatusBadge
        :tone="link.closedAt ? 'muted' : 'ok'"
        :label="link.closedAt ? 'закрыта' : 'действует'"
      />
      <span class="text-xs text-slate-500">{{ linkConfirmedByLabel(link.confirmedBy) }}</span>
    </div>
    <p class="mt-0.5 text-xs text-slate-500">
      привязана {{ formatDateTime(link.linkedAt) }}
      <template v-if="link.closedAt">
        · закрыта {{ formatDateTime(link.closedAt) }}
        <template v-if="link.closeReason">
          · причина: {{ linkCloseReasonLabel(link.closeReason) }}
        </template>
      </template>
      <template v-if="link.operatorRef"> · оператор: {{ link.operatorRef }}</template>
    </p>
  </article>
</template>
