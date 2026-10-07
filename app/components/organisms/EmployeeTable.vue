<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatDate, formatDateTime } from '~/utils/format';
import { employeeRoleLabel } from '~/utils/labels';
import { formatPhone } from '#shared/phone';
import type { EmployeeAccount, EmployeePendingInvite } from '#shared/types/employee';
import type { LoadState } from '~/types/loadState';
import type { SelectOption } from '~/types/selectOption';

/**
 * Сотрудники парка и висящие приглашения — одним списком: приглашение и есть будущая
 * учётка, и искать её в другом блоке значит не найти.
 *
 * Кнопки показываются по признакам с сервера (`manageable`, `revocable`), а не по роли
 * смотрящего: правило «строго ниже своей» живёт на сервере одно.
 *
 * Офисы здесь только показываются: закрепление правится на странице офиса (issue #132 →
 * «Не делать»).
 *
 * Ссылки — приглашения и «задать пароль» — видны, пока живы, и копируются (issue #267): их
 * пересылают человеку, и потерять ссылку, не успев отправить, больше нельзя. Приезжают они
 * только тому, кто вправе их выпустить. Истекла ссылка пароля — «Сбросить пароль» выпускает
 * новую.
 *
 * Привязан ли Telegram, видно в каждой строке: руководитель выпускает ссылку привязки сам
 * и по списку видит, дошло ли дело (issue #267). Кнопка «Ссылка для Telegram» — у непривязанной
 * учётки, которой смотрящий вправе её выпустить: чужой управляемой и своей.
 *
 * «Сменить роль» (issue #291) — у учётки, которую смотрящий вправе перевести: выбор из ролей,
 * приехавших с сервера (`assignableRoles`), подтверждение — на экране, решение — у ручки.
 *
 * Выключенные учётки по умолчанию скрыты: список — о тех, кто работает. Галочка «Показать
 * выключенных» их возвращает; её состояние не запоминается — открыл экран заново, видишь
 * работающих (issue #291). Сервер отдаёт всех: фильтр только здесь.
 */

/** Кнопка ссылки привязки: Telegram не привязан, право есть, живой ссылки нет. */
const canIssueTelegram = (account: EmployeeAccount): boolean =>
  !account.telegramBound && account.telegramLinkIssuable && account.telegramLink === null;
const props = defineProps<{
  accountsState: LoadState;
  accounts: EmployeeAccount[] | null;
  invitesState: LoadState;
  invites: EmployeePendingInvite[] | null;
  /** Учётка или приглашение, над которым идёт действие: его кнопки на это время гаснут. */
  busyId: string | null;
  error: string | null;
}>();

const emit = defineEmits<{
  disable: [employeeId: string];
  enable: [employeeId: string];
  resetPassword: [employeeId: string];
  issueTelegramLink: [employeeId: string];
  changeRole: [employeeId: string, role: EmployeeAccount['role']];
  revoke: [inviteId: string];
}>();

const showDisabled = ref(false);

const disabledCount = computed(() => (props.accounts ?? []).filter((account) => account.disabled).length);

const visibleAccounts = computed(() =>
  (props.accounts ?? []).filter((account) => showDisabled.value || !account.disabled),
);

/** Учётка, у которой открыт выбор новой роли. Одна за раз: выбор — короткое действие. */
const roleEditorFor = ref<string | null>(null);
const chosenRole = ref('');

const roleOptions = (account: EmployeeAccount): SelectOption[] =>
  account.assignableRoles.map((role) => ({ value: role, label: employeeRoleLabel(role) }));

const openRoleEditor = (employeeId: string): void => {
  roleEditorFor.value = employeeId;
  chosenRole.value = '';
};

const closeRoleEditor = (): void => {
  roleEditorFor.value = null;
  chosenRole.value = '';
};

const submitRole = (account: EmployeeAccount): void => {
  const role = account.assignableRoles.find((entry) => entry === chosenRole.value);

  if (role) {
    emit('changeRole', account.employeeId, role);
    closeRoleEditor();
  }
};

/** Загрузка и отказ — по худшему из двух запросов: половина списка выдавала бы себя за весь. */
const state = computed<LoadState>(() => {
  if (props.accountsState === 'error' || props.invitesState === 'error') {
    return 'error';
  }

  return props.accountsState === 'loading' || props.invitesState === 'loading'
    ? 'loading'
    : 'ready';
});

const empty = computed(
  () => (props.accounts ?? []).length === 0 && (props.invites ?? []).length === 0,
);
</script>

