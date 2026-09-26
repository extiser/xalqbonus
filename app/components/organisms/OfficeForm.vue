<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Office, OfficeRequestBody } from '#shared/types/catalog';

/**
 * Форма офиса — одна на заведение и правку.
 *
 * Одна, потому что поля те же: вторая форма с теми же шестью полями разошлась бы с первой
 * на первой же новой колонке. Что именно происходит, видно по заголовку и подписи кнопки,
 * и приходят они снаружи.
 *
 * Обязательные поля помечены `required`: пустую форму останавливает браузер — сам, рядом
 * с полем, на языке человека (docs/frontend.md → «Обязательное поле — свойство поля»).
 * Своей проверки «заполните название» в обработчике отправки нет.
 *
 * `readonly` — ДЕМО ОФИС у того, кто его не правит (issue #212): поля видны, но закрыты,
 * и кнопки нет. Поле «Демо» нового офиса ставит страница — здесь его нет.
 */
const props = defineProps<{
  title: string;
  submitLabel: string;
  /** Что правим. `null` — заводим новый офис, и поля пусты. */
  office: Office | null;
  /** Запрос в пути: кнопка гаснет, чтобы форма не ушла дважды. */
  saving: boolean;
  /** Что ответил сервер на последнюю попытку. `null` — ответа ждать нечего. */
  error: string | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{ submit: [body: OfficeRequestBody] }>();

const name = ref('');
const address = ref('');
const mapUrl = ref('');
const workHours = ref('');
const phoneE164 = ref('');
const telegram = ref('');

/**
 * Поля заполняются из свойства и переписываются, когда оно меняется: страница офиса получает
 * его вторым кадром — после ответа ручки, — и форма, заполненная только на первом,
 * осталась бы пустой.
 */
watch(
  () => props.office,
  (office) => {
    name.value = office?.name ?? '';
    address.value = office?.address ?? '';
    mapUrl.value = office?.mapUrl ?? '';
    workHours.value = office?.workHours ?? '';
    phoneE164.value = office?.phoneE164 ?? '';
    telegram.value = office?.telegram ?? '';
  },
  { immediate: true },
);

const submit = (): void => {
  emit('submit', {
    name: name.value,
    address: address.value,
    mapUrl: mapUrl.value,
    workHours: workHours.value,
    phoneE164: phoneE164.value,
    telegram: telegram.value,
  });
};
</script>

<template>
  <MoleculesSectionPanel :title="title">
    <form @submit.prevent="submit">
      <fieldset :disabled="readonly" class="min-w-0 space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <MoleculesFormField v-model="name" label="Название" type="text" required />
          <MoleculesFormField v-model="address" label="Адрес" type="text" required />
          <MoleculesFormField
            v-model="mapUrl"
            label="Ссылка на карту"
            type="url"
            placeholder="https://yandex.uz/maps/…"
            hint="Адрес и ссылка — разные поля: в сообщение водителю идёт адрес."
          />
          <MoleculesFormField
            v-model="workHours"
            label="Часы работы"
            type="text"
            placeholder="Пн–Сб 09:00–18:00"
          />
          <MoleculesFormField v-model="phoneE164" label="Телефон" type="tel" placeholder="+998…" />
          <MoleculesFormField v-model="telegram" label="Telegram" type="text" placeholder="@office" />
        </div>

        <slot />

        <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

        <AtomsSubmitButton v-if="!readonly" :label="submitLabel" :disabled="saving" />
      </fieldset>
    </form>
  </MoleculesSectionPanel>
</template>
