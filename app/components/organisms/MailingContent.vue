<script setup lang="ts">
import type { Mailing } from '#shared/types/mailing';

/**
 * Что ушло водителям — у запущенной рассылки, где править уже нечего.
 *
 * Тексты показываются как набраны, с переносами строк: так их увидит водитель в Telegram.
 * Пустой язык подписан словом: рассылка уходит и на одном языке, любом, — всем участникам
 * сразу (решение Руслана 15-09-2026, PR #149).
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
        :name="mailing.title ?? 'Рассылка'"
        size="large"
      />
      <div class="min-w-64 flex-1 space-y-4">
        <div>
          <p class="text-xs text-slate-500">на русском</p>
          <p v-if="mailing.textRu" class="mt-1 text-sm whitespace-pre-line text-slate-900">
            {{ mailing.textRu }}
          </p>
          <p v-else class="mt-1 text-sm text-slate-500">не задан — ушёл один узбекский текст</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">на узбекском</p>
          <p v-if="mailing.textUz" class="mt-1 text-sm whitespace-pre-line text-slate-900">
            {{ mailing.textUz }}
          </p>
          <p v-else class="mt-1 text-sm text-slate-500">не задан — ушёл один русский текст</p>
        </div>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
