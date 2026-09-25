<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

/**
 * Баллы в центре главного экрана: «Ваши баллы», число, «Обменять баллы» и отметка свежести —
 * `_reference/design/home/main-screen.html`.
 *
 * Уровни подписи и числа равны экрану акции — переключение между экранами не должно дёргать
 * раскладку. Отметка свежести стоит над свечением кнопки (`z-index`), иначе гранатовое
 * зарево ложится на неё сверху.
 *
 * Число — опора липкой шапки главной: когда его верх уходит под шапку, у неё появляются
 * подложка и баланс (`section-bar.md`, «Шапка главной»). Включает их одна проверка ниже,
 * событием `covered`.
 */
defineProps<{
  /** Число готовой строкой, уже в наборе. */
  amount: string;
  texts: {
    title: string;
    exchange: string;
    updated: string;
  };
}>();

const emit = defineEmits<{ exchange: []; covered: [covered: boolean] }>();

/**
 * Порог, px от верха шапки: верх числа поднялся выше — число ушло под шапку.
 * 61, а не 68 (высота шапки): рамка числа выше цифр на 6–7 px.
 */
const COVERED_THRESHOLD = 61;

/**
 * Где верх шапки: у демо-зрителя она липнет под полосой «Демо-аккаунт», ниже на её высоту
 * (`--xb-demo-offset`, issue #205). Читается при каждой проверке, а не раз при показе:
 * полоса появляется и уходит вместе с ролью, а число об этом не знает.
 */
const headerTop = (): number =>
  Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--xb-demo-offset')) || 0;

const amountBox = useTemplateRef<HTMLElement>('amountBox');

let covered = false;

function check(): void {
  const box = amountBox.value;
  if (!box) return;

  const next = box.getBoundingClientRect().top <= headerTop() + COVERED_THRESHOLD;
  if (next === covered) return;

  covered = next;
  emit('covered', next);
}

onMounted(() => {
  window.addEventListener('scroll', check, { passive: true });
  check();
});

onBeforeUnmount(() => window.removeEventListener('scroll', check));
</script>

<template>
  <div class="relative flex flex-col items-center gap-5">
    <div class="flex flex-col items-center gap-2.5">
      <AtomsNextMemberEyebrow :label="texts.title" />
      <div ref="amountBox" class="flex flex-col">
        <AtomsNextMemberBigNumber :value="amount" />
      </div>
    </div>
    <AtomsNextMemberButton size="m" tone="garnet" @click="$emit('exchange')">{{ texts.exchange }}</AtomsNextMemberButton>
    <div class="relative z-[1]">
      <AtomsNextMemberSyncNote :text="texts.updated" />
    </div>
  </div>
</template>
