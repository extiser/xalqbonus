<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { GIFT_COVER_SIZE_HINT } from '#shared/gift';
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB, PHOTO_ACCEPT } from '#shared/photo';

/**
 * Обложка подарка на одном языке в форме «Вручить» (issues #219, #236): выбор файла и превью
 * в рамке 16:9 с обрезкой по краям — так, как её увидит водитель в шторке подарка
 * (`_reference/design/gifts/main-screen-gift-sheet-cover.html`). Кто вручает, видит обрезку
 * заранее; за пропорции файл не отвергается.
 *
 * В отличие от фото рассылки, выбор файл не загружает: раздача уходит одним запросом вместе
 * с обложками, и до «Вручить» файл живёт только в форме. Ограничения — из `shared/photo.ts`,
 * те же, что проверяет сервер; размер проверяется при выборе, до отправки.
 */
const props = defineProps<{
  label: string;
  /** Почему поле стало обязательным — выбрана обложка на другом языке. `null` — необязательно. */
  requiredNote: string | null;
  /** Отказ сервера по обложке. */
  error: string | null;
}>();

const file = defineModel<File | null>({ required: true });

/** Перерисовка поля выбора после снятия: значение файлового поля извне не сбросить. */
const fileInputKey = ref(0);
const previewUrl = ref<string | null>(null);
const sizeNotice = ref<string | null>(null);

const releasePreview = (): void => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
};

// Форма очищается после выдачи, сбрасывая модель, — превью и поле уходят следом.
watch(file, (current) => {
  releasePreview();

  if (current === null) {
    fileInputKey.value += 1;

    return;
  }

  previewUrl.value = URL.createObjectURL(current);
});

onBeforeUnmount(releasePreview);

const choose = (chosen: File | null): void => {
  if (chosen && chosen.size > MAX_PHOTO_BYTES) {
    sizeNotice.value = `Файл больше ${MAX_PHOTO_MB} МБ. Выберите другой или уменьшите этот.`;
    file.value = null;

    return;
  }

  sizeNotice.value = null;
  file.value = chosen;
};
</script>

<template>
  <div class="space-y-2">
    <label class="block">
      <span class="mb-1 block text-sm font-medium text-slate-700">{{ label }}</span>
      <AtomsFileInput :key="fileInputKey" :accept="PHOTO_ACCEPT" @change="choose" />
      <span class="mt-1 block text-sm text-slate-500">{{ GIFT_COVER_SIZE_HINT }}</span>
      <span class="mt-1 block text-sm text-slate-500">JPEG, PNG или WebP, до {{ MAX_PHOTO_MB }} МБ.</span>
    </label>
    <p v-if="requiredNote" class="text-sm font-medium text-amber-700">{{ requiredNote }}</p>
    <div class="aspect-video w-64 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <img v-if="previewUrl" :src="previewUrl" :alt="label" class="h-full w-full object-cover" />
      <p v-else class="flex h-full items-center justify-center text-sm text-slate-400">без обложки</p>
    </div>
    <AtomsActionButton v-if="file" label="Убрать обложку" tone="danger" @click="file = null" />
    <p v-if="sizeNotice" class="text-sm text-red-700">{{ sizeNotice }}</p>
    <p v-else-if="props.error" class="text-sm text-red-700">{{ props.error }}</p>
  </div>
</template>
