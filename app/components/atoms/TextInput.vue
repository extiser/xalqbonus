<script setup lang="ts">
/**
 * Поле ввода. Своего отступа снаружи не получает — расстояние ставит контейнер.
 *
 * Одно поле на все виды ввода, а не по атому на каждый: вид у них общий, и второй файл
 * с теми же классами разошёлся бы с первым на первой же правке цвета рамки.
 *
 * Тип `search` даёт крестик очистки, а на телефоне — клавиатуру с кнопкой поиска вместо
 * перевода строки; `tel` — цифровую клавиатуру; `url` — проверку браузером того, что
 * набранное вообще похоже на адрес; `date` — календарь браузера и значение `YYYY-MM-DD`,
 * которое не зависит от того, как дату пишут в локали смотрящего. Поэтому тип приходит
 * снаружи: это смысл поля, а не его вид.
 */
type InputType = 'search' | 'text' | 'tel' | 'password' | 'url' | 'date' | 'datetime-local';

/**
 * Клавиатура на телефоне, когда тип поля её не задаёт: `numeric` — цифры без знаков, как
 * у Telegram ID (issue #305). Тип `number` для этого не годится — он отдаёт число, а длинное
 * число теряет точность.
 */
type InputMode = 'numeric' | 'decimal' | 'text';

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
    inputmode?: InputMode;
    /** Нижняя граница поля `date` — `YYYY-MM-DD`: день раньше календарь не даст выбрать. */
    min?: string;
  }>(),
  {
    size: 'medium',
    placeholder: undefined,
    ariaLabel: undefined,
    autocomplete: undefined,
    autofocus: false,
    required: false,
    inputmode: undefined,
    min: undefined,
  },
);

const model = defineModel<string>({ required: true });

/**
 * Высота задана явно и та же, что у `AtomsSelectInput` того же размера (issue #310): высоту
 * выпадающего списка браузер считает от шрифта, а не от строки, и без явной высоты список
 * в одном ряду с полем выходит ниже его на четыре пикселя. Значения — те, что поле ввода
 * набирает само: строка, отступы и рамка.
 */
const SIZE_CLASSES: Record<InputSize, string> = {
  medium: 'h-8.5 px-3 py-1.5 text-sm',
  large: 'h-11.5 px-4 py-2.5 text-base',
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
    :inputmode="inputmode"
    :min="min"
    class="w-full rounded-md border border-slate-300 bg-white text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
    :class="SIZE_CLASSES[size]"
  />
</template>
