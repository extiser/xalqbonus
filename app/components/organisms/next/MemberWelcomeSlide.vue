<script setup lang="ts">
import type { MemberSurveyTextPart } from '#shared/types/memberSurvey';

/**
 * Слайд приветственного бонуса в центре главной — `_reference/design/home/main-screen-welcome.html`,
 * `.points.welcome` (issue #410).
 *
 * Сетка та же, что у баллов (`MemberBalance`): надпись, крупное число, на месте кнопки «Обменять
 * баллы» — блок той же высоты 48 с делениями и подписью, на месте «Обновлено в» — строка о том,
 * какие поездки считаются. Высоты слайдов равны: при листании экран не прыгает.
 *
 * Бонус выдан, а «Спасибо» не нажато (`awarded`, `main-screen-welcome-awarded.html`, issue #421) —
 * все деления золотые, вместо счёта «Ура! Бонус зачислен!», вместо строки о поездках — золотая
 * кнопка «Спасибо», та же, что «Открыть сундук» у цели дня. Кнопка выше строки, и слайд выше
 * на 22 px: дорожка слайдера держит высоту большего, слайд баллов тянется до неё. Серпантин
 * праздника — над всем верхним блоком главной, его держит `MemberHome`.
 */
defineProps<{
  /** Бонус выдан — праздник вместо счёта. */
  awarded: boolean;
  /** Зачётных поездок, не больше `total`. */
  done: number;
  total: number;
  /** «+300» готовой строкой. */
  amount: string;
  texts: {
    title: string;
    /** «Ещё **4 поездки** — и 300 баллов ваши». */
    left: MemberSurveyTextPart[];
    counted: string;
    /** «Ура! Бонус зачислен!». */
    cheer: string;
    /** «Спасибо». */
    thanks: string;
  };
}>();

defineEmits<{ thanks: [] }>();
</script>

<template>
  <div class="relative flex flex-col items-center gap-5">
    <div class="flex flex-col items-center gap-2.5">
      <AtomsNextMemberEyebrow :label="texts.title" />
      <AtomsNextMemberBigNumber :value="amount" tone="gold" />
    </div>
    <div class="flex h-12 flex-col items-center justify-center gap-2.5">
      <span class="flex gap-1.5" aria-hidden="true">
        <i v-for="step in total" :key="step" class="welcome-step" :class="awarded || step <= done ? 'welcome-step-done' : ''" />
      </span>
      <span v-if="awarded" class="text-center text-[16px] font-bold leading-[1.3] text-white">{{ texts.cheer }}</span>
      <span v-else class="text-center text-[15px] font-medium text-xb-secondary">
        <template v-for="(part, index) in texts.left" :key="index">
          <b v-if="part.strong" class="font-bold text-xb-text">{{ part.text }}</b>
          <template v-else>{{ part.text }}</template>
        </template>
      </span>
    </div>
    <div v-if="awarded" class="relative z-[1]">
      <AtomsNextMemberButton size="s" tone="gold" @click="$emit('thanks')">{{ texts.thanks }}</AtomsNextMemberButton>
    </div>
    <div v-else class="relative z-[1] text-center">
      <AtomsNextMemberSyncNote :text="texts.counted" />
    </div>
  </div>
</template>

<style scoped>
.welcome-step {
  width: 40px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.welcome-step-done {
  background: linear-gradient(90deg, #ffd98a, #e8b04c);
  box-shadow: 0 0 10px rgba(255, 199, 92, 0.45);
}
</style>
