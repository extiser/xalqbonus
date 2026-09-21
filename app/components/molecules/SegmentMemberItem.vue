<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatNumber, pluralize } from '~/utils/format';
import type { SegmentMember } from '#shared/types/segment';

/**
 * Строка состава сегмента: имя, позывной, баланс, давность поездки, привязка Telegram.
 *
 * Давность — не для красоты: список одних имён не доказывает ничего, а по этой колонке
 * за секунду видно, что отбор взял заданные границы, а не соседние (issue #165).
 */
const props = defineProps<{
  member: SegmentMember;
}>();

const fullName = computed(() => {
  const parts = [props.member.lastName, props.member.firstName, props.member.middleName].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length > 0 ? parts.join(' ') : 'имя не заведено';
});

const daysSinceTrip = computed(() => {
  const days = props.member.daysSinceTrip;

  if (days === null) {
    return 'завершённых поездок не было';
  }

  return `${formatNumber(days)} ${pluralize(days, 'день', 'дня', 'дней')} с поездки`;
});
</script>

<template>
  <article class="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <NuxtLink
        :to="`/drivers/${member.personId}`"
        class="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-slate-900"
      >
        {{ fullName }}
      </NuxtLink>
      <span v-if="member.callsigns.length > 0" class="font-mono text-sm text-slate-500">
        {{ member.callsigns.join(', ') }}
      </span>
      <AtomsStatusBadge
        :tone="member.telegramLinked ? 'ok' : 'muted'"
        :label="member.telegramLinked ? 'Telegram привязан' : 'без Telegram'"
      />
    </div>

    <dl class="mt-1 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
      <div class="flex gap-2">
        <dt class="text-slate-500">Давность</dt>
        <dd class="text-slate-700 tabular-nums">{{ daysSinceTrip }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-slate-500">Баланс</dt>
        <!-- Прочерк, а не ноль: водительского счёта нет. -->
        <dd class="font-mono text-slate-700 tabular-nums">
          {{ member.balance === null ? DASH : formatNumber(member.balance) }}
        </dd>
      </div>
    </dl>
  </article>
</template>
