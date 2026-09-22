<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DASH, formatNumber, formatShare, pluralize } from '~/utils/format';
import type { SelectOption } from '~/types/selectOption';
import { CAMPAIGN_PRIZES_LOCKED_TEXT, campaignChestLabel, isDrawnChest } from '#shared/campaign';
import type {
  CampaignChestKind,
  CampaignChestPrizes,
  CampaignPrize,
  CampaignPrizeRequestRow,
  CampaignPrizesRequestBody,
} from '#shared/types/campaign';
import type { RewardKind } from '#shared/types/rewards';

/**
 * Призы сундуков акции (issue #180): три сундука, в каждом — варианты приза.
 *
 * У сундука дня варианты разыгрываются по весу, и рядом с весом стоит доля процентом от суммы
 * весов сундука: веса набираются числами, а думает про них человек процентами, и «70 / 20 / 8 / 2»
 * должно читаться с экрана без калькулятора. У сундуков трёх дней и недели вариант один,
 * и веса нет вовсе: делить нечего.
 *
 * Набор сохраняется одним действием и целиком — не сам по себе, как поля черновика: между
 * правками одной строки веса сундука не сходятся, и промежуточный набор сохранять незачем.
 *
 * У не черновика раздел только на чтение, с причиной. За данными компонент не ходит: набор
 * приходит свойством, сохранение уходит событием (docs/frontend.md → «Данные в компоненты
 * не ходят»).
 */
const props = defineProps<{
  chests: CampaignChestPrizes[];
  editable: boolean;
  /** Опубликованные товары не в архиве; призы помечены. */
  productOptions: SelectOption[];
  saving: boolean;
  error: string | null;
  /** Итог последнего сохранения — «Призы сохранены». */
  notice: string | null;
}>();

const emit = defineEmits<{ save: [body: CampaignPrizesRequestBody] }>();

const KIND_OPTIONS: SelectOption[] = [
  { value: 'product', label: 'Товар' },
  { value: 'custom', label: 'Своя награда' },
  { value: 'points', label: 'Баллы' },
];

const KIND_LABEL: Record<RewardKind, string> = {
  product: 'Товар',
  custom: 'Своя награда',
  points: 'Баллы',
};

/** Строка правки — строками, как набраны в полях. `key` — только для списка на экране. */
type PrizeDraft = {
  key: number;
  kind: RewardKind;
  weight: string;
  points: string;
  productId: string;
  title: string;
};

type ChestDraft = { chest: CampaignChestKind; rows: PrizeDraft[] };

let keySequence = 0;

const toDraftRow = (prize: CampaignPrize): PrizeDraft => ({
  key: ++keySequence,
  kind: prize.kind,
  weight: String(prize.weight),
  points: prize.points === null ? '' : String(prize.points),
  productId: prize.productId ?? '',
  title: prize.title ?? '',
});

const toDraft = (chests: CampaignChestPrizes[]): ChestDraft[] =>
  chests.map((chest) => ({ chest: chest.chest, rows: chest.prizes.map(toDraftRow) }));

const draft = ref<ChestDraft[]>(toDraft(props.chests));

// Пришёл набор с сервера — после сохранения или смены акции: правка начинается с него.
watch(
  () => props.chests,
  (chests) => {
    draft.value = toDraft(chests);
  },
);

/** Строка в тело: поля не своего вида уходят пустыми, вес фиксированного сундука — тоже. */
const toRequestRow = (chest: CampaignChestKind, row: PrizeDraft): CampaignPrizeRequestRow => ({
  chest,
  kind: row.kind,
  weight: isDrawnChest(chest) ? row.weight : '',
  points: row.kind === 'points' ? row.points : '',
  productId: row.kind === 'product' ? row.productId : '',
  title: row.kind === 'custom' ? row.title.trim() : '',
});

const toRequestBody = (chests: ChestDraft[]): CampaignPrizesRequestBody => ({
  prizes: chests.flatMap((chest) => chest.rows.map((row) => toRequestRow(chest.chest, row))),
});

