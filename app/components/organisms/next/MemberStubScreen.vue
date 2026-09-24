<script setup lang="ts">
/**
 * Заглушка вместо экрана — `registration/state-load-failed.html`, `state-not-telegram.html`,
 * `state-outdated-telegram.html`: не загрузилось, открыто не из Telegram, устаревший Telegram.
 *
 * Устроена как экраны регистрации: логотип слева вверху, текст по левому краю, живой фон,
 * нажимаемое внизу. Двуязычная заглушка — два блока: первый крупно и белым, второй тише,
 * как узбекский и русский; одноязычная — один блок.
 *
 * Кнопка — только если повтор имеет смысл (`retryLabel`). Где он дал бы тот же ответ,
 * кнопки нет вовсе, а не погашенная.
 */
defineProps<{
  blocks: { title: string; paragraphs: string[] }[];
  retryLabel: string | null;
}>();

defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberRegistrationHeader />

    <div class="relative z-[1] flex grow flex-col px-5 pt-[140px]">
      <div class="flex flex-col gap-[26px]">
        <MoleculesNextMemberTextBlock
          v-for="(block, index) in blocks"
          :key="index"
          :title="block.title"
          :paragraphs="block.paragraphs"
          :tone="index === 0 ? 'primary' : 'secondary'"
        />
      </div>
    </div>

    <div v-if="retryLabel" class="relative z-[2] px-5 pb-[calc(50px+env(safe-area-inset-bottom))] pt-[22px]">
      <AtomsNextMemberButton size="l" tone="garnet-solo" @click="$emit('retry')">{{ retryLabel }}</AtomsNextMemberButton>
    </div>
  </div>
</template>
