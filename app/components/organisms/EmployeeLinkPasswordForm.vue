<script setup lang="ts">
import { computed, ref } from 'vue';
import { PASSWORD_MIN_LENGTH } from '#shared/employee';

/**
 * Пароль по одноразовой ссылке (issue #267): страница приглашения и страница «задать пароль»
 * после сброса. Над полями — кто это: имя, роль, телефон для входа; поля — пароль и повтор.
 *
 * Повтор сверяется здесь, до запроса: не совпал — строка под вторым полем, и запрос не уходит.
 * В ручку уезжает одно поле — повтор нужен только человеку, чтобы не задать пароль с опечаткой,
 * которой он не видел. Правило длины — у сервера, его отказ встаёт под первым полем.
 */
defineProps<{
  facts: { label: string; value: string }[];
  submitLabel: string;
  submitting: boolean;
  /** Отказ сервера по паролю. */
  passwordError: string | null;
  /** Отказ не про поле: телефон занят, ручка не ответила. */
  error: string | null;
}>();

const emit = defineEmits<{ submit: [password: string] }>();

const password = ref('');
const repeat = ref('');
const mismatch = ref(false);

const PASSWORD_HINT = `Не короче ${PASSWORD_MIN_LENGTH} символов.`;

const repeatError = computed(() => (mismatch.value ? 'Пароли не совпадают.' : null));

const submit = (): void => {
  mismatch.value = password.value !== repeat.value;

  if (!mismatch.value) {
    emit('submit', password.value);
  }
};
</script>

<template>
  <div class="space-y-6">
    <dl class="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white px-3">
      <MoleculesFactRow v-for="fact in facts" :key="fact.label" :label="fact.label" :value="fact.value" />
    </dl>

    <form class="space-y-4" @submit.prevent="submit">
      <MoleculesFormField
        v-model="password"
        label="Пароль"
        type="password"
        autocomplete="new-password"
        :hint="PASSWORD_HINT"
        :error="passwordError"
        autofocus
        required
      />
      <MoleculesFormField
        v-model="repeat"
        label="Пароль ещё раз"
        type="password"
        autocomplete="new-password"
        :error="repeatError"
        required
      />

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

      <div class="grid">
        <AtomsSubmitButton :label="submitting ? 'Сохраняем…' : submitLabel" size="large" :disabled="submitting" />
      </div>
    </form>
  </div>
</template>
