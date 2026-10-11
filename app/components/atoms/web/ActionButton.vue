<script setup lang="ts">
import { computed, resolveComponent, type Component } from 'vue';

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
 * Значок (`icon`) — Phosphor duotone слева от подписи; `tooltip` — подпись при наведении
 * (`MoleculesWebTooltip`, issue #457): без неё обёртки нет.
 *
 * Ведёт адресом (`to`) — тогда это ссылка, иначе кнопка с событием `click`. Файл — `download`:
 * простая ссылка на ручку выгрузки, без перехода внутри приложения («Выгрузить в Excel», issues #373, #402).
 * `submit` — кнопка отправляет свою форму. `disabled` — погашенная (issue #402): прозрачность 40 %,
 * не нажимается и никуда не ведёт. Это не `<button disabled>`, а `span`: погашенный `button` в части
 * браузеров не получает событий мыши, а подпись при наведении должна показываться и у него — она
 * объясняет, почему кнопка погашена. В плитке со входом (`to` у плитки) её не ставят: плитка нажимается целиком, и кнопка
 * в ссылке — ошибка разметки.
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
    /** Подпись при наведении. */
    tooltip?: string;
    /** Отправляет форму, в которой стоит. */
    submit?: boolean;
    /** Погашена: видна, не нажимается. */
    disabled?: boolean;
  }>(),
  { to: undefined, download: undefined, size: 'tile', variant: 'action', icon: undefined, tooltip: undefined },
);

const emit = defineEmits<{ click: [] }>();

const BASE_CLASSES =
  'inline-flex shrink-0 items-center rounded-full font-manrope font-semibold whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';

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

const DISABLED_CLASSES = 'cursor-default opacity-40';

const classes = computed(() => [
  BASE_CLASSES,
  SIZE_CLASSES[props.size],
  VARIANT_CLASSES[props.variant],
  props.disabled ? DISABLED_CLASSES : 'cursor-pointer',
]);

const NuxtLink = resolveComponent('NuxtLink');

/** Чем кнопка стала: одна разметка на все случаи, и обёртка подписи ставится вокруг любого. */
const element = computed((): { is: string | Component; attributes: Record<string, string> } => {
  if (props.disabled) return { is: 'span', attributes: { role: 'button', 'aria-disabled': 'true' } };
  if (props.to) return { is: NuxtLink, attributes: { to: props.to } };
  if (props.download) return { is: 'a', attributes: { href: props.download, download: '' } };

  return { is: 'button', attributes: { type: props.submit ? 'submit' : 'button' } };
});

/** Событие — только у кнопки: погашенная и ссылки его не шлют. */
const click = (): void => {
  if (element.value.is === 'button') emit('click');
};
</script>

<template>
  <MoleculesWebTooltip v-if="tooltip" :text="tooltip">
    <component :is="element.is" v-bind="element.attributes" :class="classes" @click="click">
      <component :is="icon" v-if="icon" weight="duotone" aria-hidden="true" :class="ICON_CLASSES[size]" />{{ label }}
    </component>
  </MoleculesWebTooltip>
  <component :is="element.is" v-else v-bind="element.attributes" :class="classes" @click="click">
    <component :is="icon" v-if="icon" weight="duotone" aria-hidden="true" :class="ICON_CLASSES[size]" />{{ label }}
  </component>
</template>
