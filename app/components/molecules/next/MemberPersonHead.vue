<script setup lang="ts">
/**
 * Верх карточки профиля: аватар и ФИО — по ним менеджер в офисе понимает «кто это»
 * первым взглядом.
 *
 * Две строки: фамилия первой, имя и отчество второй. ФИО полностью и переносится, а не режется:
 * его сверяют с документом в руках. Отчества нет — вторая строка просто короче.
 */
defineProps<{
  lastName: string;
  givenNames: string;
}>();
</script>

<template>
  <div class="flex items-center gap-3.5 px-4 pb-4 pt-[18px]">
    <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/7" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
        <circle cx="12" cy="8.5" r="3.6" stroke="#B4BCC8" stroke-width="1.8" />
        <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke="#B4BCC8" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </span>
    <span class="flex min-w-0 flex-col gap-0.5">
      <span class="text-[18px] font-bold leading-[1.25] tracking-[-0.2px] text-xb-text">{{ lastName }}</span>
      <span class="text-[16px] font-medium leading-[1.3] text-xb-secondary">{{ givenNames }}</span>
    </span>
  </div>
</template>
