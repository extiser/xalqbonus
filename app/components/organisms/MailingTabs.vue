<script setup lang="ts">
/**
 * Вкладки раздела «Рассылки»: рассылки и опросы (issue #320).
 *
 * Вкладка — адрес, а не состояние страницы: ссылку на опросы можно переслать, и «назад»
 * возвращает на ту вкладку, с которой ушли. Какая открыта, говорит страница — компонент
 * адресов не читает.
 */
type MailingTab = 'mailings' | 'surveys';

defineProps<{
  active: MailingTab;
}>();

const TABS: { tab: MailingTab; label: string; to: string }[] = [
  { tab: 'mailings', label: 'Рассылки', to: '/mailings' },
  { tab: 'surveys', label: 'Опросы', to: '/mailings/surveys' },
];
</script>

<template>
  <nav class="flex gap-6 border-b border-slate-200" aria-label="Раздел рассылок">
    <NuxtLink
      v-for="item in TABS"
      :key="item.tab"
      :to="item.to"
      :aria-current="item.tab === active ? 'page' : undefined"
      class="-mb-px border-b-2 pb-2 text-sm font-medium"
      :class="
        item.tab === active
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-900'
      "
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
