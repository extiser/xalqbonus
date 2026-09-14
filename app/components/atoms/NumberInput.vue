<script setup lang="ts">
/**
 * Поле для целого числа: цена, количество, остаток.
 *
 * Отдельным атомом, а не типом у `TextInput`: у числа свои свойства — нижняя граница и шаг,
 * — и втаскивать их в поле, которым набирают имя, значило бы держать в одном компоненте два
 * разных набора правил.
 *
 * Границы приходят снаружи, потому что это смысл поля, а не его вид: у цены в баллах нижняя
 * граница — единица, у остатка — ноль. Проверяет их браузер, рядом с полем и на языке
 * человека (docs/frontend.md → «Обязательное поле — свойство поля»); сервер проверяет
 * то же самое заново, потому что запрос приходит не только из этой формы.
 *
 * Значение — строка, а не число: пустое поле числом не выражается, а `null` в модели
 * заставил бы каждую форму отличать «не набрано» от нуля вручную.
 */
const props = withDefaults(
  defineProps<{
    /** `null` — нижней границы нет: у ручной правки баллов знак и есть направление. */
    min?: number | null;
    max?: number;
    placeholder?: string;
    ariaLabel?: string;
    required?: boolean;
    autofocus?: boolean;
  }>(),
  {
    min: 0,
    max: undefined,
    placeholder: undefined,
    ariaLabel: undefined,
    required: false,
    autofocus: false,
  },
);

const model = defineModel<string>({ required: true });

const input = useTemplateRef<HTMLInputElement>('input');

onMounted(() => {
  if (props.autofocus) {
    input.value?.focus();
  }
});
</script>

<template>
  <input
    ref="input"
    v-model="model"
    type="number"
    inputmode="numeric"
    step="1"
    :min="min ?? undefined"
    :max="max"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :required="required"
    class="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  />
</template>
