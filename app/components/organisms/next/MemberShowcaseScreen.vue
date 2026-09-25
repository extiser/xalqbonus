<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MemberProductView } from '~/types/memberView';

/**
 * Каталог — без офиса (`_reference/design/catalog/catalog-no-office.html`) и витрина офиса
 * (`catalog-showcase.html`, после выбора — `catalog-office-picked.html`), состояния —
 * `catalog-showcase-states.html`.
 *
 * Путь водителя (issue #234): каталог открывается без офиса и показывает всё, что есть хотя бы
 * в одном офисе; офис спрашивается в момент, когда товар кладут в корзину, — это решает страница.
 * Над плитками — строка офиса: «Офис · Выбрать» без офиса и «Офис · Кадышева · Сменить» с ним.
 * Строка закреплена под шапкой и при прокрутке не уезжает; баланс — в липкой шапке справа.
 *
 * Состояния:
 * - `pick` — грузится каталог или витрина офиса: заглушки плиток, без строки офиса и итога;
 * - `ready` — плитки в две колонки. У витрины офиса за ними — товары каталога, которых в офисе
 *   нет, приглушёнными (`missingProducts`), и внизу итог с «Оформить»;
 * - `empty` — товаров нет: текст видом пустого экрана, как в «Моих заказах». Кнопок нет,
 *   сменить офис — строкой выше, итога нет;
 * - `error` — не загрузилось: текст и «Повторить». Баланс в шапке остаётся — он с экрана водителя.
 *
 * Подсказка под строкой офиса (`hint`) лежит поверх витрины и контент не сдвигает. Гаснет она
 * при прокрутке и по нажатию в любом месте — это слышит экран и отдаёт `hint-close`, — и по
 * крестику. Шторки выбора офиса, подтверждения и выхода — отдельными организмами поверх:
 * их открывает страница.
 */
type ShowcaseState = 'pick' | 'ready' | 'empty' | 'error';

