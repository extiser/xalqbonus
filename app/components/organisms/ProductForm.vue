<script setup lang="ts">
import type { AutosaveState } from '~/composables/useDraftAutosave';
import type { Product } from '#shared/types/catalog';

/**
 * Форма товара — одна на черновик и опубликованный, вместе с фото.
 *
 * **Черновик сохраняет себя сам** (issue #148): кнопки нет, рядом отметка «сохраняем…» или
 * «сохранено», и обязательных полей нет — черновик ещё не дописан, а чего не хватает для
 * публикации, называет страница у кнопки «Опубликовать».
 *
 * **Опубликованный правится как раньше**: поля обязательны, правка уходит кнопкой
 * «Сохранить». Он уже на витрине, и промежуточное состояние набора туда уезжать не должно.
 *
 * Фото стоит в самой форме, рядом с текстом: выбранный файл уходит сразу своим запросом —
 * это файл, и отправлять его с каждой правкой цены незачем. Запрос шлёт страница.
 *
 * Поля принадлежат странице — `v-model` на каждое: у черновика истина то, что на экране,
 * и ответ сервера набранное не перезаписывает.
 *
 * Границы цен стоят свойствами полей: баллы строго больше нуля, сумы — от нуля. Сервер
 * проверяет то же самое заново, потому что запрос приходит не только отсюда
 * (docs/frontend.md → «Обязательное поле — свойство поля»).
 */
const props = defineProps<{
  title: string;
  /** Что правим. `null` — черновика ещё нет, он появится первым действием. */
  product: Product | null;
  mode: 'draft' | 'published';
  autosaveState: AutosaveState;
  autosaveError: string | null;
  /** Сохранение опубликованного в пути. */
  saving: boolean;
  /** Что ответил сервер на сохранение опубликованного. */
  error: string | null;
  uploading: boolean;
  photoError: string | null;
}>();

const emit = defineEmits<{ submit: []; upload: [file: File] }>();

const name = defineModel<string>('name', { required: true });
const description = defineModel<string>('description', { required: true });
const pricePoints = defineModel<string>('pricePoints', { required: true });
const priceRetail = defineModel<string>('priceRetail', { required: true });
const priceCost = defineModel<string>('priceCost', { required: true });

const submit = (): void => {
  if (props.mode === 'published') {
    emit('submit');
  }
};
</script>

<template>
  <MoleculesSectionPanel :title="title">
    <form class="space-y-4" @submit.prevent="submit">
      <MoleculesFormField
        v-model="name"
        label="Название"
        type="text"
        :required="mode === 'published'"
      />
      <MoleculesTextAreaField
        v-model="description"
        label="Описание"
        placeholder="Что это и зачем водителю"
      />

      <div class="grid gap-4 sm:grid-cols-3">
        <MoleculesNumberField
          v-model="pricePoints"
          label="Цена в баллах"
          :min="1"
          :required="mode === 'published'"
          hint="Чем платит водитель."
        />
        <MoleculesNumberField
          v-model="priceRetail"
          label="Розница, сум"
          :min="0"
          :required="mode === 'published'"
          hint="Для отчёта парку."
        />
        <MoleculesNumberField
          v-model="priceCost"
          label="Закупка, сум"
          :min="0"
          :required="mode === 'published'"
          hint="Для стоимости балла."
        />
      </div>

      <OrganismsPhotoField
        :photo-path="product?.photoPath ?? null"
        :updated-at="product?.updatedAt ?? ''"
        :name="name || 'Товар'"
        :uploading="uploading"
        :error="photoError"
        @upload="(file) => emit('upload', file)"
      />

      <MoleculesAutosaveStatus
        v-if="mode === 'draft'"
        :state="autosaveState"
        :error="autosaveError"
      />
      <template v-else>
        <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
        <AtomsSubmitButton label="Сохранить" :disabled="saving" />
      </template>
    </form>
  </MoleculesSectionPanel>
</template>
