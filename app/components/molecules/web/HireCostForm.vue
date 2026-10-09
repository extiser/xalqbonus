<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { PhWarningCircle } from '@phosphor-icons/vue';
import { endSentence, formatCompactSum, formatNumber, formatTenths } from '~/utils/format';
import { hiredCount, hiredWhen, noHiredText } from '~/utils/hirePayback';
import { monthForms, monthYear } from '#shared/monthNames';
import { hireCostPerHired, hirePaybackOf } from '#shared/hireCost';

/**
 * Форма окна «Расходы на найм» плитки «Окупается ли найм» (issue #445) —
 * `_reference/design/web/dashboard/03-depth-hire-dialog.html` без поля месяца. Ставится
 * в `MoleculesWebDialog`.
 *
 * Одно поле — сумма за месяц плитки: за закрытый — сколько потрачено, на идущий — бюджет. Под ним
 * расчёт по этому месяцу: нанятые и доход с нанятого — те же, что на плитке, стоимость одного
 * и окупаемость — той же функцией, что у сервера. Считается здесь, без запроса.
 *
 * Формы по кодексу (`docs/frontend.md` → «Обязательное поле — свойство поля»): `novalidate`
 * и своей проверки нет — отказ по сумме присылает сервер, он встаёт под поле, и поле получает
 * фокус; правка поля снимает его ошибку (`edit`). Отказ не про поле — и про месяц, поля для
 * которого здесь нет, — плашкой над полем, введённое не теряется.
 *
 * Сумма вводится цифрами, разряды встают сами. Запросов форма не делает: сумма уходит событием
 * `submit`; пустая уходит `null` — отказ про неё скажет сервер.
 */
const props = defineProps<{
  /** Месяц плитки `YYYY-MM`, за который сумма. */
  month: string;
  /** Месяц идёт: сумма — бюджет, нанятые — по вчера. */
  ongoing: boolean;
  /** Нанятых в месяце и последние посчитанные сутки, `YYYY-MM-DD`. */
  monthHired: number;
  monthHiredTo: string;
  initialAmount: number | null;
  /** Доход с нанятого за год, сум; `null` — цифр нет, вторую половину расчёта не пишем. */
  valuePerHired: number | null;
  amountError: string | null;
  formError: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  submit: [amount: number | null];
  cancel: [];
  edit: [];
}>();

/** Больше цифр сумма не бывает: дальше число теряет точность, а сумов столько не тратят. */
const AMOUNT_MAX_DIGITS = 15;

const digitsOf = (text: string): string => text.replace(/\D/g, '').slice(0, AMOUNT_MAX_DIGITS);

const amountText = ref(props.initialAmount === null ? '' : formatNumber(props.initialAmount));

const amount = computed((): number | null => {
  const digits = digitsOf(amountText.value);

  return digits === '' ? null : Number(digits);
});

// Разряды встают по мере ввода; правка поля снимает его ошибку.
watch(amountText, (text) => {
  const formatted = amount.value === null ? '' : formatNumber(amount.value);

  if (formatted !== text) amountText.value = formatted;
  emit('edit');
});

const label = computed(() =>
  props.ongoing
    ? `Бюджет на найм на ${monthYear(props.month, 'nominative')}, сум`
    : `Потрачено на найм за ${monthYear(props.month, 'nominative')}, сум`,
);

const hint = computed(() =>
  props.ongoing
    ? 'Сколько парк выделил на найм в этом месяце. Когда месяц закончится, поправьте на то, что потратили на самом деле.'
    : 'Сколько парк потратил на привлечение водителей за месяц: реклама, бонусы за приход, работа менеджеров — как парк считает сам.',
);

/** Расчёт под полем: нанятых в месяце нет — или стоимость одного и окупаемость, числами для экрана. */
type HireCostCalc =
  | { kind: 'noHired'; text: string }
  | {
      kind: 'cost';
      monthWord: string;
      division: string;
      perHired: string;
      /** Доход с нанятого и окупаемость; цифр дохода нет — `null`, вторую фразу не пишем. */
      payback: { value: string; times: string } | null;
    };

/** «Найм одного в сентябре: 9,0 млн ÷ 72 нанятых = …» — по месяцу плитки; суммы нет — строки нет. */
const calc = computed((): HireCostCalc | null => {
  const sum = amount.value;

  if (sum === null || sum <= 0) return null;

  const perHired = hireCostPerHired(sum, props.monthHired);

  if (perHired === null) return { kind: 'noHired', text: noHiredText(props) };

  const payback = props.valuePerHired === null ? null : hirePaybackOf(props.valuePerHired, sum, props.monthHired);
  // У идущего нанятые — не все за месяц, и делитель говорит, за какие сутки.
  const days = props.ongoing ? ` ${hiredWhen(props)}` : '';

  return {
    kind: 'cost',
    monthWord: monthForms(props.month).prepositional,
    division: `${formatCompactSum(sum)} ÷ ${hiredCount(props.monthHired)}${days}`,
    perHired: formatCompactSum(perHired),
    payback:
      props.valuePerHired === null || payback === null
        ? null
        : { value: formatCompactSum(props.valuePerHired), times: `${formatTenths(payback)} раза` },
  };
});

const amountField = ref<{ focus: () => void } | null>(null);

watch(
  () => props.amountError,
  async (error) => {
    if (error === null) return;

    await nextTick();
    amountField.value?.focus();
  },
);

const submit = (): void => {
  emit('submit', amount.value);
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
        :label="label"
        required
        autofocus
        :hint="hint"
        :error="amountError"
      />
    </div>

    <p
      v-if="calc"
      aria-live="polite"
      class="m-0 mt-5 rounded-xl bg-web-cyan/4 px-3.5 py-3 font-manrope text-[13px] leading-[1.45] text-web-title"
    >
      <template v-if="calc.kind === 'noHired'">{{ calc.text }}</template>
      <template v-else>
        Найм одного в {{ calc.monthWord }}: {{ calc.division }} =
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
