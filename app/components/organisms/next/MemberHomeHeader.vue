<script setup lang="ts">
/**
 * Липкая шапка главного экрана — `_reference/design/home/main-screen.html`, между метками
 * «ЛИПКАЯ ШАПКА», и `section-bar.md`, «Шапка главной».
 *
 * Не шапка раздела: главная — витрина программы, а не раздел, и назад отсюда идти некуда.
 * Слева направо: аватар, имя с позывным, баланс, пилюля акции у правого края. Пилюля стоит,
 * только пока водитель в акции: у невступившего прогресса не существует, его зовёт плашка
 * приглашения под балансом. Кнопки «обновить» нет.
 *
 * Шапка стоит всегда, с первого кадра, и не уезжает; живой фон верхнего блока начинается
 * от верха экрана и уходит под неё — отсюда `margin-bottom: −68`. Пока крупное число видно,
 * шапка прозрачная и баланса в ней нет: он крупно в центре. Верх числа ушёл под шапку —
 * подложка и баланс появляются вместе, по одному `surface`: его считает скрипт у числа
 * (`MemberBalance`, порог 61). Баланс проявляется переходом 0,15 с, гаснет сразу.
 *
 * Одним признаком, а не таймлайном прокрутки для баланса: в WebKit без таймлайнов (Telegram
 * на iOS и macOS) запасной путь показывал баланс с первого кадра, рядом с крупным числом
 * (прогон #210 на стенде).
 */
defineProps<{
  name: string;
  callsign?: string;
  /** Прогресс акции. Нет — водитель не в акции, пилюли нет. */
  promo?: { done: number; total: number };
  /** Баланс готовыми строками; число набирается вместе с крупным. */
  balance: { label: string; amount: string };
  /** Крупное число ушло под шапку — подложка включена. */
  surface: boolean;
  texts: {
    profile: string;
    promo: string;
  };
}>();

defineEmits<{ profile: []; promo: [] }>();
</script>

<template>
  <div class="home-sticky">
    <div class="home-bar" :class="surface ? 'home-bar-surface' : ''">
      <AtomsNextMemberIconButton :label="texts.profile" size="m" @click="$emit('profile')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" stroke-width="1.8" />
          <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </AtomsNextMemberIconButton>

      <div class="min-w-0 grow">
        <AtomsNextMemberNameplate :name="name" :callsign="callsign" />
      </div>

      <div class="flex shrink-0 items-center gap-3.5">
        <span class="home-bar-balance flex shrink-0" :class="surface ? 'home-bar-balance-on' : ''">
          <AtomsNextMemberBarBalance :label="balance.label" :amount="balance.amount" />
        </span>
        <MoleculesNextMemberPromoPill
          v-if="promo"
          :done="promo.done"
          :total="promo.total"
          :label="texts.promo"
          @open="$emit('promo')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Обёртка — липкость. margin-bottom −68: живой фон верхнего блока начинается от верха и уходит под шапку. */
.home-sticky {
  position: sticky;
  top: 0;
  z-index: 7;
  margin-bottom: -68px;
  height: 68px;
}

/* Высота 68 = 14 + 40 + 14, поля 16. clip-path срезает всё, что свисает ниже края (пыль пилюли),
   вверх и вбок свечение не режется. */
.home-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: 68px;
  padding: calc(14px + env(safe-area-inset-top)) 16px 14px;
  clip-path: inset(-40px -40px 0 -40px);
  transition: background-color 0.2s ease-out, border-color 0.2s ease-out;
}

/* Без подложки — прозрачная рамка на месте рамки подложки: высота не прыгает, когда она включится. */
.home-bar:not(.home-bar-surface) {
  border-bottom: 1px solid transparent;
}

/* Подложка — один в один как у шапки раздела (`MemberSectionBar`). */
.home-bar-surface {
  background: rgba(11, 13, 17, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* Баланс в шапке — по тому же `surface`, что подложка: гаснет сразу, проявляется за 0,15 с. */
.home-bar-balance {
  opacity: 0;
  transform: translateY(-4px);
}

.home-bar-balance-on {
  opacity: 1;
  transform: none;
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .home-bar-balance {
    transform: none;
    transition: none !important;
  }
}
</style>
