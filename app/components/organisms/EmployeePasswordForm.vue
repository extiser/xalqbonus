<script setup lang="ts">
/**
 * Пароль для входа с компьютера — пункт экрана сотрудника в Mini App (issue #130).
 *
 * Только задать, не сменить: пункт открывается тому, у кого пароля нет, и размыкает круг
 * «без пароля нет веба» ровно один раз. Смена пароля живёт в вебе, на `/password`. Прежнего
 * пароля форма не спрашивает — человек уже подтверждён подписью Telegram.
 *
 * После успеха формы нет: пустое поле под «Пароль сохранён» читалось как незаконченное действие
 * и звало повторить сделанное (прогон на стенде 14-09-2026). Остаются подтверждение и «Готово».
 */
defineProps<{
  submitting: boolean;
  error: string | null;
  saved: boolean;
}>();

const password = defineModel<string>({ required: true });

defineEmits<{ submit: []; done: [] }>();

/** Дословно как на странице `/password` в вебе: правило одно, и формулировка у него одна. */
const PASSWORD_HINT = 'Не короче десяти символов.';
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">Пароль для входа с компьютера</h1>
      <p class="text-base leading-relaxed text-slate-700">
        С компьютера входят по номеру телефона и этому паролю.
      </p>
    </header>

    <template v-if="saved">
      <p class="rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
        Пароль сохранён. Входите с компьютера по номеру телефона и этому паролю.
      </p>

      <AtomsMiniAppButton label="Готово" @click="$emit('done')" />
    </template>

    <form v-else class="flex flex-col gap-4" @submit.prevent="$emit('submit')">
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
