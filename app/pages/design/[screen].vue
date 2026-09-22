<script setup lang="ts">
import { computed } from 'vue';
import { useDesignFonts } from '~/design/fonts';
import {
  homeErrorsMock,
  homeInviteMock,
  homeLoadingMock,
  homeMock,
  homeNewcomerMock,
  homeQuietMock,
  homeSeveralMock,
} from '~/design/mocks';
import { findDesignScreen } from '~/design/screens';

/**
 * Один экран служебной страницы `/design` — на заглушках, в колонке телефона.
 *
 * Колонка шириной во весь экран, но не шире 520 px, по центру и на фоне экрана — как в макетах:
 * на 16 Pro Max логическая ширина 440, 520 — запас сверху.
 *
 * Переходы между экранами работают ссылками на соседние адреса `/design`, переключатели
 * (шторки, глазик, язык) — локальным состоянием этой страницы: компоненты принимают готовое
 * и отдают события, помнить за них некому.
 */
if (!import.meta.dev) throw createError({ statusCode: 404 });

definePageMeta({ layout: false });

useDesignFonts();

const route = useRoute();
const slug = computed(() => String(route.params.screen));
const screen = computed(() => findDesignScreen(slug.value));

if (!screen.value) {
  throw createError({ statusCode: 404 });
}

useHead({ title: () => screen.value?.title ?? 'Макеты Mini App' });

/** Моки главной по адресу: у каждого состояния свой объект. */
const HOME_MOCKS = {
  home: homeMock,
  'home-invite': homeInviteMock,
  'home-several': homeSeveralMock,
  'home-quiet': homeQuietMock,
  'home-newcomer': homeNewcomerMock,
  'home-loading': homeLoadingMock,
  'home-errors': homeErrorsMock,
} as const;

type HomeSlug = keyof typeof HOME_MOCKS;

function isHomeSlug(value: string): value is HomeSlug {
  return value in HOME_MOCKS;
}

const home = computed(() => (isHomeSlug(slug.value) ? HOME_MOCKS[slug.value] : undefined));

function go(target: string): void {
  void navigateTo(`/design/${target}`);
}
</script>

<template>
  <div class="min-h-dvh bg-xb-screen font-manrope text-xb-text">
    <div class="mx-auto w-full max-w-[520px] bg-xb-screen">
      <OrganismsNextMemberHome
        v-if="home"
        v-bind="home"
        @history="go('history')"
        @rewards="go('rewards')"
        @reward="go('rewards')"
        @orders="go('orders')"
        @order="go('order')"
        @profile="go('profile')"
        @invite="go('promo')"
        @promo="go('campaign')"
      />
    </div>
  </div>
</template>