<template>
  <MoleculesSectionPanel
    title="Сотрудники"
    note="Доступ решает роль. Выключенная учётная запись не входит ни в веб, ни в приложение; сброшенный пароль сотрудник задаёт себе сам — по ссылке, которую вы ему перешлёте."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем сотрудников…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Список сотрудников не прочитался. Это отказ запроса, а не отсутствие сотрудников."
    />
    <MoleculesStateNotice v-else-if="empty" state="empty" message="Сотрудников ещё не заводили." />
    <div v-else class="space-y-4">
      <label v-if="disabledCount > 0" class="flex items-center gap-3">
        <input
          v-model="showDisabled"
          type="checkbox"
          class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        />
        <span class="text-sm text-slate-700">Показать выключенных ({{ disabledCount }})</span>
      </label>
      <ul>
        <li
          v-for="invite in invites ?? []"
          :key="invite.inviteId"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
        >
          <div class="min-w-48 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="text-sm font-semibold text-slate-900">{{ invite.fullName ?? 'Приглашение' }}</span>
              <span class="text-sm text-slate-500">{{ employeeRoleLabel(invite.role) }}</span>
              <AtomsStatusBadge tone="warn" label="Приглашение ждёт" />
            </div>
            <p v-if="invite.phoneE164" class="ym-hide-content mt-0.5 text-xs text-slate-500">
              {{ formatPhone(invite.phoneE164).display }}
            </p>
            <p class="mt-0.5 text-xs text-slate-500">
              Выписал {{ invite.invitedByName }} {{ formatDate(invite.createdAt) }}, действует до
              {{ formatDateTime(invite.expiresAt) }}
            </p>
          </div>
          <AtomsActionButton
            v-if="invite.revocable && invite.link === null"
            label="Отозвать"
            tone="danger"
            :disabled="busyId === invite.inviteId"
            @click="emit('revoke', invite.inviteId)"
          />
          <div v-if="invite.link" class="w-full">
            <MoleculesCopyableLink :link="invite.link">
              <template #actions>
                <AtomsActionButton
                  v-if="invite.revocable"
                  label="Отозвать"
                  tone="danger"
                  :disabled="busyId === invite.inviteId"
                  @click="emit('revoke', invite.inviteId)"
                />
              </template>
            </MoleculesCopyableLink>
          </div>
        </li>

        <li
          v-for="account in visibleAccounts"
          :key="account.employeeId"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
        >
          <div class="min-w-48 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="text-sm font-semibold text-slate-900">{{ account.fullName }}</span>
              <span class="text-sm text-slate-500">{{ employeeRoleLabel(account.role) }}</span>
              <AtomsStatusBadge
                :tone="account.disabled ? 'muted' : 'ok'"
                :label="account.disabled ? 'Выключена' : 'Работает'"
              />
              <AtomsStatusBadge v-if="!account.passwordSet" tone="muted" label="Без пароля" />
              <AtomsStatusBadge
                :tone="account.telegramBound ? 'ok' : 'muted'"
                :label="account.telegramBound ? 'Telegram привязан' : 'Telegram не привязан'"
              />
              <AtomsStatusBadge v-if="account.isDemo" tone="demo" label="ДЕМО" />
            </div>
            <p class="ym-hide-content mt-0.5 text-xs text-slate-500">{{ account.phoneE164 }}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              <template v-if="account.anyOffice">Любой офис</template>
              <span v-else-if="account.offices.length === 0" class="text-amber-700">
                Не закреплён ни за одним офисом — без офиса не увидит ни одного заказа
              </span>
              <template v-else>
                <template v-for="(office, index) in account.offices" :key="office.officeId">
                  <span v-if="index > 0">, </span>
                  <NuxtLink
                    :to="`/offices/${office.officeId}`"
                    class="underline underline-offset-2 hover:text-slate-900"
                  >
                    {{ office.name }}</NuxtLink
                  ><span v-if="office.archived"> (в архиве)</span>
                </template>
              </template>
            </p>
          </div>
          <div v-if="account.manageable || canIssueTelegram(account)" class="flex flex-wrap gap-2">
            <!-- Пока ссылка жива, второй выпуск не нужен: ссылка ниже. Истекла — кнопка
                 возвращается и выпускает новую. -->
            <AtomsActionButton
              v-if="canIssueTelegram(account)"
              label="Ссылка для Telegram"
              :disabled="busyId === account.employeeId"
              @click="emit('issueTelegramLink', account.employeeId)"
            />
            <AtomsActionButton
              v-if="account.assignableRoles.length > 0 && roleEditorFor !== account.employeeId"
              label="Сменить роль"
              :disabled="busyId === account.employeeId"
              @click="openRoleEditor(account.employeeId)"
            />
            <!-- У демо-учётки пароля не бывает. -->
            <AtomsActionButton
              v-if="account.manageable && !account.isDemo && account.passwordLink === null"
              label="Сбросить пароль"
              :disabled="busyId === account.employeeId"
              @click="emit('resetPassword', account.employeeId)"
            />
            <AtomsActionButton
              v-if="account.manageable && account.disabled"
              label="Включить"
              tone="primary"
              :disabled="busyId === account.employeeId"
              @click="emit('enable', account.employeeId)"
            />
            <AtomsActionButton
              v-else-if="account.manageable"
              label="Выключить"
              tone="danger"
              :disabled="busyId === account.employeeId"
              @click="emit('disable', account.employeeId)"
            />
          </div>
          <form
            v-if="roleEditorFor === account.employeeId"
            class="flex w-full flex-wrap items-end gap-3"
            @submit.prevent="submitRole(account)"
          >
            <label class="block min-w-56 flex-1">
              <span class="mb-1 block text-sm font-medium text-slate-700">
                Новая роль вместо «{{ employeeRoleLabel(account.role) }}»
              </span>
              <AtomsSelectInput v-model="chosenRole" :options="roleOptions(account)" required>
                <option value="">Выберите роль</option>
              </AtomsSelectInput>
            </label>
            <AtomsSubmitButton label="Сменить" :disabled="busyId === account.employeeId" />
            <AtomsActionButton label="Отмена" @click="closeRoleEditor" />
          </form>
          <div v-if="account.passwordLink" class="w-full space-y-2">
            <p class="text-xs text-slate-500">
              Ссылка для пароля · до {{ formatDateTime(account.passwordLink.expiresAt) }}
            </p>
            <MoleculesCopyableLink :link="account.passwordLink.link" />
          </div>
          <div v-if="account.telegramLink && !account.telegramBound" class="w-full space-y-2">
            <p class="text-xs text-slate-500">
              Ссылка для Telegram · до {{ formatDateTime(account.telegramLink.expiresAt) }}
            </p>
            <MoleculesCopyableLink :link="account.telegramLink.link">
              <template #actions>
                <AtomsActionLink label="Открыть в Telegram" :href="account.telegramLink.link" />
              </template>
            </MoleculesCopyableLink>
          </div>
        </li>
      </ul>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
