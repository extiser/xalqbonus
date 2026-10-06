<script setup lang="ts">
/**
 * Липкая шапка главного экрана — `_reference/design/home/main-screen.html`, между метками
 * «ЛИПКАЯ ШАПКА», и `section-bar.md`, «Шапка главной».
 *
 * Не шапка раздела: главная — витрина программы, а не раздел, и назад отсюда идти некуда.
 * Слева направо: аватар, имя с позывным, у правого края — одна пилюля. Кнопки «обновить» нет.
 *
 * Пилюля в шапке одна. Пока крупное число видно — пилюля обещания (акции), если она есть:
 * баланс и так крупно в центре. Пилюля акции стоит, только пока водитель в акции:
 * у невступившего прогресса не существует, его зовёт плашка приглашения под балансом.
 * Крупное число ушло под шапку — пилюля обещания уступает место пилюле баланса,
 * как на всех остальных экранах; вернулся наверх — вернулась пилюля обещания.
 *
 * Шапка стоит всегда, с первого кадра, и не уезжает; живой фон верхнего блока начинается
 * от верха экрана и уходит под неё — отсюда `margin-bottom: −68`. Пока крупное число видно,
 * шапка прозрачная. Верх числа ушёл под шапку — подложка и баланс появляются вместе, по одному
 * `surface`: его считает скрипт у числа (`MemberBalance`, порог 61). Баланс проявляется
 * за 0,15 с, гаснет сразу. Скрытая пилюля из раскладки убрана, а не прозрачна: иначе имя
 * обрезалось бы под пилюлю, которой не видно (`main-screen-welcome-pill-lengths.html`, `.on-bonus .bal`).
 *
 * Одним признаком, а не таймлайном прокрутки для баланса: в WebKit без таймлайнов (Telegram
 * на iOS и macOS) запасной путь показывал баланс с первого кадра, рядом с крупным числом
 * (прогон #210 на стенде).
 *
 * Пока не выдан приветственный бонус, центр главной — слайдер, и пилюля показывает другой слайд
 * и листает на него (`main-screen-welcome.html`, issue #410): на слайде бонуса — пилюля баланса,
 * на слайде баллов — золотая пилюля подарка «1 / 5». Пилюля акции в это время не стоит: первым
 * обещанием на слайде баллов идёт подарок. Пилюли лежат стопкой на одном месте и сменяют друг
 * друга вместе со слайдом. Число ушло под шапку — как без слайдера: одна пилюля баланса.
 */
defineProps<{
  name: string;
  callsign?: string;
  /** Прогресс акции. Нет — водитель не в акции, пилюли нет. */
  promo?: { done: number; total: number };
  /** Счёт до приветственного бонуса. Есть — центр главной листается, пилюля показывает другой слайд. */
  welcome?: { done: number; total: number };
  /** Показан слайд бонуса. Без `welcome` не читается. */
  welcomeShown?: boolean;
  /** Баланс готовыми строками: число набирается вместе с крупным, слово — по итоговому балансу. */
  balance: { amount: string; unit: string };
  /** Крупное число ушло под шапку — подложка и пилюля баланса вместо пилюли обещания. */
  surface: boolean;
  texts: {
    profile: string;
    promo: string;
    /** Подпись пилюли подарка для экранного чтеца. Нужна, когда есть `welcome`. */
    welcome?: string;
  };
}>();

defineEmits<{ profile: []; promo: []; showWelcome: []; showPoints: [] }>();
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

      <span v-if="surface" class="home-bar-balance flex shrink-0">
        <AtomsNextMemberBalancePill :amount="balance.amount" :unit="balance.unit" />
      </span>
      <span v-else-if="welcome" class="home-bar-stack">
        <button
          type="button"
          class="home-bar-stacked flex cursor-pointer border-0 bg-transparent p-0"
          :class="welcomeShown ? 'home-bar-stacked-on' : ''"
          :inert="!welcomeShown"
          @click="$emit('showPoints')"
        >
          <AtomsNextMemberBalancePill :amount="balance.amount" :unit="balance.unit" />
        </button>
        <span class="home-bar-stacked flex" :class="welcomeShown ? '' : 'home-bar-stacked-on'" :inert="welcomeShown">
          <MoleculesNextMemberPromoPill
            icon="gift"
            :done="welcome.done"
            :total="welcome.total"
            :label="texts.welcome ?? ''"
            @open="$emit('showWelcome')"
          />
        </span>
      </span>
      <MoleculesNextMemberPromoPill
        v-else-if="promo"
        :done="promo.done"
        :total="promo.total"
        :label="texts.promo"
        @open="$emit('promo')"
      />
    </div>
  </div>
</template>

<style scoped>
/* Обёртка — липкость. margin-bottom −68: живой фон верхнего блока начинается от верха и уходит под шапку.
   У демо-зрителя шапка липнет под полосой «Демо-аккаунт» — на её высоту (`--xb-demo-offset`). */
.home-sticky {
  position: sticky;
  top: var(--xb-demo-offset);
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

/* Пилюля баланса — по тому же `surface`, что подложка: проявляется за 0,15 с, гаснет сразу.
   Ключевыми кадрами, а не переходом: пилюля появляется в раскладке вместе с `surface`,
   и переходу не от чего отталкиваться. */
.home-bar-balance {
  animation: home-bar-balance-in 0.15s ease-out;
}

@keyframes home-bar-balance-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

/* Пилюли слайдера — стопкой в одной клетке, у правого края; видна та, что на другой слайд.
   Смена — за 0,3 с, вместе с листанием. */
.home-bar-stack {
  display: grid;
  flex-shrink: 0;
}

.home-bar-stacked {
  grid-area: 1 / 1;
  justify-self: end;
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
  transition: opacity 0.3s ease-out, transform 0.3s ease-out;
}

.home-bar-stacked-on {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .home-bar-balance {
    animation: none;
  }

  .home-bar-stacked {
    transform: none;
    transition: none;
  }
}
</style>
