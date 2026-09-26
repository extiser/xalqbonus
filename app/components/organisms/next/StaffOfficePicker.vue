<script setup lang="ts">
import type { LoadState } from '~/types/loadState';
import type { StaffOfficeView } from '~/types/staffView';

/**
 * Выбор офиса — `_reference/design/staff/01-office-picker.html` (issue #250).
 *
 * Показывается, когда офисов у сотрудника больше одного и офис ещё не выбран. У владельца
 * и админа открыты все работающие офисы — они видят этот экран всегда; менеджер с одним офисом
 * попадает сразу на стойку.
 *
 * Офисы с числом ждущих родитель читает при каждом показе. Пока читает — под заголовком пусто;
 * не прочитались — текст из словаря отказов и «Повторить».
 */
defineProps<{
  name: string;
  role: string;
  state: LoadState;
  offices: StaffOfficeView[];
  errorText: string;
}>();

defineEmits<{ profile: []; select: [officeId: string]; retry: [] }>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextStaffBar :name="name" :role="role" @profile="$emit('profile')" />

    <div class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <h2 class="mx-0.5 mb-1 mt-[18px] font-unbounded text-[17px] font-semibold tracking-[-0.3px]">Выберите офис</h2>

      <template v-if="state === 'ready'">
        <MoleculesNextStaffOfficeCard
          v-for="office in offices"
          :key="office.id"
          :office="office"
          @select="$emit('select', office.id)"
        />
      </template>
      <MoleculesNextMemberNotice
        v-else-if="state === 'error'"
        state="error"
        size="desk"
        :message="errorText"
        retry-label="Повторить"
        @retry="$emit('retry')"
      />
    </div>
  </div>
</template>
