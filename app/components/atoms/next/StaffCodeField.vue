<script setup lang="ts">
/**
 * Поле кода у стойки сотрудника — `_reference/design/staff/02-desk.html`, `.code` (issue #250).
 *
 * Одно поле, а не клетки: пять цифр крупно, моноширинно, в разрядку. Тёмное — заливка светлее
 * карточек и рамка 50 % белого, — фокус стальным синим: гранат, золото и зелёный в приложении
 * заняты смыслами. Высота 96: это основное окно стойки.
 *
 * `inputmode="numeric"`, а не `type="number"`: числовое поле съедает ведущий ноль, а код
 * «04217» законный. Всё, что не цифра, отбрасывается при вводе. Пятая цифра — событие
 * `complete`: кнопки «Найти» нет, код диктуют, и лишнее нажатие было бы на каждом водителе.
 *
 * Фокус программно не ставится ни при открытии стойки, ни после выдачи, отмены или смены офиса —
 * поле ждёт нажатия (решение Руслана 26-09-2026, прогон #253). В WebView Telegram фокус при открытии
 * приложения не встаёт, а после любого касания встаёт: поведение выходило разным, и клавиатура
 * закрывала «Ждут выдачи».
 */
const CODE_LENGTH = 5;

defineProps<{
  /** Подпись для экранного чтеца: на экране подпись стоит над полем заголовком. */
  label: string;
}>();

const model = defineModel<string>({ required: true });

const emit = defineEmits<{ complete: [code: string] }>();

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
    :value="model"
    type="text"
    inputmode="numeric"
    pattern="[0-9]*"
    autocomplete="off"
    :maxlength="CODE_LENGTH"
    :aria-label="label"
    placeholder="•••••"
    class="block box-border h-24 w-full rounded-[16px] border border-white/50 bg-[#20242C] px-4 text-center font-mono text-[36px] tracking-[0.3em] text-xb-text tabular-nums outline-0 placeholder:text-[#5C6470] focus:border-[#5E7AA3] focus:outline-2 focus:outline-offset-2 focus:outline-[#5E7AA3]"
    @input="onInput"
  />
</template>
