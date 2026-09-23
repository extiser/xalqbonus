<script setup lang="ts">
/**
 * Имя и позывной водителя в шапке главной: «Бахтиёр», под ним «А-247».
 *
 * Позывной тоньше и светлее имени — по нему водителя узнают в парке, но читается он вторым
 * (шкала шрифтов, «Шапка главного»).
 */
defineProps<{
  name: string;
  callsign?: string;
}>();
</script>

<template>
  <span class="flex min-w-0 flex-col gap-px">
    <b class="text-[16px] font-bold tracking-[-0.2px] text-xb-text">{{ name }}</b>
    <span v-if="callsign" class="text-[13px] font-extralight tracking-[0.2px] text-xb-secondary">{{ callsign }}</span>
  </span>
</template>
