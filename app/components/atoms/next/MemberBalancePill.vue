<script setup lang="ts">
/**
 * Баланс пилюлей в шапке экрана акции: знак балла и число.
 *
 * На главной баланс стоит крупно в центре, а в шапке — пилюля акции. На экране акции
 * наоборот: центр занят дневной целью, и баланс уходит в шапку.
 */
defineProps<{ points: string }>();
</script>

<template>
  <span
    class="box-border flex h-9 items-center gap-1.5 rounded-full bg-white/7 pl-[11px] pr-3.5 text-[14px] font-normal tracking-[0.1px] text-xb-text"
  >
    <span class="text-xb-garnet"><AtomsNextMemberPointsIcon :size="16" /></span>
    <span>{{ points }}</span>
  </span>
</template>
