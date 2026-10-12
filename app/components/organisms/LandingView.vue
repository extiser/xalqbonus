<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { classifyLandingReference, mapCssUrls, mapSrcset } from '#shared/landings';

/**
 * Лендинг — экран заявки, загруженный архивом (issue #478). Общий для веба и Mini App: предпросмотр
 * во вкладке «Лендинги» показывает ровно то, что увидит человек.
 *
 * Рисует разметку версии в изолированном контейнере — теневом дереве на своём элементе: стили
 * лендинга не текут в приложение, стили приложения — в лендинг. Наследуемое снаружи — цвет,
 * шрифт — сброшено на корне контейнера: иначе лендинг выглядел бы по-разному на тёмном вебе
 * и в Mini App. Шрифты Manrope и Unbounded подключает документ, и контейнер их видит
 * (docs/decisions.md → «Лендинги в „Промо“»).
 *
 * Разметка уже очищена сервером: компонент ничего не вырезает и ничего из неё не исполняет —
 * вставка разметки скрипты не запускает. Перед вставкой пути картинок получают адрес версии
 * (`imageBase`): относительный путь в `src`, `srcset` и `url(...)` — тем же разбором ссылок, которым
 * сервер проверял, что картинка лежит в архиве; `data:` не трогается. Разбирает разметку
 * `DOMParser` — в отдельном документе, где картинки не грузятся по старым путям.
 *
 * Пустая разметка — пустое место. `submit` объявлен для Mini App: нажатие кнопки лендинга
 * слушает приложение.
 */
const props = defineProps<{
  html: string;
  imageBase: string;
}>();

defineEmits<{ submit: [] }>();

const host = ref<HTMLElement | null>(null);

const HOST_STYLE = '<style>:host { all: initial; display: block; font-family: Manrope, system-ui, sans-serif; }</style>';

const rebase = (url: string, base: string): string =>
  classifyLandingReference(url.trim()) === 'relative' ? `${base}${url.trim()}` : url;

/** Разметка с путями картинок от адреса версии. */
const prepare = (html: string, base: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html');

  for (const element of document.querySelectorAll('img, source')) {
    const src = element.getAttribute('src');
    const srcset = element.getAttribute('srcset');

    if (src !== null) element.setAttribute('src', rebase(src, base));
    if (srcset !== null) element.setAttribute('srcset', mapSrcset(srcset, (url) => rebase(url, base)));
  }

  for (const element of document.querySelectorAll('[style]')) {
    const style = element.getAttribute('style');

    if (style !== null) element.setAttribute('style', mapCssUrls(style, (url) => rebase(url, base)));
  }

  for (const element of document.querySelectorAll('style')) {
    element.textContent = mapCssUrls(element.textContent ?? '', (url) => rebase(url, base));
  }

  return document.documentElement.outerHTML;
};

const render = (): void => {
  const element = host.value;

  if (!element) return;

  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });

  root.innerHTML = props.html.trim() === '' ? '' : HOST_STYLE + prepare(props.html, props.imageBase);
};

onMounted(render);
watch(() => [props.html, props.imageBase], render);
</script>

<template>
  <div ref="host" />
</template>
