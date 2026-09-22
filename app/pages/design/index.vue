<script setup lang="ts">
import { useDesignFonts } from '~/design/fonts';
import { DESIGN_GROUPS } from '~/design/screens';

/**
 * Оглавление служебной страницы: все перенесённые экраны и их состояния ссылками.
 *
 * Только для разработки: в сборке страницы нет — адрес отвечает 404. Раскладки приложения
 * нет, Telegram не спрашивается, запросов нет — всё на заглушках (`app/design/mocks.ts`).
 */
if (!import.meta.dev) throw createError({ statusCode: 404 });

definePageMeta({ layout: false });

useDesignFonts();
useHead({ title: 'Макеты Mini App' });
</script>

<template>
  <div class="min-h-dvh bg-xb-screen font-manrope text-xb-text">
    <main class="mx-auto flex w-full max-w-[520px] flex-col gap-8 px-4 py-8">
      <h1 class="m-0 font-unbounded text-[22px] font-semibold tracking-[-0.5px]">Макеты Mini App водителя</h1>

      <section v-for="group in DESIGN_GROUPS" :key="group.title" class="flex flex-col gap-2">
        <h2 class="m-0 text-[12px] font-semibold uppercase tracking-[1.2px] text-xb-grey">{{ group.title }}</h2>
        <NuxtLink
          v-for="screen in group.screens"
          :key="screen.slug"
          :to="`/design/${screen.slug}`"
          class="flex flex-col gap-0.5 rounded-[16px] border border-white/9 bg-xb-card px-4 py-3 no-underline"
        >
          <span class="text-[15px] font-semibold text-xb-text">{{ screen.title }}</span>
          <span class="text-[12px] font-light text-xb-grey">/design/{{ screen.slug }} · {{ screen.source }}</span>
        </NuxtLink>
      </section>
    </main>
  </div>
</template>
