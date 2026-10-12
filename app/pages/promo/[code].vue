<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { PhArrowLeft } from '@phosphor-icons/vue';
import type { PromoFormValues } from '~/components/molecules/web/PromoForm.vue';
import { formatMomentDate } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { readPromoFieldErrors } from '~/utils/promoFormErrors';
import { failureText } from '~/utils/requestError';
import { PROMO_ENTRY_LABELS, PROMO_MEDIUM_LABELS, type PromoField } from '#shared/promo';
import type { LandingOption } from '#shared/types/landings';
import type { PromoCard } from '#shared/types/promo';

/**
 * Карточка промо-метки (issue #380) — экран `_reference/design/web/promo/03-card.html`,
 * адрес `/promo/{код}`. Открывается строкой списка и сразу после «Создать метку».
 *
 * Ссылка и QR, воронка за всё время, переходы по дням и вступившие по метке. «Изменить» —
 * название и место размещения в окне; код и носитель не меняются. У рекламы со входом
 * «Приложение» — ещё лендинг (issue #478): в строке под названием ссылкой во вкладку «Лендинги»
 * и в «Изменить» до первого перехода по метке.
 */

definePageMeta({
  layout: 'web',
  middleware: 'promo-access',
});

const route = useRoute();

const code = computed(() => (typeof route.params.code === 'string' ? route.params.code : ''));

// Адрес — строкой, а тип ответа — явно: по шаблону адреса типы Nitro не отличают
// `/api/promo/{код}` от соседней `/api/promo/new-code`.
const cardUrl = computed((): string => `/api/promo/${encodeURIComponent(code.value)}`);

const { data: card, status, error, refresh } = await useFetch<PromoCard>(cardUrl);

useHead({ title: computed(() => `${card.value?.promo.name ?? 'Метка'} — Промо — Xalq Taxi Bonus`) });

const state = computed(() => toLoadState(status.value));

const missing = computed(() => error.value?.statusCode === 404);

/** У рекламы со входом «Приложение» в строке под названием — лендинг ссылкой (issue #478). */
const landingLink = computed(() => {
  const promo = card.value?.promo;

  if (!promo || promo.medium !== 'telegram_ad' || promo.entry !== 'miniapp') return null;

  return promo.landing
    ? { name: promo.landing.name, to: `/promo/landings?landing=${encodeURIComponent(promo.landing.id)}` }
    : { name: 'Экран заявки', to: '/promo/landings?landing=default' };
});

/** Вход словами — у рекламы в Telegram, первым после носителя (issue #467). */
const metaEntry = computed(() => {
  const promo = card.value?.promo;

  return promo?.medium === 'telegram_ad' ? ` · ${PROMO_ENTRY_LABELS[promo.entry]}` : '';
});

/**
 * «Плакат · Офис 1, стена у стойки · с 06.10.2026 · завёл {имя}»; носитель — отдельно, жирным,
 * вход и лендинг — отдельно, перед этим хвостом.
 */
const metaTail = computed(() => {
  const promo = card.value?.promo;

  if (!promo) return '';

  return [
    promo.placement,
    `с ${formatMomentDate(promo.createdAt)}`,
    promo.createdBy === null ? 'заведена при выкате' : `завёл ${promo.createdBy}`,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .map((part) => ` · ${part}`)
    .join('');
});

// Окно «Изменить»

const editOpen = ref(false);
const editKey = ref(0);
const fieldErrors = ref<Partial<Record<PromoField, string>>>({});
const formError = ref<string | null>(null);
const submitting = ref(false);
const landingOptions = ref<LandingOption[]>([]);

const openEdit = (): void => {
  editKey.value += 1;
  fieldErrors.value = {};
  formError.value = null;
  landingOptions.value = [];
  editOpen.value = true;

  if (landingLink.value !== null && !card.value?.promo.landingLocked) {
    void $fetch<LandingOption[]>('/api/promo/landings/options')
      .then((options) => {
        landingOptions.value = options;
      })
      .catch((failure: unknown) => {
        formError.value = failureText(failure);
      });
  }
};

const closeEdit = (): void => {
  editOpen.value = false;
};

const clearFieldError = (field: PromoField): void => {
  if (fieldErrors.value[field] === undefined) return;

  const next = { ...fieldErrors.value };
  delete next[field];
  fieldErrors.value = next;
};

const saveEdit = async (values: PromoFormValues): Promise<void> => {
  if (submitting.value) return;

  submitting.value = true;
  formError.value = null;

  try {
    await $fetch<{ code: string }>(cardUrl.value, {
      method: 'PATCH',
      body: { name: values.name, placement: values.placement, landingId: values.landingId },
    });

    editOpen.value = false;
    await refresh();
  } catch (failure) {
    const errors = readPromoFieldErrors(failure);

    if (errors !== null) {
      fieldErrors.value = errors;
    } else {
      formError.value = failureText(failure);
    }
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 grow basis-80 flex-col gap-2">
        <NuxtLink
          to="/promo"
          class="inline-flex items-center gap-1.5 self-start font-manrope text-[14px] font-semibold text-web-title no-underline hover:text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
        >
          <PhArrowLeft aria-hidden="true" class="size-4" />Промо
        </NuxtLink>
        <AtomsWebPageTitle :label="card?.promo.name ?? 'Метка'" />
        <p v-if="card" class="m-0 font-manrope text-[14px] text-web-title">
          <b class="font-semibold text-web-text">{{ PROMO_MEDIUM_LABELS[card.promo.medium] }}</b>{{ metaEntry
          }}<template v-if="landingLink"> · лендинг <NuxtLink
              :to="landingLink.to"
              class="font-semibold text-web-cyan no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
            >{{ landingLink.name }}</NuxtLink></template>{{ metaTail }}
        </p>
      </div>
      <AtomsWebActionButton v-if="card" label="Изменить" size="page" @click="openEdit" />
    </div>

    <div v-if="state === 'loading'" class="px-1">
      <AtomsWebHint text="Загружаем метку…" />
    </div>
    <div v-else-if="missing" class="px-1">
      <AtomsWebHint text="Метки с таким кодом нет. Список меток — в разделе «Промо»." />
    </div>
    <div v-else-if="state === 'error' || !card" class="px-1">
      <AtomsWebHint :text="error ? failureText(error) : 'Метка не загрузилась. Это отказ запроса.'" />
    </div>
    <MoleculesWebBento v-else>
      <OrganismsWebPromoLinkQr :code="card.promo.code" :link="card.link" />
      <OrganismsWebPromoFunnel :funnel="card.funnel" />
      <MoleculesWebTile :cols="12" :rows="2" title="Переходы по дням" metric="promoDaily" class="max-web:min-h-[260px]">
        <OrganismsWebPromoDailyChart :days="card.days" />
      </MoleculesWebTile>
      <OrganismsWebPromoJoined :joined="card.joined" />
    </MoleculesWebBento>

    <MoleculesWebDialog v-if="card" :open="editOpen" title="Изменить метку" @close="closeEdit">
      <MoleculesWebPromoForm
        :key="editKey"
        mode="edit"
        :initial-name="card.promo.name"
        :initial-placement="card.promo.placement ?? ''"
        :initial-medium="card.promo.medium"
        :initial-entry="card.promo.entry"
        :initial-landing="card.promo.landing"
        :landing-locked="card.promo.landingLocked"
        :landing-options="landingOptions"
        :field-errors="fieldErrors"
        :form-error="formError"
        :submitting="submitting"
        @submit="saveEdit"
        @cancel="closeEdit"
        @edit="clearFieldError"
      />
    </MoleculesWebDialog>
  </div>
</template>
