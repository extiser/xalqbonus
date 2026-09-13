<script setup lang="ts">
/**
 * Поле выбора файла. Своего отступа и своей ширины снаружи не получает — их ставит контейнер.
 *
 * **`v-model` здесь нет, и это свойство самого элемента, а не наше решение.** Значение
 * файлового поля доступно только на чтение: присвоить ему файл нельзя ничем, и двусторонняя
 * привязка выглядела бы работающей ровно до первой попытки сбросить выбор извне. Поэтому
 * наружу уходит событие с выбранным файлом, а `null` — это «выбор отменили».
 *
 * Оформление кнопки выбора (`file:`-классы) принадлежит полю вместе с остальным его видом:
 * кнопку рисует браузер внутри этого же элемента, и снаружи её не достать иначе как
 * дописыванием классов в чужой компонент — тем самым, чего быть не должно
 * (docs/frontend.md → «Компонент владеет своим визуалом»).
 *
 * Какие типы принимать — смысл поля, а не его вид, поэтому `accept` приходит снаружи.
 * Отсекает он лишнее в самом диалоге выбора: человек не выбирает то, что всё равно
 * не примут.
 */
withDefaults(
  defineProps<{
    /** Список типов для диалога выбора — то же, что атрибут `accept`. */
    accept?: string;
    /** Подпись для тех, кто не видит поля. Не нужна там, где поле обёрнуто в `<label>`. */
    ariaLabel?: string;
    /**
     * Пустым не отправляется: браузер не пустит форму дальше и сам скажет, что файл нужен,
     * — рядом с полем и на языке человека.
     */
    required?: boolean;
  }>(),
  { accept: undefined, ariaLabel: undefined, required: false },
);

const emit = defineEmits<{ change: [file: File | null] }>();

/**
 * Один файл, а не список: полей с несколькими файлами у нас нет, и отдавать наружу массив
 * из одного элемента значило бы заставлять каждую форму его разбирать.
 */
const choose = (event: Event): void => {
  const input = event.target;

  emit('change', input instanceof HTMLInputElement ? (input.files?.[0] ?? null) : null);
};
</script>

<template>
  <input
    type="file"
    :accept="accept"
    :aria-label="ariaLabel"
    :required="required"
    class="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:text-slate-700 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    @change="choose"
  />
</template>
