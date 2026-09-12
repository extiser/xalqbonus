<script setup lang="ts">
/**
 * Поле ввода. Своего отступа снаружи не получает — расстояние ставит контейнер.
 *
 * Одно поле на все виды ввода, а не по атому на каждый: вид у них общий, и второй файл
 * с теми же классами разошёлся бы с первым на первой же правке цвета рамки.
 *
 * Тип `search` даёт крестик очистки, а на телефоне — клавиатуру с кнопкой поиска вместо
 * перевода строки; `tel` — цифровую клавиатуру. Поэтому тип приходит снаружи: это смысл
 * поля, а не его вид.
 */
type InputType = 'search' | 'text' | 'tel' | 'password';

/** Крупное поле — там, где ввод и есть работа экрана. */
type InputSize = 'medium' | 'large';

const props = withDefaults(
  defineProps<{
    type: InputType;
    size?: InputSize;
    placeholder?: string;
    /** Подпись для тех, кто не видит поля. Не нужна там, где поле обёрнуто в `<label>`. */
    ariaLabel?: string;
    autocomplete?: string;
    /** Ставит курсор в поле при появлении. */
    autofocus?: boolean;
    /**
     * Пустым не отправляется: браузер не пустит форму дальше и сам скажет, чего не хватает,
     * — на языке человека и рядом с полем. Своя проверка в отправке сказала бы то же самое
     * вторым текстом, а запрос всё равно ушёл бы зря.
     */
    required?: boolean;
  }>(),
  {
    size: 'medium',
    placeholder: undefined,
    ariaLabel: undefined,
    autocomplete: undefined,
    autofocus: false,
    required: false,
  },
);

const model = defineModel<string>({ required: true });

const SIZE_CLASSES: Record<InputSize, string> = {
  medium: 'px-3 py-1.5 text-sm',
  large: 'px-4 py-2.5 text-base',
};

/**
 * Фокус ставится ещё и руками, а не одним атрибутом: атрибут срабатывает на отрисованной
 * странице, а при переходе внутри приложения страница не перезагружается, и поле осталось бы
 * пустым и холодным.
 */
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
    :type="type"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :autocomplete="autocomplete"
    :autofocus="autofocus"
    :required="required"
    class="w-full rounded-md border border-slate-300 bg-white text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    :class="SIZE_CLASSES[size]"
  />
</template>
