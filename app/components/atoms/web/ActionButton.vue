<script setup lang="ts">
import { computed, type Component } from 'vue';

/**
 * Кнопка действия в плитке веба — «Сделать сегмент», «Задать», «Список» на экранах дашборда
 * (`.btn` в `_reference/design/web/dashboard/02-levers.html`).
 *
 * Высота 36, текст циан 13 / 600, подложка циан 12 %, контур циан 45 % (`codex.md`, «Кнопка
 * действия в плитке»): залитая циановая слишком яркая, а на тёмной подложке кнопку не видно.
 *
 * Размер `page` — та же кнопка крупнее, 40 и 14 / 600 (`.btn-main` экранов «Промо», issue #380):
 * главное действие страницы в шапке, в окне и кнопки скачивания QR. Вид `quiet` — без подложки
 * и контура, текст цветом названия: «Отмена» рядом с главным действием окна (`.btn-ghost`).
 * Значок (`icon`) — Phosphor duotone слева от подписи; `title` — подсказка при наведении.
 *
 * Ведёт адресом (`to`) — тогда это ссылка, иначе кнопка с событием `click`. Файл — `download`:
 * простая ссылка на ручку выгрузки, без перехода внутри приложения («Скачать список», issue #373).
 * `submit` — кнопка отправляет свою форму. В плитке со входом (`to` у плитки) её не ставят:
 * плитка нажимается целиком, и кнопка в ссылке — ошибка разметки.
 */
type ActionButtonSize = 'tile' | 'page';
type ActionButtonVariant = 'action' | 'quiet';

const props = withDefaults(
  defineProps<{
    label: string;
    to?: string;
    /** Адрес файла: ссылка скачивает его, а не открывает страницу. */
    download?: string;
    size?: ActionButtonSize;
    variant?: ActionButtonVariant;
    icon?: Component;
    /** Подсказка при наведении. */
    title?: string;
    /** Отправляет форму, в которой стоит. */
    submit?: boolean;
  }>(),
  { to: undefined, download: undefined, size: 'tile', variant: 'action', icon: undefined, title: undefined },
);

defineEmits<{ click: [] }>();

const BASE_CLASSES =
  'inline-flex shrink-0 cursor-pointer items-center rounded-full font-manrope font-semibold whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';

const SIZE_CLASSES: Record<ActionButtonSize, string> = {
  tile: 'h-9 gap-1.5 px-4 text-[13px]',
  page: 'h-10 gap-2 px-[18px] text-[14px]',
};

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  action: 'border-0 bg-web-cyan/12 text-web-cyan inset-ring inset-ring-web-cyan/45',
  quiet: 'border-0 bg-transparent text-web-title hover:text-web-text',
};

const ICON_CLASSES: Record<ActionButtonSize, string> = {
  tile: 'size-4',
  page: 'size-[18px]',
};

const classes = computed(() => [BASE_CLASSES, SIZE_CLASSES[props.size], VARIANT_CLASSES[props.variant]]);
</script>

<template>
  <NuxtLink v-if="to" :to="to" :title="title" :class="classes">
    <component :is="icon" v-if="icon" weight="duotone" aria-hidden="true" :class="ICON_CLASSES[size]" />{{ label }}
  </NuxtLink>
  <a v-else-if="download" :href="download" download :title="title" :class="classes">
    <component :is="icon" v-if="icon" weight="duotone" aria-hidden="true" :class="ICON_CLASSES[size]" />{{ label }}
  </a>
  <button v-else :type="submit ? 'submit' : 'button'" :title="title" :class="classes" @click="$emit('click')">
    <component :is="icon" v-if="icon" weight="duotone" aria-hidden="true" :class="ICON_CLASSES[size]" />{{ label }}
  </button>
</template>
