<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GiftFields } from '~/types/rewardGrant';
import type { SelectOption } from '~/types/selectOption';
import { giftCustomMessageLimit, GIFT_FIELD_LABELS, GIFT_REASON_MAX_LENGTH } from '#shared/gift';
import type {
  GiftMessagePreviewRequestBody,
  GiftMessagePreviewResponse,
  ManualRewardRequestBody,
} from '#shared/types/rewards';

/**
 * Что вручается (issue #219): подарок-баллы, товар или своя награда.
 *
 * Баллы — всегда подарок с «Забрать»: водитель забирает их в приложении, а незабранное
 * зачисляется само в конце дня «Забрать до». Зачислить сразу — ручной правкой баллов
 * в карточке водителя. Сегменту вручаются только баллы; товар и своя награда — одному
 * водителю, с полями и правилами прежней выдачи из карточки (#172): офис, срок, пояснение.
 *
 * У подарка — свой текст сообщения и обложка на каждом языке (issue #236). Текст необязателен
 * на каждом языке сам по себе: над полем — системный текст, который уйдёт вместо пустого.
 * Обложки — обе или ни одной: выбрана одна — вторая обязательна, и «Вручить» гаснет до неё.
 *
 * За данными компонент не ходит: набранное уходит наверх событием, отказ приходит свойством
 * вместе с полем (docs/frontend.md → «Данные в компоненты не ходят»).
 */
const props = defineProps<{
  /** Сегменту — только баллы. */
  recipientKind: 'person' | 'segment';
  officeOptions: SelectOption[];
  productOptions: SelectOption[];
  saving: boolean;
  error: string | null;
  /** Поле, к которому относится отказ, — у подарка и у прежней выдачи свои. */
  errorField: string | null;
  /** Растёт с каждой удачной выдачей: форма очищается, чтобы её не отправили повторно. */
  appliedCount: number;
  /** Итог последней выдачи. */
  notice: string | null;
  /** Системный текст подарка по набранному — `draft` уходит наверх, текст приходит сюда. */
  messagePreview: GiftMessagePreviewResponse | null;
}>();

const emit = defineEmits<{
  gift: [fields: GiftFields];
  reward: [body: ManualRewardRequestBody];
  /** Сумма, повод и дата подарка, как набраны, — по ним собирается системный текст. */
  draft: [draft: GiftMessagePreviewRequestBody];
}>();

type KindChoice = 'points' | 'product' | 'custom';

const kind = ref<KindChoice>('points');
const points = ref('');
const reasonRu = ref('');
const reasonUz = ref('');
const untilDate = ref('');
const messageRu = ref('');
const messageUz = ref('');
const coverRu = ref<File | null>(null);
const coverUz = ref<File | null>(null);
const productId = ref('');
const title = ref('');
const officeId = ref('');
const lifetimeDays = ref('');
const note = ref('');

const kindOptions = computed<SelectOption[]>(() => [
  { value: 'points', label: 'Баллы в подарок' },
  ...(props.recipientKind === 'person'
    ? [
        { value: 'product', label: 'Товар' },
        { value: 'custom', label: 'Своя награда' },
      ]
    : []),
]);

const kindModel = computed({
  get: () => kind.value,
  set: (value: string) => {
    kind.value = value === 'product' || value === 'custom' ? value : 'points';
  },
});

// Сегменту товар не вручается: выбор сбрасывается на баллы, а не остаётся невидимым.
watch(
  () => props.recipientKind,
  (recipientKind) => {
    if (recipientKind === 'segment') {
      kind.value = 'points';
    }
  },
);

watch(
  () => props.appliedCount,
  () => {
    points.value = '';
    reasonRu.value = '';
    reasonUz.value = '';
    messageRu.value = '';
    messageUz.value = '';
    coverRu.value = null;
    coverUz.value = null;
    productId.value = '';
    title.value = '';
    note.value = '';
  },
);

/** Сумма из поля: пусто и не число — `null`, в системном тексте на её месте встанет подпись поля. */
const draftPoints = (): number | null => {
  const parsed = Number(points.value);

  return points.value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
};

watch(
  [points, reasonRu, reasonUz, untilDate],
  () => {
    emit('draft', {
      points: draftPoints(),
      reasonRu: reasonRu.value,
      reasonUz: reasonUz.value,
      untilDate: untilDate.value,
    });
  },
  { immediate: true },
);

