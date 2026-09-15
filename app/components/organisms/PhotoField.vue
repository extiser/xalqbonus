<script setup lang="ts">
import { ref } from 'vue';
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB, PHOTO_ACCEPT } from '#shared/photo';

/**
 * Фото в форме товара или рассылки: то, что лежит, и выбор нового файла. Одно поле на обоих —
 * фото у них устроено одинаково (issue #120, #136).
 *
 * **Выбор — это и есть загрузка** (issue #148). Второй кнопки «Загрузить» нет: выбранный файл
 * уходит сразу, тем же запросом, что и раньше, а черновик, если его ещё нет, заводит страница.
 * Поле стоит в самой форме, рядом с текстом, — «сначала сохраните» больше не бывает.
 *
 * **Ограничение живёт свойством поля, а не ответом сервера.** `accept` отсекает лишние типы
 * в самом диалоге выбора, подпись под полем называет формат и потолок сразу, а размер
 * проверяется при выборе — до отправки (`docs/frontend.md` → «Обязательное поле — свойство
 * поля»). Числа приходят из `shared/photo.ts`, откуда их читает и сервер.
 */
withDefaults(
  defineProps<{
    photoPath: string | null;
    /** Время последней правки владельца фото — версия адреса картинки. */
    updatedAt: string;
    /** Подпись картинки для тех, кто её не видит. */
    name: string;
    uploading: boolean;
    /** Что ответил сервер на последнюю попытку. */
    error: string | null;
    /** Что ещё сказать под полем — например, что фото делает текст подписью. */
    note?: string | null;
    /**
     * Можно ли снять фото. У рассылки фото необязательно и выбирается не с первого раза;
     * у товара снятия нет — картинка там заменяется, а не убирается.
     */
    removable?: boolean;
  }>(),
  { note: null, removable: false },
);

const emit = defineEmits<{ upload: [file: File]; remove: [] }>();

/** Отказ по размеру — состояние этого поля, а не ответ сервера. */
const sizeNotice = ref<string | null>(null);

const choose = (file: File | null): void => {
  if (!file) {
    return;
  }

  if (file.size > MAX_PHOTO_BYTES) {
    // Отправлять пять мегабайт, чтобы узнать, что их не примут, — ожидание впустую
    // на мобильной сети в офисе.
    sizeNotice.value = `Файл больше ${MAX_PHOTO_MB} МБ. Выберите другой или уменьшите этот.`;

    return;
  }

  sizeNotice.value = null;
  emit('upload', file);
};
</script>

<template>
  <div class="flex flex-wrap items-start gap-6">
    <div class="space-y-2">
      <MoleculesProductPhoto
        :photo-path="photoPath"
        :updated-at="updatedAt"
        :name="name"
        size="large"
      />
      <AtomsActionButton
        v-if="removable && photoPath"
        label="Убрать фото"
        tone="danger"
        :disabled="uploading"
        @click="emit('remove')"
      />
    </div>

    <div class="min-w-64 flex-1 space-y-2">
      <label class="block">
        <span class="mb-1 block text-sm font-medium text-slate-700">Фото</span>
        <AtomsFileInput :accept="PHOTO_ACCEPT" @change="choose" />
        <span class="mt-1 block text-sm text-slate-500">
          JPEG, PNG или WebP, до {{ MAX_PHOTO_MB }} МБ. Загружается сразу после выбора; прежнее
          фото заменится.
        </span>
        <span v-if="note" class="mt-1 block text-sm text-slate-500">{{ note }}</span>
      </label>

      <p v-if="uploading" class="text-sm text-slate-500">Загружаем фото…</p>
      <p v-else-if="sizeNotice" class="text-sm text-red-700">{{ sizeNotice }}</p>
      <p v-else-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </div>
</template>
