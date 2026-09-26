<script setup lang="ts">
import type { LoadState } from '~/types/loadState';
import type { StaffDeskRowView, StaffOutcomeView } from '~/types/staffView';

/**
 * Стойка — `_reference/design/staff/02-desk.html`, пустой список — `02-desk-empty.html`, исходы —
 * `05-desk-issued.html` и `05-desk-not-found.html` (issue #250).
 *
 * Под шапкой — поле кода, крупно: это основное окно. Пятая цифра открывает карточку сама,
 * заказ это или награда — решает сервер. Под полем — плашка исхода: выдано и отменено зелёным,
 * отказ алым (решение Руслана 26-09-2026 — под полем, а не над ним, как в макете).
 *
 * Ниже — «Ждут выдачи» с числом и список: заказы и награды одним списком, свежие сверху.
 * Нажатие на строку открывает карточку. Пусто — словами; не прочиталось — текст из словаря
 * отказов и «Повторить»; пока читается — под заголовком пусто.
 *
 * Сотрудник без офисов (`office` нет) — шапка и одна строка, что его не закрепили: поля кода
 * нет, выдавать ему негде.
 */
defineProps<{
  name: string;
  role: string;
  /** Офис стойки. Нет — сотрудника не закрепили ни за одним офисом. */
  office?: string;
  canChange: boolean;
  outcome: StaffOutcomeView | null;
  state: LoadState;
  rows: StaffDeskRowView[];
  errorText: string;
}>();

const code = defineModel<string>('code', { required: true });

defineEmits<{ profile: []; change: []; complete: [code: string]; open: [id: string]; retry: [] }>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextStaffBar
      :name="name"
      :role="role"
      :office="office"
      :can-change="canChange"
      @profile="$emit('profile')"
      @change="$emit('change')"
    />

    <MoleculesNextMemberNotice
      v-if="!office"
      state="empty"
      size="desk"
      message="Вас ещё не закрепили ни за одним офисом. Попросите руководителя."
    />

    <div v-else class="flex flex-col gap-2.5 px-4 pb-5 pt-3">
      <section class="px-0.5 pb-1 pt-2">
        <h2 class="m-0 font-unbounded text-[17px] font-semibold tracking-[-0.3px]">Код выдачи</h2>
        <p class="m-0 mt-1 text-[13px] font-light text-xb-grey">5 цифр — водитель называет его или показывает в приложении</p>
        <div class="mt-4">
          <AtomsNextStaffCodeField v-model="code" label="Код заказа или награды, пять цифр" @complete="$emit('complete', $event)" />
        </div>
        <div v-if="outcome" class="mt-3.5">
          <MoleculesNextStaffOutcome :outcome="outcome" />
        </div>
      </section>

      <h2 class="mx-0.5 mb-1 mt-[18px] flex items-baseline gap-2 font-unbounded text-[17px] font-semibold tracking-[-0.3px]">
        Ждут выдачи
        <span v-if="state === 'ready' && rows.length > 0" class="font-manrope text-[15px] font-normal tracking-normal text-xb-grey">
          {{ rows.length }}
        </span>
      </h2>

      <template v-if="state === 'ready'">
        <MoleculesNextStaffDeskRow v-for="row in rows" :key="row.id" :row="row" @open="$emit('open', row.id)" />
        <MoleculesNextMemberNotice
          v-if="rows.length === 0"
          state="empty"
          size="desk"
          message="Здесь появятся заказы и награды, которые ждут выдачи."
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
