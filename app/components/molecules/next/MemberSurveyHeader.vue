<script setup lang="ts">
import type { MemberLanguage } from '~/types/memberView';

/**
 * Шапка экранов опроса — `_reference/design/survey/`: полоски сторис, под ними логотип слева
 * и переключатель UZ / RU справа, как на регистрации.
 *
 * Полосок нет (`bars` пусто) — на экране «опрос закрыт»: место под ними остаётся, и логотип
 * с заголовком стоят там же, где на остальных экранах опроса.
 *
 * Переключатель действует только внутри опроса: язык профиля он не меняет.
 * Лежит над живым фоном (`z-index: 2`).
 */
defineProps<{
  bars: { count: number; filled: number } | null;
}>();

const language = defineModel<MemberLanguage>('language', { required: true });
</script>

<template>
  <div class="relative z-[2] px-5 pt-[calc(14px+env(safe-area-inset-top))]">
    <AtomsNextMemberSurveyBars v-if="bars" :count="bars.count" :filled="bars.filled" />
    <div v-else class="h-[3px]" aria-hidden="true" />
    <div class="flex min-h-9 items-center justify-between pt-[22px]">
      <AtomsNextMemberLogo size="s" />
      <AtomsNextMemberLanguageSwitch v-model="language" />
    </div>
  </div>
</template>