/** Есть ли несохранённые правки: запуск читает сохранённый набор, а не экран. */
const dirty = computed(
  () =>
    JSON.stringify(toRequestBody(draft.value)) !==
    JSON.stringify(toRequestBody(toDraft(props.chests))),
);

const addRow = (chest: ChestDraft): void => {
  chest.rows.push({ key: ++keySequence, kind: 'product', weight: '', points: '', productId: '', title: '' });
};

const setKind = (row: PrizeDraft, value: string): void => {
  row.kind = value === 'points' || value === 'custom' ? value : 'product';
};

const removeRow = (chest: ChestDraft, key: number): void => {
  chest.rows = chest.rows.filter((row) => row.key !== key);
};

/** Добавить вариант: у сундука дня — сколько угодно, у фиксированного — пока пусто. */
const canAdd = (chest: ChestDraft): boolean => isDrawnChest(chest.chest) || chest.rows.length === 0;

/** Вес строки числом. Не набран или не число — ноль: в долю такая строка не идёт. */
const weightOf = (row: PrizeDraft): number => {
  const weight = Number(row.weight);

  return Number.isInteger(weight) && weight > 0 ? weight : 0;
};

const totalWeight = (rows: PrizeDraft[]): number =>
  rows.reduce((sum, row) => sum + weightOf(row), 0);

const savedTotalWeight = (prizes: CampaignPrize[]): number =>
  prizes.reduce((sum, prize) => sum + prize.weight, 0);

/**
 * Товары для выбора. Товар варианта, ушедший из выдаваемых после заведения, остаётся в списке
 * с пометкой: иначе поле показало бы пустой выбор, хотя в наборе товар записан.
 */
const productOptionsWithSaved = computed<SelectOption[]>(() => {
  const options = new Map(props.productOptions.map((option) => [option.value, option]));

  for (const prize of props.chests.flatMap((chest) => chest.prizes)) {
    if (prize.productId !== null && !options.has(prize.productId)) {
      options.set(prize.productId, {
        value: prize.productId,
        label: `${prize.productName ?? 'Товар'} (не выдаётся)`,
      });
    }
  }

  return [...options.values()];
});

/** Значение варианта словами — для раздела на чтение. */
const prizeValue = (prize: CampaignPrize): string => {
  if (prize.kind === 'points') {
    return prize.points === null
      ? DASH
      : `${formatNumber(prize.points)} ${pluralize(prize.points, 'балл', 'балла', 'баллов')}`;
  }

  if (prize.kind === 'product') {
    const name = prize.productName ?? DASH;

    return prize.productUnavailable ? `${name} (не выдаётся)` : name;
  }

  return prize.title ?? DASH;
};

const chestNote = (chest: CampaignChestKind): string =>
  isDrawnChest(chest)
    ? 'Разыгрывается по весу: доля варианта — его вес от суммы весов сундука.'
    : 'Приз фиксированный: вариант один, розыгрыша нет.';

const submit = (): void => {
  emit('save', toRequestBody(draft.value));
};
</script>

