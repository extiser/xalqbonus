<script setup lang="ts">
import { computed } from 'vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { useSignOut } from '~/composables/useSignOut';
import { useDesignFonts } from '~/design/fonts';
import { navigationFor } from '~/utils/navigation';

/**
 * Раскладка веба в стиле бенто: тёмная, меню колонкой слева, содержимое справа
 * (`.app` экранов `_reference/design/web/dashboard/`).
 *
 * Разделы переходят на неё по одному, сменой раскладки, — меню при этом не переделывается
 * (`docs/decisions.md` → «Веб в стиле бенто»). Вошедший, пункты по роли и выход — те же,
 * что у светлой раскладки `default`.
 *
 * Место меню задаёт раскладка: на ноутбуке колонка 240 прилипает к верху окна с отступом 16
 * и занимает его высоту, на телефоне, ниже 900, — панель у нижнего края над домашней полосой
 * iPhone. Содержимое на телефоне получает снизу запас, чтобы последняя плитка не уходила
 * под панель.
 */

const employee = useCurrentEmployee();

const items = computed(() => navigationFor(employee.value?.role ?? null));

const signOut = useSignOut();

useDesignFonts();

// Без `viewport-fit=cover` iPhone не отдаёт `env(safe-area-inset-bottom)`, и панель меню ложится
// на домашнюю полосу. Только у этой раскладки: Mini App и светлые страницы не меняются.
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
});
</script>

<template>
  <div class="min-h-dvh bg-web-page font-manrope text-[15px] leading-[1.45] text-web-text">
    <div
      class="grid min-h-dvh grid-cols-[240px_minmax(0,1fr)] gap-web-gap p-web-gap max-web:grid-cols-[minmax(0,1fr)] max-web:gap-3 max-web:p-3"
    >
      <div
        class="sticky top-4 z-30 h-[calc(100dvh-32px)] max-web:pointer-events-none max-web:fixed max-web:inset-x-0 max-web:top-auto max-web:bottom-0 max-web:h-auto max-web:px-3 max-web:pb-[calc(12px+env(safe-area-inset-bottom))]"
      >
        <OrganismsWebSideMenu :items="items" :employee="employee" @sign-out="signOut" />
      </div>
      <main class="w-full max-w-[1240px] min-w-0 px-2 pt-2 pb-12 max-web:p-0 max-web:pb-[calc(110px+env(safe-area-inset-bottom))]">
        <slot />
      </main>
    </div>
  </div>
</template>
