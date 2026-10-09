<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { PhWarningCircle } from '@phosphor-icons/vue';
import { endSentence, formatCompactSum, formatNumber, formatTenths } from '~/utils/format';
import { formatMonthTitle, monthForms, shiftMonth } from '#shared/monthNames';
import { hireCostPerHired, hirePaybackOf, type HireCostField } from '#shared/hireCost';
import { pluralize } from '#shared/numberFormat';
import type { SelectOption } from '~/types/selectOption';

/**
 * Форма окна «Расходы на найм» плитки «Окупается ли найм» (issue #445) —
 * `_reference/design/web/dashboard/03-depth-hire-dialog.html`. Ставится в `MoleculesWebDialog`.
 *
 * Два поля — сумма за месяц и месяц, с которого она действует, — и расчёт под ними по месяцу
 * из «Действует с»: нанятые этого месяца — из `hiredByMonth`, доход с нанятого — тот же, что
 * на плитке. Считается здесь, без запроса, той же функцией, что окупаемость плитки на сервере.
 *
 * Формы по кодексу (`docs/frontend.md` → «Обязательное поле — свойство поля»): `novalidate`
 * и своей проверки нет — ошибки присылает сервер по полю (`fieldErrors`), первое поле с ошибкой
 * получает фокус, правка поля снимает его ошибку (`edit`). Ошибка не про поле — плашкой над
 * полями, введённое не теряется.
 *
 * Сумма вводится цифрами, разряды встают сами. Запросов форма не делает: значения уходят
 * событием `submit`; пустая сумма уходит `null` — отказ про неё скажет сервер.
 */
export type HireCostFormValues = {
  month: string;
  amount: number | null;
};

const props = defineProps<{
  initialMonth: string;
  initialAmount: number | null;
  /** Месяцы «Действует с»: от первого месяца дашборда по месяц плитки. */
  firstMonth: string;
  lastMonth: string;
  hiredByMonth: { month: string; hired: number }[];
  /** Доход с нанятого за год, сум; `null` — цифр нет, вторую половину расчёта не пишем. */
  valuePerHired: number | null;
  fieldErrors: Partial<Record<HireCostField, string>>;
  formError: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  submit: [values: HireCostFormValues];
  cancel: [];
  edit: [field: HireCostField];
}>();

/** Больше цифр сумма не бывает: дальше число теряет точность, а сумов столько не тратят. */
const AMOUNT_MAX_DIGITS = 15;

const digitsOf = (text: string): string => text.replace(/\D/g, '').slice(0, AMOUNT_MAX_DIGITS);

const amountText = ref(props.initialAmount === null ? '' : formatNumber(props.initialAmount));
const month = ref(props.initialMonth);

const amount = computed((): number | null => {
  const digits = digitsOf(amountText.value);

  return digits === '' ? null : Number(digits);
});

// Разряды встают по мере ввода; правка поля снимает его ошибку.
watch(amountText, (text) => {
  const formatted = amount.value === null ? '' : formatNumber(amount.value);

  if (formatted !== text) amountText.value = formatted;
  emit('edit', 'amount');
});

watch(month, () => emit('edit', 'month'));

const monthOptions = computed((): SelectOption[] => {
  const options: SelectOption[] = [];

  for (let item = props.lastMonth; item >= props.firstMonth; item = shiftMonth(item, -1)) {
    options.push({ value: item, label: formatMonthTitle(item) });
  }

  return options;
});

/** Расчёт под полями: нанятых в месяце нет — или стоимость одного и окупаемость, числами для экрана. */
type HireCostCalc =
  | { kind: 'noHired'; monthWord: string }
  | {
      kind: 'cost';
      monthWord: string;
      sum: string;
      hired: string;
      perHired: string;
      /** Доход с нанятого и окупаемость; цифр дохода нет — `null`, вторую фразу не пишем. */
      payback: { value: string; times: string } | null;
    };

