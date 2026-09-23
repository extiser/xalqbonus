<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MemberRewardTicketView } from '~/types/memberView';

/**
 * Слой награды поверх шторки сундука: затемнение, вспышка из сундука, карточка награды
 * в полёте, подпись со ссылкой в раздел и «Готово».
 *
 * До вылета слой прозрачен и нажатий не ловит — разгон идёт под ним, в самом сундуке.
 * Карточка стартует из точки сундука (`from` — сдвиг от её места до центра сундука
 * и во сколько раз сундук меньше) и садится с перелётом вверх: так она читается как
 * вылетевшая, а не проявившаяся. Подпись и кнопка приходят с задержкой в полперелёта —
 * пока карточка в воздухе, читать под ней нечего.
 *
 * Слой прижат к низу: «Готово» встаёт туда же, где стояла «Закрыть».
 *
 * У вылета `forwards`, поэтому уход — второй анимацией: без неё снятый класс вернул бы
 * карточку в исходное рывком. Уход играет только после показа, а не при первом появлении слоя.
 */
const props = defineProps<{
  revealed: boolean;
  ticket: MemberRewardTicketView;
  /** Откуда вылетает карточка — сдвиг в пикселях и масштаб сундука к карточке. */
  from: { x: number; y: number; scale: number };
  /** Точка вспышки в пикселях от угла слоя. */
  flash: { x: number; y: number };
  texts: {
    note: string;
    link: string;
    done: string;
  };
}>();

defineEmits<{ done: []; link: [] }>();

const leaving = ref(false);

watch(
  () => props.revealed,
  (revealed, wasRevealed) => {
    leaving.value = !revealed && wasRevealed;
  },
);
</script>

<template>
  <div class="reveal" :class="[revealed ? 'reveal-on' : '', leaving ? 'reveal-leaving' : '']" :aria-hidden="!revealed" :inert="!revealed">
    <div class="reveal-veil" />
    <div class="reveal-flash" :style="{ left: `${flash.x}px`, top: `${flash.y}px` }" />

    <div
      class="reveal-ticket"
      data-reveal-ticket
      :style="{ '--fx': `${from.x}px`, '--fy': `${from.y}px`, '--fs': String(from.scale) }"
    >
      <MoleculesNextMemberRewardTicket :ticket="ticket" />
    </div>

    <p class="reveal-late reveal-note">
      {{ texts.note }}
      <button type="button" class="reveal-link" @click="$emit('link')">{{ texts.link }}</button>
    </p>
    <div class="reveal-late mt-6">
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('done')">{{ texts.done }}</AtomsNextMemberButton>
    </div>
  </div>
</template>

<style scoped>
.reveal {
  --card-w: 250px;

  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  pointer-events: none;
}

.reveal-on {
  pointer-events: auto;
}

.reveal-veil {
  position: absolute;
  inset: -1px -20px calc(-24px - env(safe-area-inset-bottom));
  background: rgba(20, 23, 29, 0.92);
  opacity: 0;
  transition: opacity 0.34s ease;
}

.reveal-on > .reveal-veil {
  opacity: 1;
}

/* Разгорается быстро, гаснет долго: вспышка, а не пульсация. */
.reveal-flash {
  position: absolute;
  width: 300px;
  height: 300px;
  margin: -150px 0 0 -150px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 231, 170, 0.72) 24%, rgba(247, 188, 62, 0.3) 46%, rgba(247, 188, 62, 0) 70%);
  opacity: 0;
  pointer-events: none;
}

.reveal-on > .reveal-flash {
  animation: reveal-flash 0.4s ease-out forwards;
}

.reveal-ticket {
  position: relative;
  align-self: center;
  width: var(--card-w);
  max-width: 100%;
  opacity: 0;
}

.reveal-on > .reveal-ticket {
  animation: reveal-fly 0.72s cubic-bezier(0.16, 0.84, 0.44, 1) forwards;
}

.reveal-leaving > .reveal-ticket {
  animation: reveal-leave 0.28s ease-in forwards;
}

.reveal-late {
  position: relative;
  opacity: 0;
  transition: opacity 0.3s ease-out;
}

.reveal-on > .reveal-late {
  opacity: 1;
  transition-delay: 0.36s;
}

/* Пояснение в шторке — 14/400 серым (шкала шрифтов). */
.reveal-note {
  margin: 16px 0 0;
  text-align: center;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.65;
  color: #8a93a2;
}

/* Имя раздела не рвётся переносом: «Мои награды и призы» — имя, а не фраза. Гранатом
   и подчёркнутое: золото на этих экранах занято смыслом «есть что открыть». */
.reveal-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  white-space: nowrap;
  color: #e8365d;
  text-decoration: underline;
  text-decoration-color: rgba(232, 54, 93, 0.5);
  text-underline-offset: 3px;
  cursor: pointer;
}

@keyframes reveal-flash {
  0% { opacity: 0; transform: scale(0.22); }
  14% { opacity: 1; transform: scale(0.95); }
  100% { opacity: 0; transform: scale(1.75); }
}

@keyframes reveal-fly {
  0% { opacity: 0; transform: translate(var(--fx, 0px), var(--fy, 0px)) scale(var(--fs, 0.2)) rotate(-16deg); }
  18% { opacity: 1; }
  62% { opacity: 1; transform: translate(0, -4%) scale(1.04) rotate(3deg); }
  100% { opacity: 1; transform: translate(0, 0) scale(1) rotate(0deg); }
}

@keyframes reveal-leave {
  0% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(12px) scale(0.96); }
}

@media (prefers-reduced-motion: reduce) {
  .reveal-on > .reveal-flash,
  .reveal-leaving > .reveal-ticket,
  .reveal-on > .reveal-ticket {
    animation: none;
  }

  .reveal-on > .reveal-ticket {
    opacity: 1;
  }
}
</style>
