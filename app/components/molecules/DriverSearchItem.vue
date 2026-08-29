<script setup lang="ts">
import { computed } from 'vue';
import type { DriverSearchRow } from '#shared/types/driver';
import { DASH, formatNumber } from '~/utils/format';
import { workStatusLabel } from '~/utils/labels';

/**
 * Строка результата поиска.
 *
 * Участие в программе видно сразу и подписано словами, а не выведено из пустого баланса:
 * реестр парка шире программы в шесть раз, и «не состоит» — самый частый честный ответ,
 * а не отсутствие данных.
 */
const props = defineProps<{
  driver: DriverSearchRow;
}>();

const fullName = computed(() => {
  const parts = [props.driver.lastName, props.driver.firstName, props.driver.middleName].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length > 0 ? parts.join(' ') : 'имя не заведено';
});
</script>

<template>
  <article class="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <NuxtLink
        :to="`/drivers/${driver.personId}`"
        class="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-slate-900"
      >
        {{ fullName }}
      </NuxtLink>
      <AtomsStatusBadge
        :tone="driver.isMember ? 'ok' : 'muted'"
        :label="driver.isMember ? 'в программе' : 'не в программе'"
      />
      <AtomsStatusBadge
        v-for="status in driver.workStatuses"
        :key="status"
        :tone="status === 'working' ? 'ok' : 'muted'"
        :label="workStatusLabel(status)"
      />
      <!-- Несколько учёток у одного человека — не редкость и не ошибка: увольнение
           и заведение заново дают второй профиль на том же номере ВУ. -->
      <AtomsStatusBadge
        v-if="driver.profilesCount > 1"
        tone="warn"
        :label="`учёток в парке: ${driver.profilesCount}`"
      />
    </div>

    <dl class="mt-1 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-3">
      <div class="flex gap-2">
        <dt class="text-slate-500">ВУ</dt>
        <dd class="font-mono break-all text-slate-700">{{ driver.licenseNumberRaw ?? DASH }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-slate-500">Телефон</dt>
        <dd class="font-mono break-all text-slate-700">
          {{ driver.phones.length > 0 ? driver.phones.join(', ') : DASH }}
        </dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-slate-500">Баланс</dt>
        <!-- Прочерк, а не ноль: счёта нет, потому что человек не в программе. -->
        <dd class="font-mono text-slate-700 tabular-nums">
          {{ driver.balance === null ? DASH : formatNumber(driver.balance) }}
        </dd>
      </div>
    </dl>
  </article>
</template>
