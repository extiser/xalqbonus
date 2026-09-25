<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { useGiftMessagePreview } from '~/composables/useGiftMessagePreview';
import { formatNumber, pluralize } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { failureField, failureText } from '~/utils/requestError';
import type { LoadState } from '~/types/loadState';
import type { GiftFields, PickedDriver } from '~/types/rewardGrant';
import type { SelectOption } from '~/types/selectOption';
import { GIFT_SEGMENT_ROLES } from '#shared/access';
import type { DriverCardResponse, DriverSearchResponse, DriverSearchRow } from '#shared/types/driver';
import { GIFT_COVER_RU_FIELD, GIFT_COVER_UZ_FIELD } from '#shared/gift';
import type {
  GiftGrantRequestBody,
  GiftMessagePreviewRequestBody,
  GiftGrantResponse,
  GiftGrantsResponse,
  ManualRewardRequestBody,
  ManualRewardResponse,
  RewardGrantOptionsResponse,
} from '#shared/types/rewards';
import type { SegmentListResponse } from '#shared/types/segment';

/**
 * Раздел «Награды» (issue #219): вручить одному водителю или сегменту и список раздач подарков.
 *
 * Баллы отсюда — всегда подарок: водитель забирает его в приложении, незабранное зачисляется
 * само в назначенный день. Товар и своя награда — одному водителю, прежней ручной выдачей (#172).
 * Сегменту — только баллы, и только владельцу и админу; перед раздачей — подтверждение с числом
 * водителей в сегменте.
 *
 * Из карточки водителя сюда ведёт «Вручить награду» с водителем в адресе — `?personId=…`.
 */

definePageMeta({
  middleware: 'rewards-access',
});

useHead({ title: 'Награды — XalqBonus' });

/** Сколько строк поиска показать: выбирают одного, листать незачем. */
const SEARCH_LIMIT = 10;

const route = useRoute();
const employee = useCurrentEmployee();

const canPickSegment = computed(
  () => employee.value !== null && GIFT_SEGMENT_ROLES.includes(employee.value.role),
);

const {
  data: grants,
  status: grantsStatus,
  refresh: refreshGrants,
} = await useFetch<GiftGrantsResponse>('/api/gifts');

const grantsState = computed(() => toLoadState(grantsStatus.value));

const { data: grantOptions } = await useFetch<RewardGrantOptionsResponse>('/api/rewards/grant-options');

// Сегменты — только тем, кому открыта раздача сегменту: остальным ручка откажет.
const { data: segments } = await useFetch<SegmentListResponse>('/api/segments', {
  immediate: canPickSegment.value,
});

const officeOptions = computed<SelectOption[]>(() =>
  (grantOptions.value?.offices ?? []).map((office) => ({ value: office.officeId, label: office.name })),
);

const productOptions = computed<SelectOption[]>(() =>
  (grantOptions.value?.products ?? []).map((product) => ({
    value: product.productId,
    label: product.promo ? `${product.name} — для акции` : product.name,
  })),
);

/** Рабочие сегменты: архивный при выборе не предлагается. */
const workingSegments = computed(() =>
  (segments.value?.segments ?? []).filter((segment) => segment.archivedAt === null),
);

const segmentOptions = computed<SelectOption[]>(() =>
  workingSegments.value.map((segment) => ({
    value: segment.segmentId,
    label: `${segment.name} — ${formatNumber(segment.total)} чел.`,
  })),
);

// ---------------------------------------------------------------------------
// Получатель
// ---------------------------------------------------------------------------

const recipientKind = ref<'person' | 'segment'>('person');
const segmentId = ref('');
const driver = ref<PickedDriver | null>(null);

const driverNameOf = (card: DriverCardResponse): string => {
  const profile = card.profiles[0];
  const name = profile
    ? [profile.lastName, profile.firstName, profile.middleName]
        .filter((part): part is string => Boolean(part))
        .join(' ')
    : '';

  return name || 'Без имени';
};

// Водитель из адреса — из карточки водителя по кнопке «Вручить награду».
const presetPersonId = typeof route.query.personId === 'string' ? route.query.personId : '';

