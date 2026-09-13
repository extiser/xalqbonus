<script setup lang="ts">
/**
 * Поле кода заказа: пять цифр, крупно, с цифровой клавиатурой на телефоне.
 *
 * `inputmode="numeric"`, а не `type="number"`: числовое поле съедает ведущий ноль, а код
 * «04217» — законный. Всё, что не цифра, отбрасывается при вводе.
 *
 * Набрав пятую цифру, поле сообщает об этом событием: у стойки код диктуют, и лишнее нажатие
 * «Найти» на каждом водителе — это лишнее нажатие на каждом водителе.
 */
const CODE_LENGTH = 5;

const props = withDefaults(
  defineProps<{
    /** Подпись для тех, кто не видит поля: у поля кода подписи на экране нет. */
    label: string;
    autofocus?: boolean;
  }>(),
  { autofocus: false },
);

const model = defineModel<string>({ required: true });

const emit = defineEmits<{ complete: [code: string] }>();

const input = useTemplateRef<HTMLInputElement>('input');

onMounted(() => {
  if (props.autofocus) {
    input.value?.focus();
  }
});

const onInput = (event: Event): void => {
  const field = event.target as HTMLInputElement;
  const digits = field.value.replace(/\D/g, '').slice(0, CODE_LENGTH);

  // Значение ставится и в само поле: иначе отброшенная буква осталась бы видна до следующей
  // отрисовки, а модель с полем разошлись бы.
  field.value = digits;
  model.value = digits;

  if (digits.length === CODE_LENGTH) {
    emit('complete', digits);
  }
};
</script>

<template>
  <input
    ref="input"
    :value="model"
    type="text"
    inputmode="numeric"
    pattern="[0-9]*"
    autocomplete="off"
    :maxlength="CODE_LENGTH"
    :aria-label="label"
    placeholder="•••••"
    class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-4xl tracking-[0.3em] text-slate-900 tabular-nums transition-colors placeholder:text-slate-300 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    @input="onInput"
  />
</template>
