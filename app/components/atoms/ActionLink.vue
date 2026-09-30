<script setup lang="ts">
/**
 * Ссылка в виде кнопки действия — «Открыть в Telegram» у ссылки привязки (issue #267),
 * «Скачать Excel» у отчёта (issue #308).
 *
 * Отдельно от `ActionButton`: переход по адресу — это `<a>`, а не кнопка с обработчиком.
 * Браузер тогда сам открывает Telegram по `t.me`, даёт скопировать адрес и открыть его
 * в новой вкладке. Вид — тот же, что у рядовой кнопки `secondary`.
 *
 * `download` — ссылка на файл: открывается на месте, без новой вкладки, — вкладка, которая
 * тут же закрывается пустой, пугает. `disabled` — ссылки ещё нет: вместо `<a>` погашенная
 * надпись того же вида, как у недоступной кнопки.
 */
withDefaults(
  defineProps<{
    label: string;
    href: string | null;
    download?: boolean;
    disabled?: boolean;
  }>(),
  { download: false, disabled: false },
);
</script>

<template>
  <span
    v-if="disabled || href === null"
    aria-disabled="true"
    class="cursor-not-allowed rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-400"
  >
    {{ label }}
  </span>
  <a
    v-else
    :href="href"
    :target="download ? undefined : '_blank'"
    :rel="download ? undefined : 'noopener'"
    :download="download ? '' : undefined"
    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  >
    {{ label }}
  </a>
</template>
