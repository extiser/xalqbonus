<script setup lang="ts">
import { computed } from 'vue';
import type {
  Language,
  MiniAppRegisterResponse,
  RegistrationScreenTexts,
} from '#shared/types/miniapp';

/**
 * Экран регистрации водителя: выбор языка, просьба поделиться номером и ответ на попытку.
 *
 * Данных не запрашивает и о ручках не знает: тексты и ответ приходят свойствами, нажатия
 * уходят наверх событиями (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * **Экрана ожидания у кнопки нет.** Закрытие системного окна свайпом не вызывает колбэк
 * вовсе — ни ответа, ни события, — и человек, закрывший его так, остался бы на экране,
 * который не продолжится никогда. Поэтому кнопка гаснет только на время запроса к нашему
 * серверу: тот отвечает всегда (docs/miniapp.md → «Что возвращает клиент»).
 */
const props = defineProps<{
  texts: RegistrationScreenTexts;
  language: Language;
  /** Запрос регистрации в пути: номер уже получен и проверяется. */
  sending: boolean;
  /** Ответ на последнюю попытку. `null` — попыток ещё не было. */
  result: MiniAppRegisterResponse | null;
}>();

defineEmits<{
  'update:language': [language: Language];
  share: [];
}>();

/**
 * Показывать ли кнопку.
 *
 * Под окончательным отказом её нет: она звала бы человека нажать то, что даст тот же
 * ответ. Решает сервер — он же знает, чинится ли исход повтором.
 */
const canShare = computed(() => props.result === null || props.result.canRetry);
</script>

<template>
  <div class="flex flex-1 flex-col gap-6">
    <h1 class="text-xl font-semibold">{{ texts.selectLanguage }}</h1>

    <MoleculesLanguageChoice
      :model-value="language"
      :label-ru="texts.languageRu"
      :label-uz="texts.languageUz"
      @update:model-value="$emit('update:language', $event)"
    />

    <p class="text-base leading-relaxed text-slate-600">{{ texts.askPhone }}</p>

    <div v-if="result" class="flex flex-col gap-4">
      <p class="whitespace-pre-line rounded-2xl bg-slate-50 px-4 py-4 text-base leading-relaxed">
        {{ result.message }}
      </p>
      <MoleculesOfficeList v-if="result.offices.length > 0" :offices="result.offices" />
    </div>

    <p v-if="sending" class="text-sm text-slate-500">{{ texts.checkingPhone }}</p>

    <div class="mt-auto pt-6">
      <AtomsMiniAppButton
        v-if="canShare"
        :label="texts.sendPhone"
        :disabled="sending"
        @click="$emit('share')"
      />
    </div>
  </div>
</template>
