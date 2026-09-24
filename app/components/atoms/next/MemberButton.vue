<script setup lang="ts">
/**
 * Кнопка водительского Mini App — по шкале из `product/design/README.md`, «Шкала шрифтов».
 *
 * Размер задаёт форму, тон — смысл. Основные (`garnet`, `gold`, `gold-soft`, `scarlet`) пишутся
 * весом 700, вторичные (`grey`, `danger`, `outline`) — 600: вторичная не должна спорить по весу
 * с основной, стоящей над ней в той же шторке.
 *
 * Золотых тонов два, как в макетах. `gold` — «Открыть сундук» на экране акции: плотная
 * вертикальная заливка, тёмный текст и бегущий блик в ритме «Участвовать». `gold-soft` —
 * кнопка плашки приглашения: мягкий диагональный градиент и дыхание свечением.
 *
 * Своего отступа снаружи у кнопки нет, как и ширины, кроме `l` — та по шкале «во всю ширину»,
 * и это форма кнопки, а не её место.
 *
 * Гранатовая и серая L — один вид на всё приложение, по макетам регистрации (решение Руслана
 * 24-09-2026, ревью `#195`). Гранатовая L светится так же крупно, как M посреди экрана, а погашенная
 * тускнеет не до 35 %, а до 55 %: пока идёт запрос, кнопка остаётся читаемой, а внутри крутится
 * загрузчик (`busy`). Серая L — светлый текст и тонкий контур, при нажатии чуть светлеет.
 *
 * Кнопка стоит на `z-index: 1`: свечение гранатовой выходит за её габариты и иначе ложится
 * поверх соседа снизу. Соседям, которые должны остаться над свечением, контейнер даёт тот же
 * `relative z-[1]` — две кнопки подряд разводятся сами, порядком в разметке.
 */
type ButtonSize = 'l' | 'm' | 's';
type ButtonTone = 'garnet' | 'gold' | 'gold-soft' | 'scarlet' | 'grey' | 'danger' | 'outline';

const props = withDefaults(
  defineProps<{
    size?: ButtonSize;
    tone?: ButtonTone;
    disabled?: boolean;
    /** Идёт запрос: кнопка гаснет, и перед подписью крутится загрузчик. */
    busy?: boolean;
  }>(),
  { size: 'l', tone: 'garnet', disabled: false, busy: false },
);

defineEmits<{ click: [] }>();

const SIZE_CLASSES: Record<ButtonSize, string> = {
  l: 'h-[52px] w-full rounded-[16px] text-[15px]',
  m: 'h-12 rounded-full text-[15px]',
  s: 'h-10 rounded-full text-[14px]',
};

const SIZE_PADDING: Record<ButtonSize, string> = {
  l: 'px-4',
  m: 'px-[30px]',
  s: 'px-[22px]',
};

/** «Открыть сундук» в макете шире остальных S — поля 28 вместо 22. */
const GOLD_PADDING_S = 'px-7';

const TONE_CLASSES: Record<ButtonTone, string> = {
  garnet: 'gap-2.5 bg-xb-garnet font-bold text-white disabled:shadow-none',
  gold: 'member-button-gold overflow-hidden bg-[linear-gradient(180deg,#FFD37A_0%,#F7BC3E_52%,#E39B1E_100%)] font-bold tracking-[-0.2px] text-[#17110A] shadow-[0_12px_30px_-14px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,231,168,0.35)] disabled:opacity-35',
  'gold-soft':
    'member-button-gold-soft bg-[linear-gradient(135deg,#FFD98A_0%,#E9A93C_100%)] font-bold text-[#2A1B05] disabled:opacity-35',
  scarlet: 'bg-xb-scarlet font-bold text-white disabled:opacity-35',
  grey: 'member-button-grey border border-white/8 bg-xb-button-grey font-semibold text-xb-text active:bg-[#2A2E35] disabled:opacity-35',
  danger:
    'border border-[rgba(255,92,120,0.40)] bg-[rgba(255,92,120,0.08)] font-semibold text-xb-scarlet-soft disabled:opacity-35',
  outline: 'border border-white/14 bg-white/5 font-semibold text-xb-text disabled:opacity-35',
};

/**
 * Свечение и погашенный вид гранатовой по размеру. L и M светятся крупно: L — главное
 * действие экрана или шторки, M — одна кнопка посреди экрана («Обменять баллы»). S внутри
 * карточки сдержаннее. Погашенная L тускнеет до 55 %, M и S — до 35 %, как раньше.
 */
const GARNET_SIZE_CLASSES: Record<ButtonSize, string> = {
  l: 'member-button-garnet-l shadow-[0_8px_26px_rgba(232,54,93,0.38)] disabled:opacity-55',
  m: 'shadow-[0_8px_26px_rgba(232,54,93,0.38)] disabled:opacity-35',
  s: 'shadow-[0_6px_16px_rgba(232,54,93,0.22)] disabled:opacity-35',
};
</script>

<template>
  <button
    type="button"
    :disabled="disabled || busy"
    class="relative z-[1] inline-flex shrink-0 cursor-pointer items-center justify-center font-manrope transition-opacity disabled:cursor-default"
    :class="[
      SIZE_CLASSES[props.size],
      props.tone === 'gold' && props.size === 's' ? GOLD_PADDING_S : SIZE_PADDING[props.size],
      TONE_CLASSES[props.tone],
      props.tone === 'garnet' ? GARNET_SIZE_CLASSES[props.size] : '',
    ]"
    @click="$emit('click')"
  >
    <span v-if="busy" class="member-button-spin box-content size-4 rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
/*
 * Бегущий блик золотой — тот же период 3.6 с, что у «Участвовать» на экране приглашения,
 * чтобы обе кнопки программы не тикали вразнобой. Свечения вокруг нет: золотой ореол
 * на нагретом золотом фоне даёт кашу.
 */
.member-button-gold:not(:disabled)::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -60%;
  width: 45%;
  background: linear-gradient(105deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.65) 50%, rgba(255, 255, 255, 0) 100%);
  animation: member-button-shine 3.6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes member-button-shine {
  0% {
    transform: translateX(0);
  }

  55%,
  100% {
    transform: translateX(370%);
  }
}

/* Мягкая золотая дышит свечением — как кнопка на плашке приглашения. */
.member-button-gold-soft:not(:disabled) {
  box-shadow: 0 8px 22px rgba(233, 169, 60, 0.34);
  animation: member-button-breath 2.8s ease-in-out infinite;
}

@keyframes member-button-breath {
  0%,
  100% {
    box-shadow: 0 8px 22px rgba(233, 169, 60, 0.28);
  }

  50% {
    box-shadow: 0 8px 30px rgba(255, 205, 105, 0.55);
  }
}

/* Гранатовая L гаснет плавно — и прозрачностью, и свечением. */
.member-button-garnet-l {
  transition: opacity 0.2s ease, box-shadow 0.2s ease;
}

.member-button-grey {
  transition: background-color 0.15s ease;
}

/* Загрузчик в погашенной кнопке, пока идёт запрос: кольцо 16 с линией 2, оборот 0.8 с. */
.member-button-spin {
  animation: member-button-spin 0.8s linear infinite;
}

@keyframes member-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .member-button-spin,
  .member-button-gold:not(:disabled)::after,
  .member-button-gold-soft:not(:disabled) {
    animation: none;
  }
}
</style>