/**
 * С обложками сообщение уходит подписью к фото, и потолок у него ниже. Выбрана хотя бы одна —
 * считаем по подписи: одна без другой всё равно не вручится.
 */
const withCover = computed(() => coverRu.value !== null || coverUz.value !== null);

const messageLimit = (footer: string | null): number | null =>
  footer === null ? null : giftCustomMessageLimit(footer, withCover.value);

/** Обложка на одном языке без другой — «Вручить» гаснет, пока не выбрана вторая. */
const coverPairIncomplete = computed(() => (coverRu.value === null) !== (coverUz.value === null));

const coverRuNote = computed(() =>
  coverRu.value === null && coverUz.value !== null ? 'Обязательна, раз загружена обложка на узбекском' : null,
);
const coverUzNote = computed(() =>
  coverUz.value === null && coverRu.value !== null ? 'Обязательна, раз загружена обложка на русском' : null,
);

const submitBlocked = computed(() => kind.value === 'points' && coverPairIncomplete.value);

const fieldError = (field: string): string | null =>
  props.errorField === field ? props.error : null;

/** Отказ без поля формы — общей строкой под кнопкой. Получатель показывает свой отказ сам. */
const FORM_FIELDS = [
  'recipient',
  'points',
  'reasonRu',
  'reasonUz',
  'untilDate',
  'messageRu',
  'messageUz',
  'coverRu',
  'coverUz',
  'kind',
  'productId',
  'title',
  'officeId',
  'lifetimeDays',
  'note',
];

const generalError = computed(() =>
  props.error && (props.errorField === null || !FORM_FIELDS.includes(props.errorField)) ? props.error : null,
);

