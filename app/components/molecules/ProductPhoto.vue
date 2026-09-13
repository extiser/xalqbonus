<script setup lang="ts">
import { computed } from 'vue';

/**
 * Фото товара или место под него.
 *
 * Адрес собирается здесь, а не на страницах: к нему приписывается `?v=<updatedAt>`, и это
 * не украшение — имя файла собрано из uuid товара и расширения, то есть перезалитая картинка
 * того же формата ложится по тому же адресу. Кэш у адреса длинный, и без отметки правки
 * браузер показывал бы прежнюю картинку до конца года (issue #120).
 *
 * Пустое место подписано словом, а не оставлено пустым: «фото не загрузили» и «картинка
 * не открылась» для смотрящего означают разное.
 */
type PhotoSize = 'thumb' | 'large' | 'tile';

const props = withDefaults(
  defineProps<{
    photoPath: string | null;
    /** Время последней правки товара: оно и есть версия адреса. */
    updatedAt: string;
    name: string;
    size?: PhotoSize;
    /**
     * Подпись пустого места. Служебные экраны говорят по-русски, а витрина водителя —
     * на его языке, и слово приходит из словаря.
     */
    emptyLabel?: string;
  }>(),
  { size: 'thumb', emptyLabel: 'без фото' },
);

const source = computed(() =>
  props.photoPath === null
    ? null
    : `/uploads/${props.photoPath}?v=${encodeURIComponent(props.updatedAt)}`,
);

const SIZE_CLASSES: Record<PhotoSize, string> = {
  thumb: 'h-12 w-12',
  large: 'h-40 w-40',
  /** Плитка витрины: квадрат во всю ширину колонки сетки. */
  tile: 'aspect-square w-full',
};
</script>

<template>
  <img
    v-if="source"
    :src="source"
    :alt="name"
    class="rounded-md border border-slate-200 bg-white object-cover"
    :class="SIZE_CLASSES[size]"
  />
  <span
    v-else
    class="flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-400"
    :class="SIZE_CLASSES[size]"
  >
    {{ emptyLabel }}
  </span>
</template>
