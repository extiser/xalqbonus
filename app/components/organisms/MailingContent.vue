<script setup lang="ts">
import type { Mailing } from '#shared/types/mailing';

/**
 * Что ушло водителям — у запущенной рассылки, где править уже нечего.
 *
 * Тексты показываются как набраны, с переносами строк: так их увидит водитель в Telegram.
 * Пустой язык подписан словом: рассылка уходит и на одном языке, любом, — всем адресатам
 * сразу (решение Руслана 15-09-2026, PR #149).
 *
 * Кому ушла и с каким опросом (issue #321) — названиями со ссылками: по ним идут смотреть
 * состав сегмента и сам опрос. Название — нынешнее, а не на момент запуска.
 */
defineProps<{
  mailing: Mailing;
}>();
</script>

<template>
  <MoleculesSectionPanel title="Сообщение">
    <dl class="mb-4 divide-y divide-slate-100">
      <MoleculesFactRow label="Кому">
        <NuxtLink
          v-if="mailing.segment"
          :to="`/segments/${mailing.segment.segmentId}`"
          class="underline underline-offset-2"
        >
          Сегмент «{{ mailing.segment.name }}»
        </NuxtLink>
        <template v-else>Все участники программы</template>
      </MoleculesFactRow>
      <MoleculesFactRow label="Опрос">
        <NuxtLink
          v-if="mailing.survey"
          :to="`/mailings/surveys/${mailing.survey.surveyId}`"
          class="underline underline-offset-2"
        >
          {{ mailing.survey.title ?? 'Без названия' }}
        </NuxtLink>
        <template v-else>Без опроса</template>
      </MoleculesFactRow>
    </dl>
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
          <p class="text-xs text-slate-500">на узбекском</p>
          <p v-if="mailing.textUz" class="mt-1 text-sm whitespace-pre-line text-slate-900">
            {{ mailing.textUz }}
          </p>
          <p v-else class="mt-1 text-sm text-slate-500">не задан — ушёл один русский текст</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">на русском</p>
          <p v-if="mailing.textRu" class="mt-1 text-sm whitespace-pre-line text-slate-900">
            {{ mailing.textRu }}
          </p>
          <p v-else class="mt-1 text-sm text-slate-500">не задан — ушёл один узбекский текст</p>
        </div>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
