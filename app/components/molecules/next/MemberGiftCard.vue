<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { MemberGiftView } from '~/types/memberView';

/**
 * Подарок от Xalq Taxi — `_reference/design/gifts/main-screen-gift.html`, поведение «Забрать» —
 * `main-screen-gifts-take.html`.
 *
 * Компактная золотая карточка: «300 баллов в подарок» со знаком балла, «Xalq Taxi · причина»
 * тем же видом, что происхождение награды, и срок золотом.
 *
 * `home` — на главной, первыми карточками блока наград: к сроку «· нажмите, чтобы забрать»
 * и шеврон, вся карточка — нажатие, шторку открывает страница. `take` — в шторке и в разделе:
 * справа «Забрать», под карточкой — строка ошибки, если забрать не вышло. Длинная причина
 * в карточке — до двух строк с многоточием, в шторке — целиком (`reasonFull`).
 *
 * `popping` — подарок забран: карточка «нажимается» (0.97, 0.2 с) и «лопается» (1.05 со вспышкой
 * и в прозрачность, 0.5 с), через 0.26 с из неё летит серпантин, через 0.75 с схлопывается её
 * место — вместе со строкой ошибки. Схлопнулось — `popped`, подарок можно убирать из списка.
 * Анимация одна на все карточки подарков, где бы они ни стояли.
 *
 * `showCover` — обложка подарка сверху карточки, только в шторке
 * (`_reference/design/gifts/main-screen-gift-sheet-cover.html`): во всю ширину, скругление по карточке,
 * рамка 16:9 с обрезкой по краям — вертикальная картинка шторку не вытягивает. Обложки нет или она
 * не загрузилась — карточка как без неё, без пустой рамки и значка битой картинки. Лопается карточка
 * вместе с обложкой. На главной и в разделе карточки компактные, без обложки.
 *
 * Схлопываясь, место съедает и зазор 10 над собой (`margin-top: -10px`): оба списка, где
 * подарок забирают, — шторка и раздел — стоят с зазором 10, и без этого строка ниже доезжала бы
 * рывком.
 */
type GiftCardMode = 'home' | 'take';

const props = withDefaults(
  defineProps<{
    gift: MemberGiftView;
    mode: GiftCardMode;
    /** «нажмите, чтобы забрать» — хвост срока на главной. */
    hint?: string;
    /** «Забрать». */
    takeLabel?: string;
    /** Причина целиком, без обрезки в две строки. */
    reasonFull?: boolean;
    /** Обложка сверху карточки — в шторке. */
    showCover?: boolean;
    busy?: boolean;
    /** Строка под карточкой: «Не удалось забрать подарок. Попробуйте ещё раз.» */
    error?: string;
    popping?: boolean;
  }>(),
  {
    hint: undefined,
    takeLabel: undefined,
    reasonFull: false,
    showCover: false,
    busy: false,
    error: undefined,
    popping: false,
  },
);

const emit = defineEmits<{ open: []; take: []; popped: [] }>();

/** Серпантин — после вспышки, когда карточка уже раздулась. */
const BURST_DELAY_MS = 260;
/** Схлопывание начинается через 0.75 с и длится 0.3 с; `popped` — как у макета, с запасом. */
const POPPED_DELAY_MS = 1100;

const slot = ref<HTMLElement | null>(null);
const streamer = ref<{ burst: () => void } | null>(null);
const slotHeight = ref<number | null>(null);
const gone = ref(false);
const timers: ReturnType<typeof setTimeout>[] = [];

/** Обложка, которая не загрузилась. Адрес сменился — пробуем новый. */
const coverFailed = ref<string | null>(null);
const cover = computed(() =>
  props.showCover && props.gift.cover !== null && props.gift.cover !== coverFailed.value ? props.gift.cover : null,
);

watch(
  () => props.popping,
  (popping) => {
    if (!popping || !slot.value) {
      return;
    }

    // Высота фиксируется числом: из `auto` в ноль переход не проигрывается
    slotHeight.value = slot.value.offsetHeight;
    timers.push(setTimeout(() => streamer.value?.burst(), BURST_DELAY_MS));
    requestAnimationFrame(() => requestAnimationFrame(() => (gone.value = true)));
    timers.push(setTimeout(() => emit('popped'), POPPED_DELAY_MS));
  },
);

onBeforeUnmount(() => timers.forEach((timer) => clearTimeout(timer)));
</script>

<template>
  <div
    ref="slot"
    class="member-gift-slot"
    :class="[mode === 'take' ? 'overflow-hidden' : '', gone ? 'member-gift-slot-gone' : '']"
    :style="slotHeight === null ? undefined : { height: `${slotHeight}px` }"
  >
    <AtomsNextMemberStreamerBurst ref="streamer">
      <div :class="popping ? 'member-gift-pop' : ''">
        <AtomsNextMemberCard tone="gold" :clickable="mode === 'home'" @click="emit('open')">
          <!-- Скругление — по карточке за вычетом её рамки: карточка содержимое не обрезает. -->
          <img
            v-if="cover"
            :src="cover"
            alt=""
            class="block aspect-video w-full rounded-t-[19px] bg-[#0F1116] object-cover"
            @error="coverFailed = cover"
          />
          <span class="flex items-center gap-3 px-3.5 py-[13px]">
            <span class="flex min-w-0 grow flex-col gap-px">
              <span class="flex items-center gap-1.5 text-[16px] font-bold leading-[1.25]">
                <span class="flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="15" /></span>
                {{ gift.title }}
              </span>
              <span class="mb-[3px] mt-px text-[13px] font-light text-xb-grey" :class="reasonFull ? '' : 'line-clamp-2'">
                {{ gift.reason }}
              </span>
              <AtomsNextMemberStateLine tone="gold" :state="gift.deadline" :hint="mode === 'home' ? hint : undefined" />
            </span>
            <AtomsNextMemberChevron v-if="mode === 'home'" tone="gold" />
            <AtomsNextMemberButton v-else size="s" tone="gold-calm" :busy="busy" @click="emit('take')">
              {{ takeLabel }}
            </AtomsNextMemberButton>
          </span>
        </AtomsNextMemberCard>
      </div>
    </AtomsNextMemberStreamerBurst>
    <p v-if="error" class="mx-1 mb-0 mt-1.5 text-[13px] font-normal leading-[1.4] text-xb-scarlet-soft">{{ error }}</p>
  </div>
</template>

<style scoped>
.member-gift-slot {
  transition:
    height 0.3s ease-in 0.75s,
    margin 0.3s ease-in 0.75s;
}

.member-gift-slot-gone {
  height: 0 !important;
  margin-top: -10px;
}

.member-gift-pop {
  transform-origin: 50% 50%;
  animation:
    member-gift-press 0.2s ease-out forwards,
    member-gift-burst 0.5s ease-in 0.2s forwards;
}

@keyframes member-gift-press {
  to {
    transform: scale(0.97);
  }
}

@keyframes member-gift-burst {
  0% {
    transform: scale(0.97);
    opacity: 1;
    filter: brightness(1);
  }

  45% {
    transform: scale(1.05);
    filter: brightness(1.35);
  }

  100% {
    transform: scale(1.08);
    opacity: 0;
  }
}

/* Уменьшение движения: без масштаба и вспышки, карточка просто гаснет. */
@media (prefers-reduced-motion: reduce) {
  .member-gift-pop {
    animation: member-gift-fade 0.25s linear forwards;
  }

  @keyframes member-gift-fade {
    to {
      opacity: 0;
    }
  }
}
</style>
