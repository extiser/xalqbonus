<script setup lang="ts">
/**
 * Пароль для входа с компьютера — пункт экрана сотрудника в Mini App (issue #130).
 *
 * Задать и сменить — одна форма: ручка одна, и сотруднику без пароля и с паролем она говорит
 * одно и то же. Прежнего пароля не спрашивает — человек уже подтверждён подписью Telegram.
 *
 * Подтверждение стоит над полем, отказ — под ним, как на стойке выдачи: первое читают после
 * действия, второе — вместо результата.
 */
defineProps<{
  submitting: boolean;
  error: string | null;
  saved: boolean;
}>();

const password = defineModel<string>({ required: true });

defineEmits<{ submit: [] }>();

/** Дословно как на странице `/password` в вебе: правило одно, и формулировка у него одна. */
const PASSWORD_HINT = 'Не короче десяти символов.';
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">Пароль для входа с компьютера</h1>
      <p class="text-base leading-relaxed text-slate-700">
        С компьютера входят по номеру телефона и этому паролю. Если пароль уже был, новый его заменит,
        а прежние входы в веб закроются.
      </p>
    </header>

    <p v-if="saved" class="rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
      Пароль сохранён. Входите с компьютера по номеру телефона и этому паролю.
    </p>

    <form class="flex flex-col gap-4" @submit.prevent="$emit('submit')">
      <MoleculesFormField
        v-model="password"
        label="Новый пароль"
        type="password"
        autocomplete="new-password"
        :hint="PASSWORD_HINT"
        :error="error"
      />

      <AtomsMiniAppButton
        type="submit"
        :label="submitting ? 'Сохраняем…' : 'Сохранить пароль'"
        :disabled="submitting"
      />
    </form>
  </section>
</template>
