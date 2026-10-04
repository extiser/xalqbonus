<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { PhX } from '@phosphor-icons/vue';

/**
 * Окно веба — `.modal` в `_reference/design/web/promo/02-new.html` (`codex.md`, «Формы — решено»):
 * ширина 560, скругление 32, поле 28, затемнение под окном. Закрывается крестиком, щелчком
 * по затемнению и Escape. На телефоне, ниже 900, — во весь экран без скругления.
 *
 * На родном `<dialog>`, как `ConfirmDialog`: модальность, перехват фокуса и Escape браузер даёт
 * сам. Открытием управляет вызывающий свойством `open`; окно само себя не закрывает, а говорит
 * `close` — что делать с несохранённым, решает не оно.
 *
 * Содержимое — слотом: форма метки, правка метки.
 */
const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

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
  emit('close');
};

/** Щелчок по затемнению попадает в сам `<dialog>`, щелчок по окну — в его содержимое. */
const onBackdropClick = (event: MouseEvent): void => {
  if (event.target === dialog.value) {
    emit('close');
  }
};
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[calc(100dvh-48px)] w-[calc(100%-48px)] max-w-[560px] overflow-auto rounded-web-tile border-0 bg-web-tile p-0 font-manrope text-[15px] leading-[1.45] text-web-text shadow-[0_24px_60px_rgba(0,0,0,0.6)] inset-ring inset-ring-web-line backdrop:bg-[rgba(4,9,11,0.72)] max-web:h-dvh max-web:max-h-none max-web:w-full max-web:max-w-none max-web:rounded-none"
    :aria-label="title"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div class="p-web-pad max-web:px-4 max-web:py-5">
      <div class="flex items-start justify-between gap-4">
        <h2 class="m-0 font-manrope text-[22px] leading-[1.2] font-bold text-web-text">{{ title }}</h2>
        <button
          type="button"
          aria-label="Закрыть"
          class="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-web-raised text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
          @click="emit('close')"
        >
          <PhX aria-hidden="true" class="size-5" />
        </button>
      </div>
      <slot />
    </div>
  </dialog>
</template>
