<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatNumber } from '~/utils/format';
import {
  MAILING_ACTIVE_DAYS_MAX,
  MAILING_CAPTION_MAX_LENGTH,
  MAILING_TEXT_MAX_LENGTH,
} from '#shared/mailing';
import type { Mailing, MailingAudienceResponse, MailingRequestBody } from '#shared/types/mailing';
import type { LoadState } from '~/types/loadState';

/**
 * Форма рассылки — одна на заведение и правку черновика.
 *
 * Число адресатов показывается здесь же, под фильтром, и пересчитывается при его правке:
 * сколько человек получит сообщение, сотрудник обязан видеть до сохранения, а не узнать
 * из подтверждения запуска. Считает страница — компонент данных не запрашивает и только
 * сообщает наверх, какой фильтр набран (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Потолок текста зависит от фото: с фото текст становится подписью, а у подписи потолок
 * вчетверо ниже. Счётчик знаков под полем называет тот, что действует сейчас.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    submitLabel: string;
    /** Что правим. `null` — заводим новую рассылку. */
    mailing: Mailing | null;
    saving: boolean;
    error: string | null;
    audienceState: LoadState;
    audience: MailingAudienceResponse | null;
    /** Отказ подсчёта — например, негодное число дней. */
    audienceError: string | null;
  }>(),
  {},
);

const emit = defineEmits<{
  submit: [body: MailingRequestBody];
  /** Набранный фильтр — строкой, как в поле: пусто означает «все участники». */
  filter: [activeWithinDays: string];
}>();

const mailingTitle = ref('');
const textRu = ref('');
const textUz = ref('');
const activeWithinDays = ref('');

watch(
  () => props.mailing,
  (mailing) => {
    mailingTitle.value = mailing?.title ?? '';
    textRu.value = mailing?.textRu ?? '';
    textUz.value = mailing?.textUz ?? '';
    activeWithinDays.value =
      mailing?.activeWithinDays === null || mailing === null ? '' : String(mailing.activeWithinDays);
  },
  { immediate: true },
);

watch(activeWithinDays, (value) => emit('filter', value), { immediate: true });

const withPhoto = computed(() => props.mailing?.photoPath != null);
const limit = computed(() => (withPhoto.value ? MAILING_CAPTION_MAX_LENGTH : MAILING_TEXT_MAX_LENGTH));

const lengthHint = (value: string): string =>
  `${formatNumber(value.trim().length)} из ${formatNumber(limit.value)} знаков${withPhoto.value ? ' — с фото текст становится подписью' : ''}.`;

const submit = (): void => {
  emit('submit', {
    title: mailingTitle.value,
    textRu: textRu.value,
    textUz: textUz.value,
    activeWithinDays: activeWithinDays.value,
  });
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
        :hint="lengthHint(textRu)"
      />
      <MoleculesTextAreaField
        v-model="textUz"
        label="Текст на узбекском"
        :rows="6"
        :hint="`Необязательно: пустой — узбекоязычные получат русский. ${lengthHint(textUz)}`"
      />

      <MoleculesNumberField
        v-model="activeWithinDays"
        label="Ездил за последние, дней"
        :min="1"
        :max="MAILING_ACTIVE_DAYS_MAX"
        placeholder="все участники"
        hint="По завершённым поездкам. Пусто — все участники программы с привязанным Telegram."
      />

      <div class="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <p v-if="audienceError" class="text-red-700">{{ audienceError }}</p>
        <p v-else-if="audienceState === 'loading'" class="text-slate-500">Считаем адресатов…</p>
        <p v-else-if="audienceState === 'error' || !audience" class="text-red-700">
          Адресатов посчитать не вышло. Это отказ запроса, а не пустая аудитория.
        </p>
        <p v-else class="text-slate-700">
          Адресатов по фильтру сейчас:
          <span class="font-semibold text-slate-900">{{ formatNumber(audience.total) }}</span>.
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
