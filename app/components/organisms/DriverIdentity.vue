<script setup lang="ts">
import type { DriverCardResponse } from '#shared/types/driver';
import { formatCalendarDate, formatDateTime } from '~/utils/format';
import { sourceLabel } from '~/utils/labels';

/**
 * Человек: номер удостоверения и то, чем он опознаётся.
 *
 * Номер ВУ — верхний уровень личности, и баланс принадлежит именно ему, а не учётке
 * в парке и не мессенджеру (docs/drivers.md). Прежние номера показываются вместе
 * с действующим: при перевыпуске номер меняется, и без истории вопрос «почему баланс
 * здесь» ответа не имеет.
 */
defineProps<{
  card: DriverCardResponse;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Человек"
    note="Личность водителя — номер удостоверения. Он не меняется при смене телефона, увольнении и перепривязке Telegram, и баланс принадлежит ему."
  >
    <MoleculesStateNotice
      v-if="!card.activeLicense"
      state="empty"
      message="Действующего номера удостоверения нет. Профиль без номера в реестр не заводится — такую строку надо разбирать."
    />
    <dl v-else class="divide-y divide-slate-100">
      <MoleculesFactRow label="Номер удостоверения" :value="card.activeLicense.numberRaw" mono />
      <MoleculesFactRow
        label="Нормализованный номер"
        :value="card.activeLicense.numberCanonical"
        hint="по нему идёт поиск и по нему склеиваются двойники"
        mono
      />
      <MoleculesFactRow label="Страна" :value="card.activeLicense.country" />
      <MoleculesFactRow
        label="Выдано"
        :value="formatCalendarDate(card.activeLicense.issueDate)"
        mono
      />
      <MoleculesFactRow
        label="Действует до"
        :value="formatCalendarDate(card.activeLicense.expirationDate)"
        mono
      />
      <MoleculesFactRow
        label="Увидено"
        :value="formatDateTime(card.activeLicense.observedAt)"
        :hint="`источник: ${sourceLabel(card.activeLicense.source)}`"
        mono
      />
      <MoleculesFactRow label="Идентификатор человека" :value="card.personId" mono />
      <MoleculesFactRow label="Заведён" :value="formatDateTime(card.createdAt)" mono />
    </dl>

    <div v-if="card.formerLicenses.length > 0" class="mt-4 border-t border-slate-200 pt-3">
      <h3 class="text-sm font-semibold text-slate-900">Прежние номера</h3>
      <p class="mt-0.5 text-xs text-slate-400">
        Перевыпуск закрывает строку, а не правит её: номер при этом меняется.
      </p>
      <dl class="mt-2 divide-y divide-slate-100">
        <MoleculesFactRow
          v-for="license in card.formerLicenses"
          :key="`${license.numberCanonical}:${license.observedAt}`"
          :label="license.numberRaw"
          :value="`закрыт ${formatDateTime(license.closedAt)}`"
          mono
        />
      </dl>
    </div>
  </MoleculesSectionPanel>
</template>
