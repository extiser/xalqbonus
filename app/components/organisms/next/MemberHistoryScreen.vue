<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue';
import type { MemberOperationDayView, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «История баллов» — экрана раздела в снимке макетов нет; блок и все состояния —
 * `_reference/design/home/history-block.html`, шапка с балансом — `home/section-bar.md`.
 *
 * Шапка раздела, отметка синхронизации и операции по дням. Раздел спокойный, живого фона нет:
 * главная — витрина программы, раздел — работа со списком.
 *
 * Отметка синхронизации отвечает на вопрос, который задают именно списку: «почему поездки,
 * которую я закончил десять минут назад, здесь нет».
 *
 * Листается прокруткой, кнопки нет (Руслан, 25-09-2026, issue #210). В конце списка стоит
 * невидимая метка: долистал до неё — событие `more`, следующую страницу приносит страница.
 * Пока она идёт — внизу строки ожидания того же вида, что у первой загрузки. Не пришла — отказ
 * строкой и «Повторить» под ним; сама прокрутка после отказа повторно не спрашивает, иначе
 * каждое движение пальца у конца списка слало бы запрос в неработающую сеть. Страниц больше
 * нет — метки нет, и список просто кончается.
 *
 * Пусто и «не загрузилось» у первой страницы — видом экрана, как у остальных разделов
 * (`orders/orders-screen-empty.html`): один вид на все экраны, включая историю (Руслан, 24-09-2026,
 * ревью #207). Блок истории на главной остаётся видом блока.
 */
withDefaults(
  defineProps<{
    state: MemberViewLoad;
    days: MemberOperationDayView[];
    /** Есть ли следующая страница. Нет — метки в конце нет, список кончается. */
    hasMore: boolean;
    /** Следующая страница в пути: внизу строки ожидания. */
    loadingMore?: boolean;
    /** Следующая страница не пришла: внизу отказ и «Повторить». */
    moreFailed?: boolean;
    /** Баланс справа в шапке — готовыми строками («Ваши баллы», «1 450»). */
    balance?: { label: string; amount: string };
    texts: {
      title: string;
      back: string;
      synced: string;
      empty: string;
      error: string;
      retry: string;
    };
  }>(),
  { loadingMore: false, moreFailed: false, balance: undefined },
);

const emit = defineEmits<{ back: []; more: []; retry: [] }>();

const SKELETON_ROWS = 6;

/** Строк ожидания под списком, пока идёт следующая страница. */
const MORE_SKELETON_ROWS = 3;

/**
 * Запас до конца списка, px: следующая страница спрашивается чуть раньше, чем палец дойдёт
 * до последней строки, и строки ожидания успевают встать на место конца.
 */
const MORE_AHEAD = 200;

const sentinel = useTemplateRef<HTMLElement>('sentinel');

let observer: IntersectionObserver | null = null;

// Метка появляется заново после каждой пришедшей страницы — и наблюдается заново: если новая
// страница короче экрана, метка сразу видна и спрашивает следующую.
watch(sentinel, (element) => {
  observer?.disconnect();
  observer = null;

  if (!element) {
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        emit('more');
      }
    },
    { rootMargin: `0px 0px ${MORE_AHEAD}px 0px` },
  );
  observer.observe(element);
});

onBeforeUnmount(() => observer?.disconnect());

</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div class="px-5 pb-0.5 pt-3">
      <AtomsNextMemberSyncNote :text="texts.synced" />
    </div>

    <div v-if="state === 'ready' || state === 'loading'" class="flex flex-col gap-1 px-3.5 pb-5 pt-2">
      <template v-if="state === 'ready'">
        <MoleculesNextMemberOperationDay v-for="day in days" :key="day.id" :label="day.label" :operations="day.operations" />

        <div v-if="loadingMore">
          <div v-for="row in MORE_SKELETON_ROWS" :key="row" :class="row > 1 ? 'border-t border-white/6' : ''">
            <MoleculesNextMemberOperationRow />
          </div>
        </div>

        <div v-else-if="moreFailed" class="flex flex-col items-center">
          <p class="m-0 mt-3.5 px-1 text-center text-[14px] font-normal leading-[1.45] text-xb-scarlet-soft">{{ texts.error }}</p>
          <div class="mt-[18px] flex justify-center">
            <AtomsNextMemberButton size="s" tone="outline" @click="$emit('more')">{{ texts.retry }}</AtomsNextMemberButton>
          </div>
        </div>

        <div v-else-if="hasMore" ref="sentinel" class="h-px" aria-hidden="true" />
      </template>

      <template v-else>
        <div v-for="row in SKELETON_ROWS" :key="row" :class="row > 1 ? 'border-t border-white/6' : ''">
          <MoleculesNextMemberOperationRow />
        </div>
      </template>
    </div>

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
