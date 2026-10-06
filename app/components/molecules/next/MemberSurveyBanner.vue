<script setup lang="ts">
import type { MemberSurveyTextPart } from '#shared/types/memberSurvey';

/**
 * Плашка опроса под баллами главной — `_reference/design/survey/main-screen-survey.html`
 * («Опрос не закончен») и `main-screen-survey-start.html` («Пройдите опрос»): тексты разные,
 * вид один.
 *
 * На месте плашки приглашения в акцию, нажимается вся карточка, кнопки нет. Цвет — гранат:
 * золото у нас про награды, а опрос — действие водителя. Полосок прогресса нет: плашка
 * напоминает, а не показывает прогресс.
 */
defineProps<{
  kicker: string;
  title: string;
  /** Строка под заголовком; баллы в ней — жирным. */
  when: MemberSurveyTextPart[];
}>();

defineEmits<{ open: [] }>();
</script>

<template>
  <button type="button" class="survey-banner font-manrope text-left text-xb-text" @click="$emit('open')">
    <span class="flex min-w-0 flex-1 flex-col gap-2.5">
      <span class="text-[10px] font-bold tracking-[1.1px] text-xb-scarlet-soft uppercase">{{ kicker }}</span>
      <span class="survey-banner-title">{{ title }}</span>
      <span class="text-[13px] font-light text-xb-secondary">
        <template v-for="(part, index) in when" :key="index">
          <b v-if="part.strong" class="font-bold text-xb-text">{{ part.text }}</b>
          <template v-else>{{ part.text }}</template>
        </template>
      </span>
    </span>
    <AtomsNextMemberChevron tone="pink" :size="18" />
  </button>
</template>

<style scoped>
.survey-banner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  box-sizing: border-box;
  width: 100%;
  padding: 18px 20px;
  overflow: hidden;
  cursor: pointer;
  border-radius: 24px;
  border: 1px solid rgba(232, 54, 93, 0.3);
  background:
    radial-gradient(120% 130% at 92% 50%, rgba(232, 54, 93, 0.22) 0%, rgba(120, 24, 60, 0.1) 40%, rgba(20, 23, 29, 0) 70%),
    var(--color-xb-card);
}

.survey-banner-title {
  font-family: var(--font-unbounded);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.4px;
}
</style>
