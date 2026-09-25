<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GiftFields } from '~/types/rewardGrant';
import type { SelectOption } from '~/types/selectOption';
import type { ManualRewardRequestBody } from '#shared/types/rewards';

/**
 * Что вручается (issue #219): подарок-баллы, товар или своя награда.
 *
 * Баллы — всегда подарок с «Забрать»: водитель забирает их в приложении, а незабранное
 * зачисляется само в конце дня «Забрать до». Зачислить сразу — ручной правкой баллов
 * в карточке водителя. Сегменту вручаются только баллы; товар и своя награда — одному
 * водителю, с полями и правилами прежней выдачи из карточки (#172): офис, срок, пояснение.
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
}>();

const emit = defineEmits<{ gift: [fields: GiftFields]; reward: [body: ManualRewardRequestBody] }>();

type KindChoice = 'points' | 'product' | 'custom';

const kind = ref<KindChoice>('points');
const points = ref('');
const reason = ref('');
const untilDate = ref('');
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
    reason.value = '';
    productId.value = '';
    title.value = '';
    note.value = '';
  },
);

const fieldError = (field: string): string | null =>
  props.errorField === field ? props.error : null;

/** Отказ без поля формы — общей строкой под кнопкой. Получатель показывает свой отказ сам. */
const FORM_FIELDS = [
  'recipient',
  'points',
  'reason',
  'untilDate',
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
  if (kind.value === 'points') {
    emit('gift', { points: points.value, reason: reason.value.trim(), untilDate: untilDate.value });

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
          label="Сумма баллов"
          :min="1"
          required
          :error="fieldError('points')"
        />
        <div class="sm:col-span-2">
          <MoleculesFormField
            v-model="reason"
            label="Повод"
            type="text"
            placeholder="ко Дню учителя"
            required
            :error="fieldError('reason')"
            hint="Водитель увидит его в приложении и в сообщении: «Xalq Taxi · ко Дню учителя»."
          />
        </div>
      </div>
      <div class="max-w-xs">
        <MoleculesFormField
          v-model="untilDate"
          label="Забрать до"
          type="date"
          required
          :error="fieldError('untilDate')"
          hint="Не раньше завтра. Незабранное к концу этого дня зачислится само."
        />
      </div>
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
      <AtomsSubmitButton :label="saving ? 'Вручаем…' : 'Вручить'" :disabled="saving" />
      <p v-if="notice" class="text-sm font-medium text-emerald-700">{{ notice }}</p>
    </div>
    <p v-if="generalError" class="text-sm text-red-700">{{ generalError }}</p>
  </form>
</template>
