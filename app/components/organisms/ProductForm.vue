<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Product, ProductRequestBody } from '#shared/types/catalog';

/**
 * Форма товара — одна на заведение и правку, как и у офиса.
 *
 * Фото в неё не входит: это файл, и уезжает он своим запросом, к уже заведённому товару.
 * Иначе форма заведения либо требовала бы картинку, либо отправляла два запроса подряд,
 * второй из которых мог бы не дойти.
 *
 * Границы цен стоят свойствами полей: баллы строго больше нуля, сумы — от нуля. Проверяет их
 * браузер, рядом с полем; сервер проверяет то же самое заново, потому что запрос приходит
 * не только отсюда (docs/frontend.md → «Обязательное поле — свойство поля»).
 */
const props = defineProps<{
  title: string;
  submitLabel: string;
  product: Product | null;
  saving: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ submit: [body: ProductRequestBody] }>();

const name = ref('');
const description = ref('');
const pricePoints = ref('');
const priceRetail = ref('');
const priceCost = ref('');

watch(
  () => props.product,
  (product) => {
    name.value = product?.name ?? '';
    description.value = product?.description ?? '';
    pricePoints.value = product === null ? '' : String(product.pricePoints);
    priceRetail.value = product === null ? '' : String(product.priceRetail);
    priceCost.value = product === null ? '' : String(product.priceCost);
  },
  { immediate: true },
);

const submit = (): void => {
  emit('submit', {
    name: name.value,
    description: description.value,
    pricePoints: Number(pricePoints.value),
    priceRetail: Number(priceRetail.value),
    priceCost: Number(priceCost.value),
  });
};
</script>

<template>
  <MoleculesSectionPanel :title="title">
    <form class="space-y-4" @submit.prevent="submit">
      <MoleculesFormField v-model="name" label="Название" type="text" required />
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
          required
          hint="Чем платит водитель."
        />
        <MoleculesNumberField
          v-model="priceRetail"
          label="Розница, сум"
          :min="0"
          required
          hint="Для отчёта парку."
        />
        <MoleculesNumberField
          v-model="priceCost"
          label="Закупка, сум"
          :min="0"
          required
          hint="Для стоимости балла."
        />
      </div>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

      <AtomsSubmitButton :label="submitLabel" :disabled="saving" />
    </form>
  </MoleculesSectionPanel>
</template>