/** «Найм одного в сентябре: …» — по месяцу из «Действует с»; суммы нет — строки нет. */
const calc = computed((): HireCostCalc | null => {
  const sum = amount.value;

  if (sum === null || sum <= 0) return null;

  const monthWord = monthForms(month.value).prepositional;
  const hired = props.hiredByMonth.find((row) => row.month === month.value)?.hired ?? 0;
  const perHired = hireCostPerHired(sum, hired);

  if (perHired === null) return { kind: 'noHired', monthWord };

  const payback = props.valuePerHired === null ? null : hirePaybackOf(props.valuePerHired, sum, hired);

  return {
    kind: 'cost',
    monthWord,
    sum: formatCompactSum(sum),
    hired: `${formatNumber(hired)} ${pluralize(hired, 'нанятого', 'нанятых', 'нанятых')}`,
    perHired: formatCompactSum(perHired),
    payback:
      props.valuePerHired === null || payback === null
        ? null
        : { value: formatCompactSum(props.valuePerHired), times: `${formatTenths(payback)} раза` },
  };
});

const amountField = ref<{ focus: () => void } | null>(null);
const monthField = ref<{ focus: () => void } | null>(null);

/** Порядок полей на форме — в нём ищется первое поле с ошибкой. */
const FIELD_ORDER: readonly HireCostField[] = ['amount', 'month'];

watch(
  () => props.fieldErrors,
  async (errors) => {
    const first = FIELD_ORDER.find((field) => errors[field] !== undefined);

    if (first === undefined) return;

    await nextTick();
    (first === 'amount' ? amountField : monthField).value?.focus();
  },
);

const submit = (): void => {
  emit('submit', { month: month.value, amount: amount.value });
};
</script>

<template>
  <form novalidate class="mt-1" @submit.prevent="submit">
    <p
      v-if="formError"
      role="alert"
      class="m-0 mt-5 flex items-start gap-2 rounded-[14px] bg-web-scarlet/10 px-4 py-3 font-manrope text-[14px] leading-[1.45] font-medium text-web-scarlet inset-ring inset-ring-web-scarlet/40"
    >
      <PhWarningCircle weight="duotone" aria-hidden="true" class="mt-0.5 size-[18px] shrink-0" />{{ formError }}
    </p>

    <div class="mt-5">
      <MoleculesWebTextField
        ref="amountField"
        v-model="amountText"
        label="Сколько парк тратит на найм в месяц, сум"
        required
        autofocus
        hint="Всё, что уходит на привлечение водителей за месяц: реклама, бонусы за приход, работа менеджеров — как парк считает сам."
        :error="fieldErrors.amount ?? null"
      />
    </div>

    <div class="mt-5">
      <MoleculesWebSelectField
        ref="monthField"
        v-model="month"
        label="Действует с"
        required
        :options="monthOptions"
        hint="С этого месяца и дальше, пока не введёте новую сумму. Месяцы до него считаются по прежней записи."
        :error="fieldErrors.month ?? null"
      />
    </div>

    <p
      v-if="calc"
      aria-live="polite"
      class="m-0 mt-5 rounded-xl bg-web-cyan/4 px-3.5 py-3 font-manrope text-[13px] leading-[1.45] text-web-title"
    >
      <template v-if="calc.kind === 'noHired'">В {{ calc.monthWord }} нанятых нет — стоимость одного не посчитать</template>
      <template v-else>
        Найм одного в {{ calc.monthWord }}: {{ calc.sum }} ÷ {{ calc.hired }} =
        <b class="font-semibold text-web-text">{{ endSentence(calc.perHired) }}</b>
        <template v-if="calc.payback">
          Нанятый приносит за год {{ calc.payback.value }} — найм окупается
          <b class="font-semibold text-web-text">{{ calc.payback.times }}</b>.
        </template>
      </template>
    </p>

    <div class="mt-7 flex items-center justify-end gap-3">
      <AtomsWebActionButton label="Отмена" size="page" variant="quiet" @click="emit('cancel')" />
      <AtomsWebActionButton :label="submitting ? 'Сохраняем…' : 'Сохранить'" size="page" submit />
    </div>
  </form>
</template>
