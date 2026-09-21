<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

/**
 * Диалог подтверждения в виде веба — вместо браузерного `confirm`.
 *
 * Браузерный диалог выглядит по-разному в каждом браузере, не подписывает кнопки по смыслу
 * («OK» вместо «Уйти без сохранения») и не даёт отличить опасное действие от безопасного.
 * Здесь кнопки подписаны действиями, а фокус при открытии получает безопасная.
 *
 * Построен на родном `<dialog>`: модальность, перехват фокуса и закрытие по Escape браузер
 * даёт сам, и писать их заново незачем. Escape и клик мимо окна — отказ, а не согласие.
 *
 * Открытием управляет вызывающий свойством `open`: диалог сам себя не закрывает, а сообщает
 * ответ событием — решение, что делать дальше, не его.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    /** `danger` — подтверждение что-то теряет или необратимо. */
    tone?: 'primary' | 'danger';
  }>(),
  { tone: 'danger' },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);

const sync = (open: boolean): void => {
  const element = dialog.value;

  if (!element) {
    return;
  }

  if (open && !element.open) {
    element.showModal();
  } else if (!open && element.open) {
    element.close();
  }
};

onMounted(() => sync(props.open));
watch(() => props.open, sync);

/** Escape: браузер закрыл бы окно сам, но закрывает его вызывающий — через `open`. */
const onCancel = (event: Event): void => {
  event.preventDefault();
  emit('cancel');
};

/** Клик по подложке попадает в сам `<dialog>`, клик по окну — в его содержимое. */
const onBackdropClick = (event: MouseEvent): void => {
  if (event.target === dialog.value) {
    emit('cancel');
  }
};
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div class="space-y-4 px-5 py-4">
      <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
      <!-- Переводы строк в тексте сохраняются: подтверждение запуска акции держит отдельной
           строкой то, что состав больше не пересчитывается (issue #166). -->
      <p class="text-sm whitespace-pre-line text-slate-600">{{ message }}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <!-- Первой в разметке — безопасная: `showModal` ставит фокус на первое, что его принимает. -->
        <AtomsActionButton :label="cancelLabel" @click="emit('cancel')" />
        <AtomsActionButton :label="confirmLabel" :tone="tone" @click="emit('confirm')" />
      </div>
    </div>
  </dialog>
</template>