const props = defineProps<{
  state: ShowcaseState;
  /** Баланс справа в шапке — готовыми строками («Ваши баллы», «2 450»). */
  balance: { label: string; amount: string };
  /**
   * Строка офиса. Без имени — «Офис · Выбрать»: офис ещё не выбран. `action` — подпись ссылки,
   * «Выбрать» или «Сменить». Нет всей строки — её нет на экране.
   */
  office?: { label: string; name?: string; action: string };
  products: MemberProductView[];
  /** Товары каталога, которых нет в офисе витрины, — приглушёнными после `products`. */
  missingProducts?: MemberProductView[];
  /** Итог и «Оформить» — только у `ready` с выбранным офисом. */
  checkout?: {
    total: string;
    remaining: string;
    remainingNegative?: boolean;
    disabled?: boolean;
    reason?: string;
    reasonTone?: 'quiet' | 'warn';
  };
  /** Подсказка под строкой офиса: `text` — шаблон с `{office}`. */
  hint?: { shown: boolean; text: string; office: string; closeLabel: string };
  /**
   * Товар, к которому витрина прокручивается, когда впервые становится `ready`: водитель нажал
   * на него на главной. Плитка встаёт целиком под закреплённую строку офиса, без плавной
   * прокрутки. Такого товара нет — витрина остаётся наверху.
   */
  focusProductId?: string;
  texts: {
    title: string;
    back: string;
    sale: string;
    decrease: string;
    increase: string;
    increaseMore: string;
    total: string;
    remaining: string;
    checkout: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

const emit = defineEmits<{
  back: [];
  change: [];
  inc: [productId: string];
  dec: [productId: string];
  checkout: [];
  retry: [];
  'hint-close': [];
}>();

/** Заглушек на загрузке — два ряда. */
const PLACEHOLDER_COUNT = 4;

/** Зазор между строкой офиса и плиткой, к которой прокрутили, — верхний отступ сетки. */
const FOCUS_GAP = 18;

const officeLine = ref<HTMLElement | null>(null);
const grid = ref<HTMLElement | null>(null);

/** Прокрутка к товару — одна на жизнь экрана: следующие `ready` водителя уже не двигают. */
let focusDone = false;

const scrollToFocus = async (): Promise<void> => {
  focusDone = true;
  await nextTick();

  const tile = grid.value?.querySelector<HTMLElement>(`[data-product-id="${props.focusProductId}"]`);

  if (!tile) {
    return;
  }

  // Строка офиса липкая: её низ на экране — там же, где будет после прокрутки.
  const lineBottom = officeLine.value?.getBoundingClientRect().bottom ?? 0;
  const top = tile.getBoundingClientRect().top + window.scrollY - lineBottom - FOCUS_GAP;

  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
};

const hideHint = (): void => {
  emit('hint-close');
};

const stopHintListeners = (): void => {
  window.removeEventListener('scroll', hideHint);
  document.removeEventListener('click', hideHint);
};

// Прокрутка и слушатели — только в браузере: на сервере окна нет, а экран `/design` рисуется и там.
onMounted(() => {
  watch(
    () => props.state,
    (state) => {
      if (state === 'ready' && props.focusProductId && !focusDone) {
        void scrollToFocus();
      }
    },
    { immediate: true },
  );

  // Подсказка гаснет при первой прокрутке и по первому нажатию где угодно — как в макете.
  watch(
    () => props.hint?.shown ?? false,
    (shown) => {
      stopHintListeners();

      if (shown) {
        window.addEventListener('scroll', hideHint, { passive: true });
        document.addEventListener('click', hideHint);
      }
    },
    { immediate: true },
  );
});

onBeforeUnmount(stopHintListeners);
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <!-- Липкая под шапкой: шапка — 69 без выреза сверху (14 + 40 + 14 и граница) -->
    <div
      v-if="state !== 'pick' && office"
      ref="officeLine"
      class="sticky top-[calc(69px+env(safe-area-inset-top))] z-[4] border-b border-white/6 bg-xb-screen px-[18px] pb-3 pt-3.5"
    >
      <MoleculesNextMemberOfficeLine :label="office.label" :name="office.name" :change-label="office.action" @change="$emit('change')" />

      <div v-if="hint" class="absolute left-4 right-4 top-[calc(100%+6px)] z-[6]">
        <MoleculesNextMemberOfficeHint
          :shown="hint.shown"
          :text="hint.text"
          :office="hint.office"
          :close-label="hint.closeLabel"
          @close="$emit('hint-close')"
        />
      </div>
    </div>

    <div v-if="state === 'pick'" class="grid grid-cols-2 gap-x-4 gap-y-[22px] px-4 pb-6 pt-[18px]" aria-hidden="true">
      <div v-for="placeholder in PLACEHOLDER_COUNT" :key="placeholder" class="flex min-w-0 flex-col gap-2.5">
        <div class="aspect-[9/10] rounded-[24px] bg-white/5" />
        <div class="flex flex-col gap-1 px-1">
          <div class="h-3 w-[60%] rounded-md bg-white/6" />
          <div class="h-3 w-[28%] rounded-md bg-white/6" />
        </div>
        <div class="h-10 rounded-full bg-white/6" />
      </div>
    </div>

    <template v-else-if="state === 'ready'">
      <div class="grow">
        <div ref="grid" class="grid grid-cols-2 gap-x-4 gap-y-[22px] px-4 pb-6 pt-[18px]">
          <!-- `data-product-id` — метка для прокрутки к товару, ложится на корень плитки -->
          <MoleculesNextMemberProductTile
            v-for="product in products"
            :key="product.id"
            :data-product-id="product.id"
            mode="showcase"
            :product="product"
            :texts="{ sale: texts.sale, stepper: { decrease: texts.decrease, increase: texts.increase, increaseMore: texts.increaseMore } }"
            @inc="$emit('inc', product.id)"
            @dec="$emit('dec', product.id)"
          />
          <MoleculesNextMemberProductTile
            v-for="product in missingProducts"
            :key="product.id"
            :data-product-id="product.id"
            mode="showcase"
            :product="product"
            :texts="{ sale: texts.sale }"
          />
        </div>
      </div>

      <MoleculesNextMemberCheckoutBar
        v-if="checkout"
        :total="checkout.total"
        :remaining="checkout.remaining"
        :remaining-negative="checkout.remainingNegative"
        :disabled="checkout.disabled"
        :reason="checkout.reason"
        :reason-tone="checkout.reasonTone"
        :texts="{ total: texts.total, remaining: texts.remaining, checkout: texts.checkout }"
        @checkout="$emit('checkout')"
      />
    </template>

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" size="screen" :message="texts.empty" />

    <MoleculesNextMemberNotice
      v-else
      state="error"
      size="screen"
      :message="texts.error"
      :retry-label="texts.retry"
      @retry="$emit('retry')"
    />
  </div>
</template>
