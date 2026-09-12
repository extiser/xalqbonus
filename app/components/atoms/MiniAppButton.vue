<script setup lang="ts">
/**
 * Кнопка на экране водителя.
 *
 * Крупная и во всю ширину: экран живёт в телефоне, и нажимают её большим пальцем на ходу.
 * Своего отступа снаружи не получает — расстояние до соседей ставит контейнер.
 */

/**
 * Вид кнопки.
 *
 * `primary` — главное действие экрана, одно на экран. `secondary` — действие, которое
 * экран предлагает, но не требует: «Показать ещё» зелёной заливкой во всю ширину звало бы
 * нажать себя сильнее, чем поделиться номером, ради которого экран и открыт.
 *
 * Значением свойства, а не классами снаружи: вид кнопки виден из её собственного файла
 * и не зависит от места вызова (docs/frontend.md → «Компонент владеет своим визуалом»).
 */
type ButtonVariant = 'primary' | 'secondary';

withDefaults(
  defineProps<{
    label: string;
    variant?: ButtonVariant;
    /** Пока запрос в пути. Ожиданием ответа Telegram кнопка не гасится — см. страницу `/app`. */
    disabled?: boolean;
  }>(),
  { variant: 'primary' },
);

defineEmits<{ click: [] }>();

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-emerald-700 disabled:bg-slate-300',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-400 disabled:text-slate-400',
};
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="w-full rounded-2xl px-5 py-4 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
    :class="VARIANT_CLASSES[variant]"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>
