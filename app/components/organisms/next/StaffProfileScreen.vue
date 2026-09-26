<script setup lang="ts">
import type { MemberProfileFieldView } from '~/types/memberView';
import type { StaffProfileOfficeView } from '~/types/staffView';

/**
 * Профиль сотрудника — `_reference/design/staff/06-profile.html`, пароль задан —
 * `06-profile-password-set.html` (issue #250). Устройство — как профиль водителя
 * (`MemberProfileScreen`): карточка человека, группы строками, сброс сессии отдельной кнопкой.
 *
 * Открывается с аватара на выборе офиса и на стойке. Сюда уехал «Пароль для входа с компьютера»:
 * на рабочих экранах он светился постоянно. Не задан — «Задать» с шевроном, ведёт на форму;
 * задан — «Задан» серым, строка не нажимается, под карточкой — почему: сменить можно на сайте.
 *
 * «Сбросить сессию» — через шторку подтверждения, как у водителя. Пока сброс в пути, «Сбросить»
 * ждёт с кольцом, «Отменить» гаснет.
 */
withDefaults(
  defineProps<{
    /** Имя из учётки — одной строкой: фамилию в имени из Telegram не угадать. */
    name: string;
    fields: MemberProfileFieldView[];
    offices: StaffProfileOfficeView[];
    passwordLabel: string;
    passwordSet: boolean;
    resetOpen: boolean;
    resetting?: boolean;
  }>(),
  { resetting: false },
);

defineEmits<{ back: []; password: []; askReset: []; reset: []; close: [] }>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar title="Профиль" back-label="Назад" @back="$emit('back')" />

    <div class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <AtomsNextMemberCard tone="plain" divided>
        <MoleculesNextMemberPersonHead :last-name="name" />
        <MoleculesNextMemberFieldRow v-for="field in fields" :key="field.id" :label="field.label" :value="field.value" />
      </AtomsNextMemberCard>

      <template v-if="offices.length > 0">
        <div class="px-0.5 pb-0.5 pt-[18px]">
          <AtomsNextMemberGroupLabel label="Офисы" />
        </div>
        <AtomsNextMemberCard tone="plain" divided>
          <div v-for="office in offices" :key="office.id" class="box-content flex min-h-[52px] items-center gap-3 px-4">
            <span class="grow text-[15px] font-semibold text-xb-text">{{ office.name }}</span>
            <span class="text-right text-[13px] font-light text-xb-grey">{{ office.address }}</span>
          </div>
        </AtomsNextMemberCard>
      </template>

      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel label="Настройки" />
      </div>
      <AtomsNextMemberCard tone="plain" divided>
        <MoleculesNextMemberSettingRow
          :label="passwordLabel"
          :value="passwordSet ? 'Задан' : 'Задать'"
          :inert="passwordSet"
          @open="$emit('password')"
        />
      </AtomsNextMemberCard>
      <p v-if="passwordSet" class="m-0 -mt-0.5 px-1 text-[13px] font-light text-xb-grey">Сменить можно на сайте</p>

      <div class="mt-[22px]">
        <AtomsNextMemberButton size="l" tone="danger" @click="$emit('askReset')">Сбросить сессию</AtomsNextMemberButton>
      </div>
    </div>

    <MoleculesNextMemberSheet
      :open="resetOpen"
      title="Сбросить сессию?"
      :subtitle="[
        'Приложение закроется, а бот пришлёт кнопку «Открыть приложение» — нажмите её, и всё загрузится заново.',
        'Учётная запись не изменится.',
      ]"
      @close="$emit('close')"
    >
      <template #buttons>
        <AtomsNextMemberButton size="l" tone="scarlet" :busy="resetting" @click="$emit('reset')">Сбросить</AtomsNextMemberButton>
        <AtomsNextMemberButton size="l" tone="grey" :disabled="resetting" @click="$emit('close')">Отменить</AtomsNextMemberButton>
      </template>
    </MoleculesNextMemberSheet>
  </div>
</template>
