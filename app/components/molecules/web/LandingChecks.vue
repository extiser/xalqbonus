<script setup lang="ts">
import { LANDING_CHECK_LABELS } from '#shared/landings';
import type { LandingCheck } from '#shared/types/landings';

/**
 * Пункты проверки архива лендинга (issue #478) — `.chk` в `_reference/design/web/promo/05-landing-upload.html`:
 * кружок 18 с галочкой зелёным или крестиком приглушённым алым, подпись 14 / 500, под непройденным —
 * что не так, 13 / 400 приглушённым алым. В окне загрузки — на подложке циан 4 % (`boxed`),
 * в предпросмотре — без неё.
 */
defineProps<{
  checks: readonly LandingCheck[];
  boxed?: boolean;
}>();
</script>

<template>
  <ul
    class="m-0 flex list-none flex-col gap-2.5 p-0"
    :class="boxed ? 'rounded-[14px] bg-web-cyan/4 px-4 py-3.5' : ''"
  >
    <li
      v-for="check in checks"
      :key="check.key"
      class="grid grid-cols-[18px_1fr] items-start gap-2.5 font-manrope text-[14px] leading-[1.35] font-medium text-web-text"
    >
      <span
        class="mt-px grid size-[18px] place-items-center rounded-full"
        :class="check.ok ? 'bg-web-green/16' : 'bg-web-scarlet-muted/16'"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-2.5"
          :class="check.ok ? 'stroke-web-green' : 'stroke-web-scarlet-muted'"
          aria-hidden="true"
        >
          <path v-if="check.ok" d="M5 12l5 5 9-10" />
          <path v-else d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
      <span class="min-w-0">
        <span class="sr-only">{{ check.ok ? 'Прошло:' : 'Не прошло:' }} </span>{{ LANDING_CHECK_LABELS[check.key] }}
        <span
          v-for="problem in check.problems"
          :key="problem"
          class="mt-0.5 block font-manrope text-[13px] leading-[1.4] font-normal break-words text-web-scarlet-muted"
        >{{ problem }}</span>
      </span>
    </li>
  </ul>
</template>
