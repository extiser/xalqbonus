<script setup lang="ts">
import type { Mailing } from '#shared/types/mailing';

/**
 * Что ушло водителям — у запущенной рассылки, где править уже нечего.
 *
 * Тексты показываются как набраны, с переносами строк: так их увидит водитель в Telegram.
 */
defineProps<{
  mailing: Mailing;
}>();
</script>

<template>
  <MoleculesSectionPanel title="Сообщение">
    <div class="flex flex-wrap items-start gap-6">
      <MoleculesProductPhoto
        v-if="mailing.photoPath"
        :photo-path="mailing.photoPath"
        :updated-at="mailing.updatedAt"
        :name="mailing.title"
        size="large"
      />
      <div class="min-w-64 flex-1 space-y-4">
        <div>
          <p class="text-xs text-slate-500">на русском</p>
          <p class="mt-1 text-sm whitespace-pre-line text-slate-900">{{ mailing.textRu }}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">на узбекском</p>
          <p v-if="mailing.textUz" class="mt-1 text-sm whitespace-pre-line text-slate-900">
            {{ mailing.textUz }}
          </p>
          <p v-else class="mt-1 text-sm text-slate-500">не задан — узбекоязычные получили русский</p>
        </div>
        <p class="text-xs text-slate-500">
          Фильтр:
          <template v-if="mailing.activeWithinDays">ездил за последние {{ mailing.activeWithinDays }} дн.</template>
          <template v-else>все участники программы</template>
        </p>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
