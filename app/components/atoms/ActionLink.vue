<script setup lang="ts">
/**
 * Внешняя ссылка в виде кнопки действия — «Открыть в Telegram» у ссылки привязки (issue #267).
 *
 * Отдельно от `ActionButton`: переход по адресу — это `<a>`, а не кнопка с обработчиком.
 * Браузер тогда сам открывает Telegram по `t.me`, даёт скопировать адрес и открыть его
 * в новой вкладке. Вид — тот же, что у рядовой кнопки `secondary`.
 */
defineProps<{
  label: string;
  href: string;
}>();
</script>

<template>
  <a
    :href="href"
    target="_blank"
    rel="noopener"
    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  >
    {{ label }}
  </a>
</template>
