<script setup lang="ts">
import type { StaffOutcomeView } from '~/types/staffView';

/**
 * Плашка исхода — `_reference/design/staff/05-desk-issued.html`, `05-desk-not-found.html`, `.result`
 * (issue #250).
 *
 * Удача — зелёная с галочкой: «Выдано · заказ #1042 · **Алиев Шерзод**», имя белым — по нему
 * сотрудник сверяет, кому отдал. Отказ — алая с восклицанием, текст с сервера. Тем же видом —
 * «Пароль сохранён» в форме пароля (`06-password-saved.html`).
 */
defineProps<{
  outcome: StaffOutcomeView;
}>();
</script>

<template>
  <div
    role="status"
    class="flex items-start gap-2.5 rounded-[14px] border px-3.5 py-3 font-manrope text-[14px] leading-[1.45]"
    :class="
      outcome.tone === 'ok'
        ? 'border-[rgba(95,208,138,0.35)] bg-[rgba(95,208,138,0.10)] font-semibold text-xb-green'
        : 'border-[rgba(255,92,120,0.40)] bg-[rgba(255,92,120,0.08)] font-medium text-xb-scarlet-soft'
    "
  >
    <svg v-if="outcome.tone === 'ok'" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" class="mt-px shrink-0">
      <circle cx="12" cy="12" r="9" fill="#5FD08A" />
      <path d="M7.5 12.3l3 3 6-6.3" stroke="#0B0D11" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" class="mt-px shrink-0">
      <circle cx="12" cy="12" r="9" stroke="#FF7089" stroke-width="1.8" />
      <path d="M12 7.5v5.5" stroke="#FF7089" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="16.3" r="1.2" fill="#FF7089" />
    </svg>
    <span>
      {{ outcome.text }}<template v-if="outcome.tone === 'ok' && outcome.name"> · <b class="font-semibold text-xb-text">{{ outcome.name }}</b></template>
    </span>
  </div>
</template>
