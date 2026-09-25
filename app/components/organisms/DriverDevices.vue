<script setup lang="ts">
import type { DriverDevicesResponse } from '#shared/types/driver';
import type { LoadState } from '~/types/loadState';

/**
 * Устройства водителя в карточке (issue #223): с чего он открывал Mini App — со всех своих
 * Telegram-аккаунтов, и прошёл ли его браузер проверку движка.
 *
 * Строка — на сочетание аккаунта и строки браузера: обновился WebView или iOS — появляется
 * новая строка, а старая остаётся со своим последним входом. По ней и видно, что водитель
 * обновился.
 */
defineProps<{
  state: LoadState;
  data: DriverDevicesResponse | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Устройства"
    note="С чего водитель открывал приложение и прошёл ли его браузер проверку. Пишутся только входы с телефона, свежие — сверху."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем устройства…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Устройства не прочитались. Это отказ запроса, а не отсутствие входов."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.devices.length === 0"
      state="empty"
      message="Входов в приложение с телефона ещё не было"
    />
    <div v-else>
      <MoleculesDriverDeviceItem
        v-for="device in data.devices"
        :key="device.deviceId"
        :device="device"
      />
    </div>
  </MoleculesSectionPanel>
</template>