const submit = (): void => {
  if (submitBlocked.value) {
    return;
  }

  if (kind.value === 'points') {
    emit('gift', {
      points: points.value,
      reasonRu: reasonRu.value.trim(),
      reasonUz: reasonUz.value.trim(),
      untilDate: untilDate.value,
      messageRu: messageRu.value.trim(),
      messageUz: messageUz.value.trim(),
      coverRu: coverRu.value,
      coverUz: coverUz.value,
    });

    return;
  }

  emit('reward', {
    kind: kind.value,
    productId: kind.value === 'product' ? productId.value : '',
    title: kind.value === 'custom' ? title.value.trim() : '',
    officeId: officeId.value,
    lifetimeDays: lifetimeDays.value,
    note: note.value.trim(),
  });
};
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <label class="block max-w-xs">
      <span class="mb-1 block text-sm font-medium text-slate-700">Что</span>
      <AtomsSelectInput v-model="kindModel" :options="kindOptions" />
    </label>

    <template v-if="kind === 'points'">
      <div class="grid gap-4 sm:grid-cols-3">
        <MoleculesNumberField
          v-model="points"
          :label="GIFT_FIELD_LABELS.points"
          :min="1"
          required
          :error="fieldError('points')"
        />
        <MoleculesFormField
          v-model="untilDate"
          :label="GIFT_FIELD_LABELS.untilDate"
          type="date"
          required
          :error="fieldError('untilDate')"
          hint="Не раньше завтра. Незабранное к концу этого дня зачислится само."
        />
      </div>

      <!-- Порядок языков — как у текстов рассылки: узбекский первым. -->
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <MoleculesTextAreaField
            v-model="reasonUz"
            :label="GIFT_FIELD_LABELS.reasonUz"
            :rows="2"
            placeholder="O'qituvchilar kuni munosabati bilan"
            required
            :maxlength="GIFT_REASON_MAX_LENGTH"
            :invalid="fieldError('reasonUz') !== null || reasonUz.trim().length > GIFT_REASON_MAX_LENGTH"
          />
          <MoleculesLengthCounter :length="reasonUz.trim().length" :limit="GIFT_REASON_MAX_LENGTH" />
          <p v-if="fieldError('reasonUz')" class="mt-1 text-sm text-red-700">{{ fieldError('reasonUz') }}</p>
        </div>
        <div>
          <MoleculesTextAreaField
            v-model="reasonRu"
            :label="GIFT_FIELD_LABELS.reasonRu"
            :rows="2"
            placeholder="ко Дню учителя"
            required
            :maxlength="GIFT_REASON_MAX_LENGTH"
            :invalid="fieldError('reasonRu') !== null || reasonRu.trim().length > GIFT_REASON_MAX_LENGTH"
          />
          <MoleculesLengthCounter :length="reasonRu.trim().length" :limit="GIFT_REASON_MAX_LENGTH" />
          <p v-if="fieldError('reasonRu')" class="mt-1 text-sm text-red-700">{{ fieldError('reasonRu') }}</p>
        </div>
      </div>
      <p class="text-sm text-slate-500">
        Оба обязательны. Короткой строкой: водитель видит повод на своём языке в карточке подарка
        и в сообщении — «Xalq Taxi · ко Дню учителя».
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <MoleculesGiftMessageField
          v-model="messageUz"
          label="Текст сообщения на узбекском"
          :system-text="messagePreview?.systemUz ?? null"
          :footer="messagePreview?.footerUz ?? null"
          :limit="messageLimit(messagePreview?.footerUz ?? null)"
          :error="fieldError('messageUz')"
        />
        <MoleculesGiftMessageField
          v-model="messageRu"
          label="Текст сообщения на русском"
          :system-text="messagePreview?.systemRu ?? null"
          :footer="messagePreview?.footerRu ?? null"
          :limit="messageLimit(messagePreview?.footerRu ?? null)"
          :error="fieldError('messageRu')"
        />
      </div>
      <p class="text-sm text-slate-500">
        Необязательно. Водителю уходит текст на языке его профиля: свой — если написан, иначе
        системный.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <MoleculesGiftCoverField
          v-model="coverUz"
          label="Обложка на узбекском"
          :required-note="coverUzNote"
          :error="fieldError('coverUz')"
        />
        <MoleculesGiftCoverField
          v-model="coverRu"
          label="Обложка на русском"
          :required-note="coverRuNote"
          :error="fieldError('coverRu')"
        />
      </div>
      <p class="text-sm text-slate-500">
        Необязательно, но обе или ни одной — можно одну и ту же картинку. С обложкой сообщение
        водителю уходит фото с подписью; в приложении обложка видна в рамке 16:9, края обрезаются.
      </p>
    </template>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-3">
        <label v-if="kind === 'product'" class="block sm:col-span-3">
          <span class="mb-1 block text-sm font-medium text-slate-700">Товар</span>
          <AtomsSelectInput v-model="productId" :options="productOptions" required>
            <option value="">Выберите товар</option>
          </AtomsSelectInput>
          <span v-if="fieldError('productId')" class="mt-1 block text-sm text-red-700">
            {{ fieldError('productId') }}
          </span>
        </label>

        <div v-else class="sm:col-span-3">
          <MoleculesFormField
            v-model="title"
            label="Что выдаётся"
            type="text"
            placeholder="сертификат на мойку"
            required
            :error="fieldError('title')"
          />
        </div>

        <label class="block sm:col-span-2">
          <span class="mb-1 block text-sm font-medium text-slate-700">Где получать</span>
          <AtomsSelectInput v-model="officeId" :options="officeOptions" required>
            <option value="">Выберите офис</option>
          </AtomsSelectInput>
          <span v-if="fieldError('officeId')" class="mt-1 block text-sm text-red-700">
            {{ fieldError('officeId') }}
          </span>
        </label>
        <MoleculesNumberField
          v-model="lifetimeDays"
          label="Срок, дней"
          :min="1"
          required
          :error="fieldError('lifetimeDays')"
          hint="Не забрали за срок — награда сгорает."
        />
      </div>

      <MoleculesFormField
        v-model="note"
        label="Почему"
        type="text"
        placeholder="за помощь новичкам в офисе"
        required
        :error="fieldError('note')"
        hint="Обязательно: его видят сотрудник на стойке и водитель в разделе наград."
      />
    </template>

    <div class="flex flex-wrap items-center gap-3">
      <AtomsSubmitButton :label="saving ? 'Вручаем…' : 'Вручить'" :disabled="saving || submitBlocked" />
      <p v-if="notice" class="text-sm font-medium text-emerald-700">{{ notice }}</p>
    </div>
    <p v-if="generalError" class="text-sm text-red-700">{{ generalError }}</p>
  </form>
</template>
