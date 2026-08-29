<script setup lang="ts">
import { computed } from 'vue';
import type { DriverParkProfile } from '#shared/types/driver';
import { DASH, formatCalendarDate, formatDateTime, formatNumber } from '~/utils/format';
import { currentStatusLabel, employmentTypeLabel, workStatusLabel } from '~/utils/labels';

/**
 * Одна учётка человека в парке.
 *
 * Учётка — не личность: при переоформлении в парке у того же человека появляется вторая,
 * с другим `profile_id`, и поездки писались на обе. Показываются все, потому что именно
 * из них складывается один баланс (docs/drivers.md).
 */
const props = defineProps<{
  profile: DriverParkProfile;
}>();

const activePhones = computed(() =>
  props.profile.phones.filter((phone) => phone.closedAt === null),
);

const closedPhones = computed(() =>
  props.profile.phones.filter((phone) => phone.closedAt !== null),
);

const fullName = computed(() =>
  [props.profile.lastName, props.profile.firstName, props.profile.middleName]
    .filter((part): part is string => Boolean(part))
    .join(' '),
);
</script>

<template>
  <article class="rounded-lg border border-slate-200 bg-white px-4 py-3">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h3 class="text-sm font-semibold text-slate-900">{{ fullName }}</h3>
      <AtomsStatusBadge
        :tone="profile.workStatus === 'working' ? 'ok' : 'muted'"
        :label="workStatusLabel(profile.workStatus)"
      />
      <span class="text-xs text-slate-400">{{ employmentTypeLabel(profile.employmentType) }}</span>
    </div>

    <dl class="mt-2 divide-y divide-slate-100">
      <MoleculesFactRow label="Учётка в парке" :value="profile.profileId" mono />
      <MoleculesFactRow label="Принят" :value="formatCalendarDate(profile.hireDate)" mono />
      <MoleculesFactRow label="Уволен" :value="formatCalendarDate(profile.fireDate)" mono />
      <MoleculesFactRow
        label="Статус на линии"
        :value="currentStatusLabel(profile.currentStatus)"
        :hint="`обновлён ${formatDateTime(profile.currentStatusUpdatedAt)}`"
      />
      <MoleculesFactRow label="Условие работы" :value="profile.workRuleName" />
      <MoleculesFactRow label="Позывной" :value="profile.callsign" mono />
      <MoleculesFactRow
        label="Машина"
        :value="profile.carNumber"
        :hint="profile.carBrandModel ?? undefined"
        mono
      />
      <MoleculesFactRow
        label="Поездок в базе"
        :value="formatNumber(profile.tripsTotal)"
        :hint="`последняя ${formatDateTime(profile.lastTripEndedAt)}`"
        mono
      />
      <MoleculesFactRow
        label="Телефоны"
        :value="activePhones.map((phone) => phone.phoneRaw).join(', ') || DASH"
        :hint="
          closedPhones.length > 0
            ? `прежние: ${closedPhones.map((phone) => phone.phoneRaw).join(', ')}`
            : undefined
        "
        mono
      />
      <MoleculesFactRow
        label="Синхронизирован"
        :value="formatDateTime(profile.lastSyncedAt)"
        :hint="`впервые увиден ${formatDateTime(profile.firstSeenAt)}`"
        mono
      />
    </dl>
  </article>
</template>