if (presetPersonId !== '') {
  const { data: card } = await useFetch<DriverCardResponse>(`/api/drivers/${presetPersonId}`);

  if (card.value) {
    driver.value = {
      personId: presetPersonId,
      name: driverNameOf(card.value),
      isMember: card.value.membership !== null,
    };
  }
}

const searchState = ref<LoadState | null>(null);
const searchRows = ref<DriverSearchRow[]>([]);

const searchDrivers = async (query: string): Promise<void> => {
  if (query.trim() === '') {
    return;
  }

  searchState.value = 'loading';

  try {
    const result = await $fetch<DriverSearchResponse>('/api/drivers', {
      query: { query, limit: SEARCH_LIMIT, offset: 0 },
    });

    searchRows.value = result.rows;
    searchState.value = 'ready';
  } catch {
    searchRows.value = [];
    searchState.value = 'error';
  }
};

const pickDriver = (picked: PickedDriver): void => {
  driver.value = picked;
  searchRows.value = [];
  searchState.value = null;
};

// ---------------------------------------------------------------------------
// Вручение
// ---------------------------------------------------------------------------

const saving = ref(false);
const error = ref<string | null>(null);
const errorField = ref<string | null>(null);
const appliedCount = ref(0);
const notice = ref<string | null>(null);

const recipientError = computed(() => (errorField.value === 'recipient' ? error.value : null));

const resetOutcome = (): void => {
  error.value = null;
  errorField.value = null;
  notice.value = null;
};

const fail = (failure: unknown): void => {
  error.value = failureText(failure);
  errorField.value = failureField(failure);
};

const requireRecipient = (): boolean => {
  if (recipientKind.value === 'person' ? driver.value !== null : segmentId.value !== '') {
    return true;
  }

  error.value = recipientKind.value === 'person' ? 'Выберите водителя.' : 'Выберите сегмент.';
  errorField.value = 'recipient';

  return false;
};

/** Сумма, повод и дата подарка из формы — по ним сервер собирает системный текст (issue #236). */
const giftDraft = ref<GiftMessagePreviewRequestBody>({ points: null, reasonRu: '', reasonUz: '', untilDate: '' });
const { preview: giftMessagePreview } = useGiftMessagePreview(() => giftDraft.value);

/** Подарок, который ждёт подтверждения раздачи сегменту. */
const pendingGift = ref<GiftFields | null>(null);

const selectedSegment = computed(() =>
  workingSegments.value.find((segment) => segment.segmentId === segmentId.value) ?? null,
);

/** Что у подарка помимо суммы и повода — для подтверждения раздачи сегменту. */
const giftExtrasText = (gift: GiftFields): string => {
  const ownTexts = [gift.messageRu ? 'RU' : null, gift.messageUz ? 'UZ' : null].filter(Boolean);

  return [
    gift.coverRu && gift.coverUz ? ', с обложками' : '',
    ownTexts.length > 0 ? `, свой текст: ${ownTexts.join(', ')}` : '',
  ].join('');
};

const confirmMessage = computed(() => {
  const segment = selectedSegment.value;
  const gift = pendingGift.value;

  if (!segment || !gift) {
    return '';
  }

  return [
    `В сегменте «${segment.name}» сейчас ${formatNumber(segment.total)} чел.`,
    `Подарок — ${gift.points} ${pluralize(Number(gift.points), 'балл', 'балла', 'баллов')}, «${gift.reasonRu}»${giftExtrasText(gift)}.`,
    'Получат только участники программы, остальные будут пропущены. Каждому придёт сообщение в Telegram.',
    'Раздача не отменяется.',
  ].join('\n');
});

