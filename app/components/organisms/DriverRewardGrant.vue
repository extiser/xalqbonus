<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SelectOption } from '~/types/selectOption';
import type { ManualRewardField, ManualRewardRequestBody } from '#shared/types/rewards';

/**
 * Ручная выдача награды водителю (issue #172): что выдаётся, где получать, сколько дней ждёт
 * и почему. Рядом с ручной правкой баллов и тем же правилом доступа.
 *
 * Поля зависят от вида: у баллов — сумма, и больше ничего — ни офиса, ни срока: баллы
 * зачисляются сразу и сгорать им нечему. У товара — товар, офис и срок; у произвольной —
 * название, офис и срок. Срок задаёт тот, кто выдаёт: сколько держать товар на полке, знает
 * парк, а не программа. Пояснение обязательно всегда — его видят сотрудник на стойке
 * и водитель в разделе наград.
 *
 * За данными компонент не ходит: набранное уходит наверх событием, отказ приходит свойством
 * вместе с полем (docs/frontend.md → «Данные в компоненты не ходят»).
 */
const props = defineProps<{
  officeOptions: SelectOption[];
  productOptions: SelectOption[];
  saving: boolean;
  error: string | null;
  errorField: ManualRewardField | null;
  /** Растёт с каждой удачной выдачей: форма очищается, чтобы её не отправили повторно. */
  appliedCount: number;
  /** Итог последней выдачи — «Выдано, код 57213». */
  notice: string | null;
}>();

const emit = defineEmits<{ submit: [body: ManualRewardRequestBody] }>();

type RewardKindChoice = 'points' | 'product' | 'custom';

const KIND_OPTIONS: SelectOption[] = [
  { value: 'product', label: 'Товар' },
  { value: 'custom', label: 'Своя награда' },
  { value: 'points', label: 'Баллы' },
];

const kind = ref<RewardKindChoice>('product');
const points = ref('');
const productId = ref('');
const title = ref('');
const officeId = ref('');
const lifetimeDays = ref('');
const note = ref('');

const kindModel = computed({
  get: () => kind.value,
  set: (value: string) => {
    kind.value = value === 'points' || value === 'custom' ? value : 'product';
  },
});

/** Ждёт ли награда в офисе: у баллов ни офиса, ни срока нет. */
const waitsInOffice = computed(() => kind.value !== 'points');

watch(
  () => props.appliedCount,
  () => {
    points.value = '';
    productId.value = '';
    title.value = '';
    note.value = '';
  },
);

const fieldError = (field: ManualRewardField): string | null =>
  props.errorField === field ? props.error : null;

const submit = (): void => {
  emit('submit', {
    kind: kind.value,
    points: kind.value === 'points' ? points.value : '',
    productId: kind.value === 'product' ? productId.value : '',
    title: kind.value === 'custom' ? title.value.trim() : '',
    officeId: waitsInOffice.value ? officeId.value : '',
    lifetimeDays: waitsInOffice.value ? lifetimeDays.value : '',
    note: note.value.trim(),
  });
};
</script>

<template>
  <MoleculesSectionPanel
    title="Выдать награду"
    note="Награда появится у водителя в разделе «Мои награды». Товар и своя награда ждут в офисе по коду до конца срока, товар на это время уходит в резерв. Баллы зачисляются сразу и встанут в истории строкой «ручная правка»."
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-slate-700">Что выдаётся</span>
          <AtomsSelectInput v-model="kindModel" :options="KIND_OPTIONS" />
        </label>

        <div v-if="kind === 'points'">
          <MoleculesNumberField
            v-model="points"
            label="Сумма баллов"
            :min="1"
            required
            :error="fieldError('points')"
          />
        </div>

        <label v-else-if="kind === 'product'" class="block sm:col-span-2">
          <span class="mb-1 block text-sm font-medium text-slate-700">Товар</span>
          <AtomsSelectInput v-model="productId" :options="productOptions" required>
            <option value="">Выберите товар</option>
          </AtomsSelectInput>
          <span v-if="fieldError('productId')" class="mt-1 block text-sm text-red-700">
            {{ fieldError('productId') }}
          </span>
        </label>

        <div v-else class="sm:col-span-2">
          <MoleculesFormField
            v-model="title"
            label="Что выдаётся"
            type="text"
            placeholder="сертификат на мойку"
            required
            :error="fieldError('title')"
          />
        </div>
      </div>

      <div v-if="waitsInOffice" class="grid gap-4 sm:grid-cols-3">
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

      <div class="flex flex-wrap items-center gap-3">
        <AtomsSubmitButton :label="saving ? 'Выдаём…' : 'Выдать'" :disabled="saving" />
        <p v-if="notice" class="text-sm font-medium text-emerald-700">{{ notice }}</p>
      </div>
      <p v-if="error && errorField === null" class="text-sm text-red-700">{{ error }}</p>
    </form>
  </MoleculesSectionPanel>
</template>
