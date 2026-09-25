<script setup lang="ts">
/**
 * Полоса «Демо-аккаунт» — `_reference/design/demo/01-main-screen-demo.html`, `.demo-strip`
 * (issue #205).
 *
 * Стоит над всем экраном, у демо-зрителя и только у него: слева «ДЕМО-АККАУНТ · водитель» —
 * роль, под которой он сейчас смотрит, справа «Сменить» — открывает шторку «Войти как».
 * Высота 44 — под палец (Руслан, 24-09-2026), и «Сменить» нажимается на всю высоту полосы
 * до правого края, а не только по слову.
 *
 * Липкая сверху: шапки экранов липнут под ней, сдвинутые на её высоту переменной
 * `--xb-demo-offset` (`app/assets/css/tailwind.css`). Шторки ложатся поверх неё.
 *
 * Тёмно-синяя — не золото акции и не гранат кнопок: с самим приложением её не спутать.
 */
defineProps<{
  /** «ДЕМО-АККАУНТ». */
  account: string;
  /** Роль строчными: «водитель». */
  role: string;
  /** «Сменить». */
  change: string;
}>();

defineEmits<{ change: [] }>();
</script>

<template>
  <div
    class="sticky top-0 z-[8] box-border flex h-xb-demo-bar items-center justify-between border-b border-xb-demo-border bg-xb-demo pl-4 font-manrope text-[13px] font-bold leading-[normal] tracking-[0.5px] text-xb-demo-text"
  >
    <span class="min-w-0 truncate">
      {{ account }} <span class="font-normal tracking-[0.2px] text-xb-demo-role">· {{ role }}</span>
    </span>
    <button
      type="button"
      class="inline-flex h-full shrink-0 cursor-pointer items-center gap-1 pl-5 pr-4 font-semibold text-xb-demo-switch"
      @click="$emit('change')"
    >
      {{ change }}
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>
