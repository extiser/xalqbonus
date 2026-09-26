<script setup lang="ts">
/**
 * Значок состояния: слово и цвет.
 *
 * Цвет приходит смысловым свойством `tone`, а не классом снаружи. Значений пять,
 * и `alarm` из них ровно одно: тревогой на экране синхронизации является застрявшая
 * отметка и оборванный прогон, а не всякое отклонение. Упавший прогон — `warn`:
 * их восемь в сутки по лимиту Fleet API, и красный на каждом перестал бы читаться.
 *
 * `demo` — пометка «ДЕМО» (issue #212). Своим цветом, а не `warn` или `muted`: те уже значат
 * «черновик» и «в архиве», и демо-черновик в списке читался бы двумя одинаковыми значками.
 */
type BadgeTone = 'ok' | 'warn' | 'alarm' | 'muted' | 'demo';

defineProps<{
  tone: BadgeTone;
  label: string;
}>();

const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  alarm: 'bg-red-50 text-red-700 ring-red-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
  demo: 'bg-violet-50 text-violet-700 ring-violet-200',
};
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset"
    :class="TONE_CLASSES[tone]"
  >
    {{ label }}
  </span>
</template>
