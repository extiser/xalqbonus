<script setup lang="ts">
import type { MemberProductView } from '~/types/memberView';

/**
 * Витрина офиса — `_reference/design/catalog/catalog-showcase.html`, состояния —
 * `catalog-showcase-states.html`, первый вход — `catalog-office-sheet-first.html`.
 *
 * Путь водителя — сначала офис, потом его витрина (Руслан, 23-09-2026): остатки у офисов разные,
 * а заказ забирается в одном офисе. Над витриной — чья она и «Сменить»; баланс — в липкой
 * шапке справа, чтобы он был виден, пока водитель набирает корзину.
 *
 * Состояния:
 * - `pick` — первый вход: офис не выбран, поверх стоит шторка выбора. Под ней заглушки плиток,
 *   без строки офиса и итога — выбирать и оформлять ещё нечего;
 * - `ready` — плитки в две колонки и итог с «Оформить» внизу;
 * - `empty` — в офисе нет товаров: текст видом пустого экрана, как в «Моих заказах». Кнопок нет,
 *   сменить офис — строкой выше, итога нет;
 * - `error` — не загрузилось: текст и «Повторить». Баланс в шапке остаётся — он с экрана водителя.
 *
 * Шторки смены офиса и подтверждения — отдельными организмами поверх: их открывает страница.
 */
type ShowcaseState = 'pick' | 'ready' | 'empty' | 'error';

defineProps<{
  state: ShowcaseState;
  /** Баланс справа в шапке — готовыми строками («Ваши баллы», «2 450»). */
  balance: { label: string; amount: string };
  /** Офис витрины. Нет — строки офиса нет. */
  office?: { label: string; name: string };
  products: MemberProductView[];
  /** Итог и «Оформить» — только у `ready`. */
  checkout?: {
    total: string;
    remaining: string;
    remainingNegative?: boolean;
    disabled?: boolean;
    reason?: string;
    reasonTone?: 'quiet' | 'warn';
  };
  texts: {
    title: string;
    back: string;
    change: string;
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

defineEmits<{
  back: [];
  change: [];
  inc: [productId: string];
  dec: [productId: string];
  checkout: [];
  retry: [];
}>();

/** Заглушек на первом входе — два ряда: больше не видно под шторкой. */
const PLACEHOLDER_COUNT = 4;
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div v-if="state !== 'pick' && office" class="px-[18px] pb-1 pt-3.5">
      <MoleculesNextMemberOfficeLine :label="office.label" :name="office.name" :change-label="texts.change" @change="$emit('change')" />
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
        <div class="grid grid-cols-2 gap-x-4 gap-y-[22px] px-4 pb-6 pt-[18px]">
          <MoleculesNextMemberProductTile
            v-for="product in products"
            :key="product.id"
            mode="showcase"
            :product="product"
            :texts="{ sale: texts.sale, stepper: { decrease: texts.decrease, increase: texts.increase, increaseMore: texts.increaseMore } }"
            @inc="$emit('inc', product.id)"
            @dec="$emit('dec', product.id)"
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
