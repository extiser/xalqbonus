<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { readCandidateName } from '#shared/candidateApplications';
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
 * Пустая разметка — пустое место.
 *
 * После вставки компонент оживляет поле `[data-xb-name]` и кнопку `[data-xb-submit]` (issue #484).
 * Поле держит модель `name`: экран, нарисованный заново после отказа подписи контакта, получает
 * вписанное имя. Кнопка неактивна, пока имени нет или идёт отправка (`busy`) — правило то же, что
 * у `MemberApplicationForm`; на время отправки у неё атрибут `data-xb-busy`, вид в эти моменты задаёт
 * вёрстка лендинга. Нажатие активной кнопки — `submit`. Поля или кнопки нет — не оживляется ничего:
 * метки и так показывают только прошедшие проверку версии.
 *
 * Предпросмотр во вкладке «Лендинги» рисует компонент без слушателя `submit`: кнопка там гаснет
 * при пустом имени ровно как у человека, а нажатие никуда не уходит.
 */
const props = withDefaults(
  defineProps<{
    html: string;
    imageBase: string;
    /** Заявка отправляется: кнопка неактивна и помечена `data-xb-busy`. */
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{ submit: [] }>();

const name = defineModel<string>('name', { default: '' });

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

/** Поле имени и кнопка вставленной разметки; нет — `null`. */
let field: HTMLInputElement | null = null;
let button: HTMLButtonElement | null = null;

/** Кнопка — по имени и `busy`. */
const syncButton = (): void => {
  if (!button) return;

  button.disabled = readCandidateName(name.value) === null || props.busy;
  button.toggleAttribute('data-xb-busy', props.busy);
};

/** Поле — по модели: если модель сменилась снаружи, а не вводом в это поле. */
const syncField = (): void => {
  if (field && field.value !== name.value) field.value = name.value;
};

const onInput = (): void => {
  if (field) name.value = field.value;
};

const onClick = (): void => {
  if (button && !button.disabled) emit('submit');
};

const render = (): void => {
  const element = host.value;

  if (!element) return;

  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });

  root.innerHTML = props.html.trim() === '' ? '' : HOST_STYLE + prepare(props.html, props.imageBase);

  // Прежние поле и кнопка ушли вместе с разметкой, а с ними и их слушатели.
  const foundField = root.querySelector('[data-xb-name]');
  const foundButton = root.querySelector('[data-xb-submit]');

  field = foundField instanceof HTMLInputElement ? foundField : null;
  button = foundButton instanceof HTMLButtonElement ? foundButton : null;

  field?.addEventListener('input', onInput);
  button?.addEventListener('click', onClick);
  syncField();
  syncButton();
};

onMounted(render);
watch(() => [props.html, props.imageBase], render);
watch(name, () => {
  syncField();
  syncButton();
});
watch(() => props.busy, syncButton);
</script>

<template>
  <div ref="host" />
</template>