const sendGift = async (gift: GiftFields): Promise<void> => {
  saving.value = true;

  const fields: GiftGrantRequestBody = {
    recipientKind: recipientKind.value,
    personId: recipientKind.value === 'person' ? (driver.value?.personId ?? '') : '',
    segmentId: recipientKind.value === 'segment' ? segmentId.value : '',
    points: gift.points,
    reasonRu: gift.reasonRu,
    reasonUz: gift.reasonUz,
    untilDate: gift.untilDate,
    messageRu: gift.messageRu,
    messageUz: gift.messageUz,
  };

  // Одним запросом с обложками: раздача не правится, и черновика под картинку у неё нет.
  const body = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    body.append(name, value);
  }

  if (gift.coverRu) {
    body.append(GIFT_COVER_RU_FIELD, gift.coverRu);
  }

  if (gift.coverUz) {
    body.append(GIFT_COVER_UZ_FIELD, gift.coverUz);
  }

  try {
    const { grant } = await $fetch<GiftGrantResponse>('/api/gifts', { method: 'POST', body });

    appliedCount.value += 1;
    notice.value =
      grant.recipientKind === 'segment'
        ? `Вручено: ${formatNumber(grant.recipients)} водителям, пропущено ${formatNumber(grant.skipped)}.`
        : 'Вручено: подарок ждёт водителя в приложении.';
    await refreshGrants();
  } catch (failure) {
    fail(failure);
  } finally {
    saving.value = false;
  }
};

const grantGift = async (gift: GiftFields): Promise<void> => {
  resetOutcome();

  if (!requireRecipient()) {
    return;
  }

  if (recipientKind.value === 'segment') {
    pendingGift.value = gift;

    return;
  }

  await sendGift(gift);
};

const confirmSegmentGift = async (): Promise<void> => {
  const gift = pendingGift.value;

  pendingGift.value = null;

  if (gift) {
    await sendGift(gift);
  }
};

const grantReward = async (body: ManualRewardRequestBody): Promise<void> => {
  resetOutcome();

  if (!requireRecipient() || !driver.value) {
    return;
  }

  saving.value = true;

  try {
    const result = await $fetch<ManualRewardResponse>(`/api/drivers/${driver.value.personId}/rewards`, {
      method: 'POST',
      body,
    });

    appliedCount.value += 1;
    notice.value = result.code ? `Выдано. Код для стойки: ${result.code}` : 'Выдано.';
  } catch (failure) {
    fail(failure);
  } finally {
    saving.value = false;
  }
};

// Сменили получателя — прежний отказ и итог к нему больше не относятся.
watch([recipientKind, segmentId, driver], resetOutcome);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Награды</h1>
      <p class="mt-1 text-sm text-slate-500">
        Подарок баллами водитель забирает в приложении — ему придёт сообщение в Telegram.
        Незабранное зачисляется само в конце дня «Забрать до». Зачислить баллы сразу — ручной
        правкой в карточке водителя.
      </p>
    </div>

    <MoleculesSectionPanel title="Вручить">
      <div class="space-y-6">
        <OrganismsRewardRecipientPicker
          v-model:kind="recipientKind"
          v-model:segment-id="segmentId"
          :can-pick-segment="canPickSegment"
          :segment-options="segmentOptions"
          :driver="driver"
          :search-state="searchState"
          :search-rows="searchRows"
          :error="recipientError"
          @search="searchDrivers"
          @pick="pickDriver"
          @clear="driver = null"
        />
        <OrganismsRewardGrantForm
          :recipient-kind="recipientKind"
          :office-options="officeOptions"
          :product-options="productOptions"
          :saving="saving"
          :error="error"
          :error-field="errorField"
          :applied-count="appliedCount"
          :notice="notice"
          :message-preview="giftMessagePreview"
          @gift="grantGift"
          @reward="grantReward"
          @draft="giftDraft = $event"
        />
      </div>
    </MoleculesSectionPanel>

    <OrganismsGiftGrantTable :state="grantsState" :grants="grants?.grants ?? null" />

    <MoleculesConfirmDialog
      :open="pendingGift !== null"
      title="Вручить подарок сегменту?"
      :message="confirmMessage"
      confirm-label="Вручить"
      cancel-label="Отмена"
      tone="primary"
      @confirm="confirmSegmentGift"
      @cancel="pendingGift = null"
    />
  </div>
</template>
