<script setup lang="ts">
import { DASH, formatCalendarDate, formatDateTime, formatNumber, pluralize } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { GiftGrant } from '#shared/types/rewards';

/**
 * Раздачи подарков свежими первыми (issue #219): когда, кому, сколько и по какому поводу,
 * кто вручил и что стало с подарками — забрали сами, зачислено по сроку, ждут.
 */
defineProps<{
  state: LoadState;
  grants: GiftGrant[] | null;
}>();

const recipientText = (grant: GiftGrant): string =>
  grant.recipientKind === 'segment'
    ? `сегмент «${grant.segmentName ?? DASH}»`
    : (grant.driverName ?? 'водитель без имени');
</script>

<template>
  <MoleculesSectionPanel
    title="Раздачи подарков"
    note="Подарок ждёт водителя в приложении. Незабранное зачисляется само в конце дня «Забрать до». Из сегмента подарок получают только участники программы — остальные пропускаются."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем раздачи…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Раздачи не прочитались. Это отказ запроса, а не отсутствие раздач."
    />
    <MoleculesStateNotice
      v-else-if="!grants || grants.length === 0"
      state="empty"
      message="Подарков ещё не дарили."
    />
    <ul v-else>
      <li
        v-for="grant in grants"
        :key="grant.giftGrantId"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
      >
        <div class="min-w-48 flex-1">
          <p class="text-sm font-semibold text-slate-900">
            {{ formatNumber(grant.points) }} {{ pluralize(grant.points, 'балл', 'балла', 'баллов') }} ·
            {{ grant.reason }}
          </p>
          <p class="mt-0.5 text-sm text-slate-700">
            <NuxtLink
              v-if="grant.recipientKind === 'person' && grant.personId"
              :to="`/drivers/${grant.personId}`"
              class="underline underline-offset-2 hover:text-slate-500"
            >
              {{ recipientText(grant) }}
            </NuxtLink>
            <NuxtLink
              v-else-if="grant.segmentId"
              :to="`/segments/${grant.segmentId}`"
              class="underline underline-offset-2 hover:text-slate-500"
            >
              {{ recipientText(grant) }}
            </NuxtLink>
            · забрать до {{ formatCalendarDate(grant.untilDate) }}
          </p>
          <p class="mt-0.5 text-xs text-slate-500">
            {{ formatDateTime(grant.createdAt) }} · вручил {{ grant.grantedByName }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">получателей / пропущено / забрали сами / по сроку / ждут</p>
          <p class="font-mono text-sm text-slate-900 tabular-nums">
            {{ formatNumber(grant.recipients) }} / {{ formatNumber(grant.skipped) }} /
            {{ formatNumber(grant.claimedByDriver) }} / {{ formatNumber(grant.creditedAuto) }} /
            {{ formatNumber(grant.waiting) }}
          </p>
        </div>
      </li>
    </ul>
  </MoleculesSectionPanel>
</template>
