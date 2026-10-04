<script setup lang="ts">
import { PhKey, PhSignOut } from '@phosphor-icons/vue';
import { EMPLOYEE_ROLE_LABELS } from '#shared/employeeRoles';
import type { EmployeeIdentity } from '#shared/types/employee';

/**
 * Меню аккаунта веба — `.acct-menu` кодекса `_reference/design/web/codex.html`: «Сменить пароль»
 * и «Выйти» (подписи Руслана, `codex.md`, «Раскладка и меню»).
 *
 * На телефоне сверху — имя и роль: блока «кто вошёл» там нет, и ответ на вопрос «под кем я»
 * переезжает сюда. На ноутбуке они и так видны в блоке под меню.
 *
 * Где меню встаёт и когда открыто — решает тот, кто его ставит. Выход сам не делает: отдаёт
 * событие наверх (docs/frontend.md → «Данные в компоненты не ходят»).
 */
defineProps<{
  employee: EmployeeIdentity;
}>();

defineEmits<{ signOut: [] }>();

const ROW_CLASSES =
  'flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-[11px] text-left font-manrope text-[14px] font-medium text-web-text no-underline hover:bg-web-tile focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web-cyan';
const ICON_CLASSES = 'size-5 shrink-0 text-web-grey';
</script>

<template>
  <div class="rounded-2xl bg-web-raised p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] inset-ring inset-ring-web-line">
    <div class="mb-1 hidden border-b border-web-line px-3 pt-2.5 pb-2 text-[13px] text-web-title max-web:block">
      <b class="font-semibold text-web-text">{{ employee.fullName }}</b><br />{{ EMPLOYEE_ROLE_LABELS[employee.role] }}
    </div>
    <NuxtLink to="/password" :class="ROW_CLASSES">
      <PhKey weight="duotone" aria-hidden="true" :class="ICON_CLASSES" />
      Сменить пароль
    </NuxtLink>
    <button type="button" :class="ROW_CLASSES" @click="$emit('signOut')">
      <PhSignOut weight="duotone" aria-hidden="true" :class="ICON_CLASSES" />
      Выйти
    </button>
  </div>
</template>
