<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DriverDevice } from '#shared/types/driver';
import { formatDateTime, formatMomentDate, formatNumber } from '~/utils/format';
import { clientEngineLabel, clientPlatformLabel } from '~/utils/labels';

/**
 * Одно устройство в карточке водителя (issue #223): с чего он открывал Mini App и прошёл ли
 * его браузер проверку движка.
 *
 * Строка отвечает водителю, позвонившему с «у меня белый экран»: платформа и версии говорят,
 * что обновлять, а «браузер устарел» — что проверка его остановила. Строка браузера целиком —
 * по раскрытию: по ней разбирают то, чего не разобрал сервер.
 */
const props = defineProps<{
  device: DriverDevice;
}>();

const expanded = ref(false);

/** «Android 9», «iOS 16.3»; версии нет — только платформа. */
const system = computed(() => {
  const platform = clientPlatformLabel(props.device.platform);

  return props.device.osVersion === null ? platform : `${platform} ${props.device.osVersion}`;
});

/** «WebView 87», «Safari 16». Версия не разобралась — движок не называется. */
const engine = computed(() => {
  const label = clientEngineLabel(props.device.platform);

  return label === null || props.device.engineVersion === null
    ? null
    : `${label} ${props.device.engineVersion}`;
});

const telegram = computed(() =>
  props.device.botApiVersion === null ? null : `Telegram (Bot API) ${props.device.botApiVersion}`,
);

const versions = computed(() =>
  [engine.value, telegram.value].filter((part): part is string => part !== null).join(' · '),
);
</script>

<template>
  <article class="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-sm font-medium text-slate-900">{{ system }}</span>
      <span v-if="versions !== ''" class="text-sm text-slate-700">{{ versions }}</span>
      <AtomsStatusBadge v-if="!device.engineOk" tone="alarm" label="браузер устарел" />
    </div>

    <p class="mt-1 text-sm text-slate-700">
      последний вход {{ formatDateTime(device.lastSeenAt) }} · входов:
      {{ formatNumber(device.visits) }} · впервые {{ formatMomentDate(device.firstSeenAt) }}
    </p>

    <div class="mt-1">
      <AtomsDisclosureButton
        label="Строка браузера"
        :expanded="expanded"
        @toggle="expanded = !expanded"
      />
    </div>
    <p v-if="expanded" class="mt-1 font-mono text-xs break-all text-slate-700">
      {{ device.userAgent === '' ? 'пустая' : device.userAgent }}
    </p>
  </article>
</template>
