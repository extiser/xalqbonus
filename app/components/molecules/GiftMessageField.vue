<script setup lang="ts">
import { computed } from 'vue';
import { MAILING_TEXT_MAX_LENGTH } from '#shared/mailing';

/**
 * Свой текст сообщения о подарке на одном языке (issue #236), видом поля текста рассылки.
 *
 * Поле необязательно, и над ним стоит то, что уйдёт, если его не заполнить, — системный
 * текст этого языка с суммой, поводом и датой из формы. Заполненное уходит сверху, а под ним
 * системная строка: об этом строка под заполненным полем. Счётчик стоит всегда, и у пустого
 * поля тоже, и меряет остаток уже за вычетом системной строки.
 */
const props = defineProps<{
  label: string;
  /** Системный текст целиком. `null` — предпросмотр ещё не пришёл. */
  systemText: string | null;
  /** Системная строка под своим текстом. `null` — предпросмотр ещё не пришёл. */
  footer: string | null;
  /** Сколько знаков остаётся своему тексту — предел сообщения за вычетом системной строки. */
  limit: number | null;
  /** Отказ сервера по полю. */
  error: string | null;
}>();

const model = defineModel<string>({ required: true });

/** Длина так, как её меряет сервер, — по обрезанному краям. */
const length = computed(() => model.value.trim().length);
const tooLong = computed(() => props.limit !== null && length.value > props.limit);
</script>

<template>
  <div>
    <label class="block">
      <span class="mb-1 block text-sm font-medium text-slate-700">{{ label }}</span>
      <span class="mb-2 block rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span class="block text-xs text-slate-500">Если оставить пустым, уйдёт этот текст</span>
        <span class="mt-1 block text-sm whitespace-pre-line text-slate-500">{{ systemText ?? '…' }}</span>
      </span>
      <AtomsTextArea
        v-model="model"
        :rows="4"
        :maxlength="MAILING_TEXT_MAX_LENGTH"
        :invalid="error !== null || tooLong"
      />
    </label>
    <p v-if="length > 0 && footer !== null" class="mt-1 text-sm text-slate-500">
      Под вашим текстом добавится: „{{ footer }}“
    </p>
    <!-- Счётчик — и у пустого поля, как у повода: сколько влезет, видно до первого знака.
         Предела нет, только пока предпросмотр не пришёл: он зависит от системной строки. -->
    <MoleculesLengthCounter v-if="limit !== null" :length="length" :limit="limit" />
    <p v-if="error" class="mt-1 text-sm text-red-700">{{ error }}</p>
  </div>
</template>