<template>
  <MoleculesSectionPanel
    title="Призы"
    :note="
      editable
        ? 'Что выпадает из сундуков акции. Выдаётся ровно то, что заведено здесь; пока хоть один сундук пуст, акция не запускается. Остаток на складе не проверяется: резерв случается при выдаче.'
        : CAMPAIGN_PRIZES_LOCKED_TEXT
    "
  >
    <form v-if="editable" class="space-y-6" @submit.prevent="submit">
      <fieldset v-for="chest in draft" :key="chest.chest" class="space-y-3">
        <legend class="text-sm font-semibold text-slate-900">{{ campaignChestLabel(chest.chest) }}</legend>
        <p class="text-sm text-slate-500">{{ chestNote(chest.chest) }}</p>

        <p v-if="chest.rows.length === 0" class="text-sm text-red-700">
          Вариантов нет — с пустым сундуком акция не запустится.
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-slate-500">
              <tr>
                <th class="py-2 pr-3 font-medium">Вид</th>
                <th class="py-2 pr-3 font-medium">Что выпадает</th>
                <template v-if="isDrawnChest(chest.chest)">
                  <th class="w-24 py-2 pr-3 font-medium">Вес</th>
                  <th class="w-20 py-2 pr-3 font-medium">Доля</th>
                </template>
                <th class="py-2 font-medium"><span class="sr-only">Удалить</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in chest.rows" :key="row.key" class="border-t border-slate-200 align-top">
                <td class="w-40 py-2 pr-3">
                  <AtomsSelectInput
                    :model-value="row.kind"
                    :options="KIND_OPTIONS"
                    aria-label="Вид приза"
                    @update:model-value="setKind(row, $event)"
                  />
                </td>
                <td class="min-w-56 py-2 pr-3">
                  <AtomsNumberInput
                    v-if="row.kind === 'points'"
                    v-model="row.points"
                    :min="1"
                    required
                    aria-label="Сумма баллов"
                    placeholder="сумма баллов"
                  />
                  <AtomsSelectInput
                    v-else-if="row.kind === 'product'"
                    v-model="row.productId"
                    :options="productOptionsWithSaved"
                    aria-label="Товар"
                    required
                  >
                    <option value="">Выберите товар</option>
                  </AtomsSelectInput>
                  <AtomsTextInput
                    v-else
                    v-model="row.title"
                    type="text"
                    aria-label="Название награды"
                    placeholder="сертификат на мойку"
                    required
                  />
                </td>
                <template v-if="isDrawnChest(chest.chest)">
                  <td class="py-2 pr-3">
                    <AtomsNumberInput v-model="row.weight" :min="1" required aria-label="Вес" />
                  </td>
                  <td class="py-2 pr-3 pt-3.5 whitespace-nowrap tabular-nums text-slate-900">
                    {{ weightOf(row) > 0 ? formatShare(weightOf(row), totalWeight(chest.rows)) : DASH }}
                  </td>
                </template>
                <td class="py-2 text-right">
                  <AtomsActionButton label="Удалить" tone="danger" @click="removeRow(chest, row.key)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AtomsActionButton v-if="canAdd(chest)" label="Добавить вариант" @click="addRow(chest)" />
      </fieldset>

      <div class="flex flex-wrap items-center gap-3">
        <AtomsSubmitButton :label="saving ? 'Сохраняем…' : 'Сохранить призы'" :disabled="saving || !dirty" />
        <p v-if="dirty" class="text-sm text-amber-700">
          Есть несохранённые правки — запуск их не увидит.
        </p>
        <p v-else-if="notice" class="text-sm font-medium text-emerald-700">{{ notice }}</p>
      </div>
      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </form>

    <div v-else class="space-y-6">
      <section v-for="chest in chests" :key="chest.chest" class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-900">{{ campaignChestLabel(chest.chest) }}</h3>
        <p v-if="chest.prizes.length === 0" class="text-sm text-slate-500">Вариантов нет.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-slate-500">
              <tr>
                <th class="py-2 pr-4 font-medium">Вид</th>
                <th class="py-2 pr-4 font-medium">Что выпадает</th>
                <template v-if="isDrawnChest(chest.chest)">
                  <th class="py-2 pr-4 font-medium">Вес</th>
                  <th class="py-2 font-medium">Доля</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prize in chest.prizes" :key="prize.prizeId" class="border-t border-slate-200">
                <td class="py-2 pr-4 text-slate-600">{{ KIND_LABEL[prize.kind] }}</td>
                <td class="py-2 pr-4 text-slate-900">{{ prizeValue(prize) }}</td>
                <template v-if="isDrawnChest(chest.chest)">
                  <td class="py-2 pr-4 tabular-nums text-slate-900">{{ formatNumber(prize.weight) }}</td>
                  <td class="py-2 tabular-nums text-slate-900">
                    {{ formatShare(prize.weight, savedTotalWeight(chest.prizes)) }}
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </MoleculesSectionPanel>
</template>
