<script setup lang="ts">
import { ref } from 'vue';
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB, PHOTO_ACCEPT } from '#shared/photo';
import type { Product } from '#shared/types/catalog';

/**
 * Фото товара: то, что лежит, и выбор нового файла.
 *
 * **Ограничение живёт свойством поля, а не ответом сервера.** `accept` отсекает лишние типы
 * в самом диалоге выбора, подпись под полем называет формат и потолок сразу, а размер
 * проверяется при выборе — до отправки. Это ровно тот случай, что описан в `docs/frontend.md`
 * → «Обязательное поле — свойство поля»: ограничение поля останавливает человека рядом
 * с полем, а ответ сервера остаётся ответом неполному запросу из чужого клиента.
 *
 * Поэтому текст про формат и размер написан здесь — единственное место, где текст
 * ограничения живёт в компоненте, и по той же причине, по которой `required` показывает
 * браузер. Числа при этом не выписаны строкой: они приходят из `shared/photo.ts`, откуда
 * их читает и сервер.
 */
defineProps<{
  product: Product;
  uploading: boolean;
  /** Что ответил сервер на последнюю попытку. */
  error: string | null;
}>();

const emit = defineEmits<{ upload: [file: File] }>();

/** Выбранный файл и отказ по размеру — состояние этой формы, а не ответ сервера. */
const chosen = ref<File | null>(null);
const sizeNotice = ref<string | null>(null);

const choose = (file: File | null): void => {
  if (file && file.size > MAX_PHOTO_BYTES) {
    // Файл не принимается, и сказано об этом здесь же, не дожидаясь запроса: отправлять
    // пять мегабайт, чтобы узнать, что их не примут, — это ожидание впустую на мобильной
    // сети в офисе.
    chosen.value = null;
    sizeNotice.value = `Файл больше ${MAX_PHOTO_MB} МБ. Выберите другой или уменьшите этот.`;

    return;
  }

  chosen.value = file;
  sizeNotice.value = null;
};

const submit = (): void => {
  if (chosen.value) {
    emit('upload', chosen.value);
  }
};
</script>

<template>
  <MoleculesSectionPanel title="Фото">
    <div class="flex flex-wrap items-start gap-6">
      <MoleculesProductPhoto
        :photo-path="product.photoPath"
        :updated-at="product.updatedAt"
        :name="product.name"
        size="large"
      />

      <form class="min-w-64 flex-1 space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-slate-700">Новый файл</span>
          <AtomsFileInput :accept="PHOTO_ACCEPT" required @change="choose" />
          <span class="mt-1 block text-sm text-slate-500">
            JPEG, PNG или WebP, до {{ MAX_PHOTO_MB }} МБ. Прежнее фото заменится.
          </span>
        </label>

        <p v-if="sizeNotice" class="text-sm text-red-700">{{ sizeNotice }}</p>
        <p v-else-if="error" class="text-sm text-red-700">{{ error }}</p>

        <AtomsSubmitButton label="Загрузить фото" :disabled="uploading || chosen === null" />
      </form>
    </div>
  </MoleculesSectionPanel>
</template>
