<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatNumber } from '~/utils/format';
import {
  buildMailingMessage,
  MAILING_CAPTION_MAX_LENGTH,
  MAILING_TEXT_MAX_LENGTH,
  mailingMessageLimit,
} from '#shared/mailing';
import type { Mailing, MailingAudienceResponse, MailingRequestBody } from '#shared/types/mailing';
import type { LoadState } from '~/types/loadState';

/**
 * Форма рассылки — одна на заведение и правку черновика.
 *
 * Число адресатов показывается здесь же: сколько человек получит сообщение, сотрудник обязан
 * видеть до сохранения. Считает страница — компонент данных не запрашивает
 * (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Предел и остаток форма считает сама, той же склейкой, что уйдёт в Telegram
 * (`shared/mailing.ts`), и пересчитывает потолок вместе с фото. Перебор — не отказ
 * сохранению: черновик — рабочее состояние, и подрезать текст можно потом. Поэтому при
 * переборе поля подсвечиваются, рядом сказано, на сколько длиннее, а «Сохранить» работает;
 * не пускает такое сообщение запуск (issue #136, прогон 15-09-2026).
 *
 * Жёсткий предел у каждого текста свой и стоит `maxlength`: длиннее `sendMessage` Telegram
 * не примет ни в каком виде.
 */
const props = defineProps<{
  title: string;
  submitLabel: string;
  /** Что правим. `null` — заводим новую рассылку. */
  mailing: Mailing | null;
  saving: boolean;
  error: string | null;
  audienceState: LoadState;
  audience: MailingAudienceResponse | null;
}>();

const emit = defineEmits<{ submit: [body: MailingRequestBody] }>();

const mailingTitle = ref('');
const textRu = ref('');
const textUz = ref('');

watch(
  () => props.mailing,
  (mailing) => {
    mailingTitle.value = mailing?.title ?? '';
    textRu.value = mailing?.textRu ?? '';
    textUz.value = mailing?.textUz ?? '';
  },
  { immediate: true },
);

const withPhoto = computed(() => props.mailing?.photoPath != null);
const limit = computed(() => mailingMessageLimit(withPhoto.value));
const length = computed(() => buildMailingMessage(textRu.value, textUz.value).text.length);
const remaining = computed(() => limit.value - length.value);
const tooLong = computed(() => remaining.value < 0);

const submit = (): void => {
  emit('submit', { title: mailingTitle.value, textRu: textRu.value, textUz: textUz.value });
};
</script>

<template>
  <MoleculesSectionPanel :title="title">
    <form class="space-y-4" @submit.prevent="submit">
      <MoleculesFormField
        v-model="mailingTitle"
        label="Заголовок"
        type="text"
        required
        hint="Для списка рассылок. Водителю не уходит."
      />

      <MoleculesTextAreaField
        v-model="textRu"
        label="Текст на русском"
        :rows="6"
        required
        :maxlength="MAILING_TEXT_MAX_LENGTH"
        :invalid="tooLong"
      />
      <MoleculesTextAreaField
        v-model="textUz"
        label="Текст на узбекском"
        :rows="6"
        :maxlength="MAILING_TEXT_MAX_LENGTH"
        :invalid="tooLong"
        hint="Необязательно. С узбекским оба текста уходят одним сообщением, каждый под заголовком языка; без него — один русский, без заголовков."
      />

      <div class="rounded-md px-3 py-2 text-sm" :class="tooLong ? 'bg-red-50' : 'bg-slate-50'">
        <p :class="tooLong ? 'text-red-700' : 'text-slate-700'">
          Сообщение с заголовками языков:
          <span class="font-semibold tabular-nums">{{ formatNumber(length) }}</span>
          из {{ formatNumber(limit) }} знаков.
          <template v-if="tooLong">
            Длиннее на {{ formatNumber(-remaining) }} — сохранить можно, запустить нельзя, пока
            не сократите.
          </template>
          <template v-else>Осталось {{ formatNumber(remaining) }}.</template>
        </p>
        <p class="mt-0.5 text-xs text-slate-500">
          <template v-if="withPhoto">
            С фото сообщение уходит подписью к нему — потолок
            {{ formatNumber(MAILING_CAPTION_MAX_LENGTH) }} вместо {{ formatNumber(MAILING_TEXT_MAX_LENGTH) }}.
          </template>
          <template v-else>
            Без фото. Если добавить фото, потолок станет {{ formatNumber(MAILING_CAPTION_MAX_LENGTH) }}.
          </template>
        </p>
      </div>

      <div class="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <p v-if="audienceState === 'loading'" class="text-slate-500">Считаем адресатов…</p>
        <p v-else-if="audienceState === 'error' || !audience" class="text-red-700">
          Адресатов посчитать не вышло. Это отказ запроса, а не пустая аудитория.
        </p>
        <p v-else class="text-slate-700">
          Адресатов сейчас:
          <span class="font-semibold text-slate-900">{{ formatNumber(audience.total) }}</span> — все
          участники программы с привязанным Telegram.
          <template v-if="audience.notificationsDisabled > 0">
            Из них {{ formatNumber(audience.notificationsDisabled) }} отключили уведомления — будут
            в счётчике, но сообщения не получат.
          </template>
        </p>
      </div>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

      <AtomsSubmitButton :label="submitLabel" :disabled="saving" />
    </form>
  </MoleculesSectionPanel>
</template>
