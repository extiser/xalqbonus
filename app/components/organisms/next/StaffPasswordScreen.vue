<script setup lang="ts">
import { useTemplateRef } from 'vue';

/**
 * Пароль для входа с компьютера — `_reference/design/staff/06-password.html`, сохранён —
 * `06-password-saved.html` (issue #250). Открывается из профиля строкой «Задать».
 *
 * Пояснение называет номер, по которому входить: гадать, какой, не придётся. Два поля — пароль
 * и повтор. Повтор сверяется в приложении, до запроса: не совпали — «Пароли не совпадают» под
 * вторым полем, и запрос не уходит. Решает это родитель; правило длины — у сервера, его отказ
 * встаёт под первым полем. Пустые поля останавливает браузер (`required`).
 *
 * Сохранено — зелёная плашка под полями и «Готово» вместо «Сохранить» и «Назад»: обратно
 * в профиль, где строка уже «Задан».
 */
defineProps<{
  /** «+998 90 765-43-21». */
  phone: string;
  submitting: boolean;
  /** Отказ сервера. */
  error: string | null;
  mismatch: boolean;
  saved: boolean;
}>();

const password = defineModel<string>('password', { required: true });
const repeat = defineModel<string>('repeat', { required: true });

const emit = defineEmits<{ back: []; save: []; done: [] }>();

const form = useTemplateRef<HTMLFormElement>('form');

/** «Сохранить» — через форму: пустые поля браузер остановит сам, рядом с полем. */
const submit = (): void => {
  form.value?.requestSubmit();
};
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(24px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar title="Задать пароль" back-label="Назад" @back="$emit('back')" />

    <form ref="form" class="grow px-4 pt-5" @submit.prevent="emit('save')">
      <p class="m-0 text-[15px] font-light leading-normal text-xb-grey">
        С компьютера входят по номеру <b class="whitespace-nowrap font-semibold text-xb-text">{{ phone }}</b> и этому паролю.
      </p>

      <MoleculesNextStaffPasswordField
        v-model="password"
        label="Пароль"
        placeholder="Не короче 10 символов"
        :hint="saved ? undefined : 'Не короче 10 символов'"
        :error="error ?? undefined"
        required
      />
      <MoleculesNextStaffPasswordField
        v-model="repeat"
        label="Повторите пароль"
        placeholder="Тот же пароль ещё раз"
        :error="mismatch ? 'Пароли не совпадают' : undefined"
        required
      />

      <div v-if="saved" class="mt-3.5">
        <MoleculesNextStaffOutcome
          :outcome="{ tone: 'ok', text: 'Пароль сохранён. Входите с компьютера по номеру телефона и этому паролю.' }"
        />
      </div>
    </form>

    <div class="flex flex-col gap-2.5 px-4 pt-4">
      <AtomsNextMemberButton v-if="saved" size="l" tone="garnet" @click="$emit('done')">Готово</AtomsNextMemberButton>
      <template v-else>
        <AtomsNextMemberButton size="l" tone="garnet" :busy="submitting" @click="submit">Сохранить</AtomsNextMemberButton>
        <div class="relative z-[2]">
          <AtomsNextMemberButton size="l" tone="grey" :disabled="submitting" @click="$emit('back')">Назад</AtomsNextMemberButton>
        </div>
      </template>
    </div>
  </div>
</template>
