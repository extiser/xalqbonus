<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DriverCardResponse, DriverTelegramCandidateResponse } from '#shared/types/driver';
import type { TelegramLinkDenial } from '~/types/telegramLink';
import { DASH, formatDateTime } from '~/utils/format';
import { languageLabel, sourceLabel } from '~/utils/labels';

/**
 * Участие в программе и канал связи.
 *
 * Граница «известен парку / состоит в программе» проходит по строке настроек участника,
 * а не по договорённости: реестр парка содержит всех, кого знает парк, включая уволенных
 * и никогда не открывавших бота (docs/drivers.md).
 *
 * У не участника раздел пуст, и пустота подписана причиной, а не показана нулями:
 * «не состоит» — содержательный ответ, а не отсутствие данных.
 *
 * Под привязками — привязка и отвязка Telegram сотрудником в офисе (issue #305). Запросы
 * делает страница через `useDriverTelegramLink`: сюда приходят введённый ID, отказ, кандидат
 * для диалога и флаг запроса, наверх уходят события. У демо-водителя и у не участника
 * ни поля, ни кнопок.
 */
const props = defineProps<{
  card: DriverCardResponse;
  /** Запрос в пути: кнопки гаснут, двойное нажатие второго запроса не шлёт. */
  busy: boolean;
  /** Отказ последнего запроса. `null` — показывать нечего. */
  denial: TelegramLinkDenial | null;
  /** Кандидат после проверки. Есть — открыт диалог подтверждения привязки. */
  candidate: DriverTelegramCandidateResponse | null;
}>();

const emit = defineEmits<{ check: []; 'confirm-link': []; unlink: []; cancel: [] }>();

/** Telegram ID с экрана отказа водителя. */
const telegramId = defineModel<string>('telegramId', { required: true });

/** Действия видны участнику программы, кроме демо: привязки демо меняются в разделе «Демо». */
const canManage = computed(() => props.card.membership !== null && !props.card.isDemo);

const activeLink = computed(() => props.card.telegramLinks.find((link) => link.closedAt === null) ?? null);

/** Открыт ли диалог отвязки. Это вид блока, а не данные: живёт здесь. */
const unlinkAsked = ref(false);

const confirmUnlink = (): void => {
  unlinkAsked.value = false;
  emit('unlink');
};

const linkTitle = computed(() => `Привязать Telegram ${props.candidate?.telegramUserId ?? ''}?`);

const linkMessage = computed(() => {
  const candidate = props.candidate;

  if (!candidate) {
    return '';
  }

  const shared = `Номер из этого Telegram: ${candidate.phone ?? DASH}, водитель делился им ${formatDateTime(candidate.sharedAt)}.`;

  return candidate.currentTelegramChatId === null
    ? shared
    : `${shared} Действующая привязка ${candidate.currentTelegramChatId} будет закрыта, в тот чат уйдёт сообщение.`;
});

/**
 * Отказ «привязан к другому водителю» — с именем ссылкой на его карточку. Текст разрезается
 * по имени из `data` отказа: не нашлось — показывается целиком, без ссылки.
 */
const denialParts = computed(() => {
  const denial = props.denial;
  const other = denial?.other ?? null;

  if (!denial || !other) {
    return null;
  }

  const at = denial.message.indexOf(other.fullName);

  if (at < 0) {
    return null;
  }

  return {
    before: denial.message.slice(0, at),
    name: other.fullName,
    after: denial.message.slice(at + other.fullName.length),
    to: `/drivers/${other.personId}`,
  };
});
</script>

<template>
  <MoleculesSectionPanel
    title="Участие в программе"
    note="Участие начинается с привязки Telegram. Реестр парка шире программы: в нём есть и уволенные, и те, кто бота не открывал."
  >
    <MoleculesStateNotice
      v-if="!card.membership"
      state="empty"
      message="В программе не состоит: настроек участника нет, счёта нет, баллов нет. Это ответ, а не отсутствие данных."
    />
    <dl v-else class="divide-y divide-slate-100">
      <MoleculesFactRow label="Вступил" :value="formatDateTime(card.membership.joinedAt)" mono />
      <MoleculesFactRow
        label="Откуда участие"
        :value="sourceLabel(card.membership.joinedSource)"
      />
      <MoleculesFactRow label="Язык" :value="languageLabel(card.membership.language)" />
      <MoleculesFactRow
        label="Уведомления"
        :value="card.membership.notificationsEnabled ? 'включены' : 'выключены'"
      />
    </dl>

    <div class="mt-4 border-t border-slate-200 pt-3">
      <h3 class="text-sm font-semibold text-slate-900">Telegram</h3>
      <p class="mt-0.5 text-xs text-slate-400">
        Действующая привязка одна. Закрытые не удаляются: перепривязка — новая строка рядом,
        а не правка на месте.
      </p>
      <MoleculesStateNotice
        v-if="card.telegramLinks.length === 0"
        state="empty"
        :message="
          card.membership
            ? 'Привязки Telegram нет, хотя человек в программе, — такую строку надо разбирать.'
            : 'Привязки Telegram нет: человек в программе не состоит.'
        "
      />
      <div v-else class="mt-2">
        <MoleculesTelegramLinkItem
          v-for="link in card.telegramLinks"
          :key="`${link.telegramChatId}:${link.linkedAt}`"
          :link="link"
        />
      </div>

      <div v-if="canManage" class="mt-4 space-y-3">
        <form class="flex flex-wrap items-start gap-3" @submit.prevent="emit('check')">
          <div class="min-w-56 flex-1">
            <MoleculesFormField
              v-model="telegramId"
              label="Telegram ID с экрана водителя"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              required
            />
          </div>
          <div class="pt-6">
            <AtomsSubmitButton label="Привязать" :disabled="busy" />
          </div>
        </form>
        <p v-if="denial" class="text-sm text-red-700">
          <template v-if="denialParts">
            {{ denialParts.before }}<NuxtLink
              :to="denialParts.to"
              class="underline decoration-red-300 underline-offset-4 hover:text-red-900"
            >{{ denialParts.name }}</NuxtLink>{{ denialParts.after }}
          </template>
          <template v-else>{{ denial.message }}</template>
        </p>
        <div v-if="activeLink">
          <AtomsActionButton
            label="Отвязать Telegram"
            tone="danger"
            :disabled="busy"
            @click="unlinkAsked = true"
          />
        </div>
      </div>
    </div>

    <MoleculesConfirmDialog
      :open="candidate !== null"
      :title="linkTitle"
      :message="linkMessage"
      confirm-label="Привязать"
      cancel-label="Отмена"
      tone="primary"
      @confirm="emit('confirm-link')"
      @cancel="emit('cancel')"
    />
    <MoleculesConfirmDialog
      :open="unlinkAsked"
      :title="`Отвязать Telegram ${activeLink?.telegramChatId ?? ''}?`"
      message="Водитель перестанет получать сообщения и не откроет приложение, пока Telegram не привяжут заново. Баллы останутся на счёте. В этот чат уйдёт сообщение."
      confirm-label="Отвязать"
      cancel-label="Отмена"
      tone="danger"
      @confirm="confirmUnlink"
      @cancel="unlinkAsked = false"
    />
  </MoleculesSectionPanel>
</template>
