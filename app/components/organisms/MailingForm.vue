<script setup lang="ts">
import { computed } from 'vue';
import type { AutosaveState } from '~/composables/useDraftAutosave';
import { formatNumber } from '~/utils/format';
import {
  buildMailingMessage,
  MAILING_CAPTION_MAX_LENGTH,
  MAILING_TEXT_MAX_LENGTH,
  mailingMessageLimit,
} from '#shared/mailing';
import type { Mailing, MailingAudienceResponse } from '#shared/types/mailing';
import type { LoadState } from '~/types/loadState';

/**
 * Форма черновика рассылки — тексты и фото на одном экране.
 *
 * **Черновик сохраняет себя сам** (issue #148): кнопки нет, рядом отметка «сохраняем…» или
 * «сохранено». Запускается то, что на экране: страница досохраняет набранное перед запуском.
 * Обязательных полей нет — черновик заводится первым символом, а чего не хватает для запуска,
 * страница называет у кнопки.
 *
 * **Фото — здесь же, рядом с текстом.** Подпись «если добавить фото, потолок станет 1 024»
 * стояла на экране, где добавить фото было негде; теперь поле под ней.
 *
 * Число адресатов показывается здесь же: сколько человек получит сообщение, сотрудник обязан
 * видеть до запуска. Считает страница — компонент данных не запрашивает
 * (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Предел и остаток форма считает сама, той же склейкой, что уйдёт в Telegram
 * (`shared/mailing.ts`), и пересчитывает потолок вместе с фото. Перебор — не отказ
 * сохранению: поля подсвечиваются, рядом сказано, на сколько длиннее; не пускает такое
 * сообщение запуск (issue #136, прогон 15-09-2026).
 *
 * Жёсткий предел у каждого текста свой и стоит `maxlength`: длиннее `sendMessage` Telegram
 * не примет ни в каком виде.
 */
const props = defineProps<{
  heading: string;
  /** Что правим. `null` — черновика ещё нет, он появится первым действием. */
  mailing: Mailing | null;
  autosaveState: AutosaveState;
  autosaveError: string | null;
  audienceState: LoadState;
  audience: MailingAudienceResponse | null;
  uploading: boolean;
  photoError: string | null;
}>();

const emit = defineEmits<{ upload: [file: File]; removePhoto: [] }>();

const title = defineModel<string>('title', { required: true });
const textRu = defineModel<string>('textRu', { required: true });
const textUz = defineModel<string>('textUz', { required: true });

const withPhoto = computed(() => props.mailing?.photoPath != null);
const limit = computed(() => mailingMessageLimit(withPhoto.value));
const length = computed(() => buildMailingMessage(textRu.value, textUz.value).text.length);
const remaining = computed(() => limit.value - length.value);
const tooLong = computed(() => remaining.value < 0);

/** Подсказка под полем фото — числа из `shared/mailing.ts`, а не вписанные руками. */
const photoNote = `Необязательно. С фото сообщение уходит подписью к нему — потолок ${formatNumber(MAILING_CAPTION_MAX_LENGTH)} знаков вместо ${formatNumber(MAILING_TEXT_MAX_LENGTH)}.`;
</script>

<template>
  <MoleculesSectionPanel :title="heading">
    <div class="space-y-4">
      <MoleculesFormField
        v-model="title"
        label="Заголовок"
        type="text"
        hint="Для списка рассылок. Водителю не уходит."
      />

      <MoleculesTextAreaField
        v-model="textRu"
        label="Текст на русском"
        :rows="6"
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
            Длиннее на {{ formatNumber(-remaining) }} — запустить нельзя, пока не сократите.
          </template>
          <template v-else>Осталось {{ formatNumber(remaining) }}.</template>
        </p>
        <p class="mt-0.5 text-xs text-slate-500">
          <template v-if="withPhoto">
            С фото сообщение уходит подписью к нему — потолок
            {{ formatNumber(MAILING_CAPTION_MAX_LENGTH) }} вместо {{ formatNumber(MAILING_TEXT_MAX_LENGTH) }}.
          </template>
          <template v-else>
            Без фото. Если добавить фото ниже, потолок станет {{ formatNumber(MAILING_CAPTION_MAX_LENGTH) }}.
          </template>
        </p>
      </div>

      <OrganismsPhotoField
        :photo-path="mailing?.photoPath ?? null"
        :updated-at="mailing?.updatedAt ?? ''"
        :name="title || 'Рассылка'"
        :uploading="uploading"
        :error="photoError"
        :note="photoNote"
        removable
        @upload="(file) => emit('upload', file)"
        @remove="emit('removePhoto')"
      />

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

      <MoleculesAutosaveStatus :state="autosaveState" :error="autosaveError" />
    </div>
  </MoleculesSectionPanel>
</template>
