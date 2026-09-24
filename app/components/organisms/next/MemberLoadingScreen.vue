<script setup lang="ts">
/**
 * Загрузка приложения — `registration/state-loading.html`, `states.md`: от открытия
 * до ответа о состоянии экрана.
 *
 * Логотип по центру, под ним белое кольцо. Белое, а не гранатовое: гранатовый на экране —
 * цвет действия, а загрузка ничего не просит нажать.
 *
 * Логотип и кольцо — один блок, и движение у него одно на весь показ: появляется при монтировании
 * (0.4 с, прозрачность и масштаб 0.96 → 1), крутится, пока не попросят уйти, по `leaving` уходит
 * (0.3 с) и сообщает `left` — только тогда на его место встаёт экран, иначе загрузчик обрывается
 * на полуобороте. Уход не начинается раньше, чем доиграл вход. Фон в этом не участвует.
 *
 * Цикл «вход → выход → пауза» из макета здесь не повторяется: он там только чтобы показать движение.
 *
 * При «уменьшении движения» кольцо стоит, а блок только проявляется и гаснет, без масштаба.
 */
const props = defineProps<{ leaving: boolean }>();

const emit = defineEmits<{ left: [] }>();

type LoadingPhase = 'before' | 'entering' | 'shown' | 'leaving' | 'left';

/**
 * Запас на случай, если конец перехода не придёт: вкладка ушла в фон, и браузер доиграл
 * переход без события. Длиннее самого долгого перехода — 0.4 с входа.
 */
const TRANSITION_FALLBACK_MS = 500;

const phase = ref<LoadingPhase>('before');
let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

const PHASE_CLASSES: Record<LoadingPhase, string> = {
  before: '',
  entering: 'is-shown',
  shown: 'is-shown',
  leaving: 'is-leaving',
  left: 'is-leaving',
};

function startPhase(next: 'entering' | 'leaving'): void {
  phase.value = next;
  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(finishPhase, TRANSITION_FALLBACK_MS);
}

function leaveIfAsked(): void {
  if (props.leaving && phase.value === 'shown') {
    startPhase('leaving');
  }
}

/** Переход доиграл — вход становится показом, уход заканчивается событием. */
function finishPhase(): void {
  clearTimeout(fallbackTimer);

  if (phase.value === 'entering') {
    phase.value = 'shown';
    leaveIfAsked();
  } else if (phase.value === 'leaving') {
    phase.value = 'left';
    emit('left');
  }
}

function onTransitionEnd(event: TransitionEvent): void {
  // Переход прозрачности самого блока — масштаб кончается с ним в одно время.
  if (event.target === event.currentTarget && event.propertyName === 'opacity') {
    finishPhase();
  }
}

watch(() => props.leaving, leaveIfAsked);

onMounted(() => {
  // Два кадра: первый рисует блок невидимым, во втором браузеру есть от чего вести переход.
  requestAnimationFrame(() => requestAnimationFrame(() => startPhase('entering')));
});

onBeforeUnmount(() => clearTimeout(fallbackTimer));
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <div class="relative z-[1] flex grow flex-col items-center justify-center pb-10">
      <div class="loading-block flex flex-col items-center gap-[22px]" :class="PHASE_CLASSES[phase]" @transitionend="onTransitionEnd">
        <AtomsNextMemberLogo size="l" />
        <span class="loading-ring box-content size-[22px] rounded-full border-[2.5px] border-white/13 border-t-xb-text" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-block {
  opacity: 0;
  transform: scale(0.96);
  transition: opacity 0.4s ease-out, transform 0.4s ease-out;
}

.loading-block.is-shown {
  opacity: 1;
  transform: scale(1);
}

.loading-block.is-leaving {
  opacity: 0;
  transform: scale(0.96);
  transition-duration: 0.3s;
  transition-timing-function: ease-in;
}

/* Оборот за 0.9 с, ровно: загрузчик не ускоряется и не тормозит. */
.loading-ring {
  animation: loading-ring 0.9s linear infinite;
}

@keyframes loading-ring {
  to {
    rotate: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-block,
  .loading-block.is-shown,
  .loading-block.is-leaving {
    transform: none;
    transition: opacity 0.2s linear;
  }

  .loading-ring {
    animation: none;
  }
}
</style>
