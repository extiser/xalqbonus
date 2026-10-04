<script setup lang="ts">
import { computed, ref } from 'vue';
import { PhPlus } from '@phosphor-icons/vue';
import type { PromoFormValues } from '~/components/molecules/web/PromoForm.vue';
import { formatNumber } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { readPromoFieldErrors } from '~/utils/promoFormErrors';
import { failureText } from '~/utils/requestError';
import type { MetricKey } from '#shared/metrics';
import type { PromoField } from '#shared/promo';
import type { PromoCreated, PromoNewCode } from '#shared/types/promo';

/**
 * Раздел «Промо», список меток (issue #380) — экран `_reference/design/web/promo/01-list.html`.
 *
 * Итоги по всем меткам четырьмя плитками, таблица меток и окно «Новая метка»
 * (`02-new.html`). Раздел новый и рождается сразу в новой раскладке (`docs/decisions.md` →
 * «Веб в стиле бенто»).
 *
 * Код для новой метки страница запрашивает при открытии окна и по «Другой код»; созданная
 * метка открывается карточкой — там её QR.
 */

definePageMeta({
  layout: 'web',
  middleware: 'promo-access',
});

useHead({ title: 'Промо — Xalq Taxi Bonus' });

const { data: promo, status } = await useFetch('/api/promo');

const state = computed(() => toLoadState(status.value));

const links = computed(() => (state.value === 'ready' ? (promo.value?.links ?? null) : null));

type TotalTile = { title: string; metric: MetricKey; value: number | null; tone: 'default' | 'quiet' };

const totals = computed<TotalTile[]>(() => {
  const counts = state.value === 'ready' ? (promo.value?.totals ?? null) : null;

  return [
    { title: 'Перешли', metric: 'promoWent', value: counts?.went ?? null, tone: 'default' },
    { title: 'Вступили', metric: 'promoJoined', value: counts?.joined ?? null, tone: 'default' },
    { title: 'Первая поездка', metric: 'promoFirstTrip', value: counts?.firstTrip ?? null, tone: 'default' },
    // Серым — это не результат меток: эти люди были в программе и без них.
    { title: 'Уже были в программе', metric: 'promoAlready', value: counts?.already ?? null, tone: 'quiet' },
  ];
});

// Окно «Новая метка»

const formOpen = ref(false);
/** Ключ формы: новое открытие окна — чистая форма, без прошлых значений и ошибок. */
const formKey = ref(0);
const fresh = ref<PromoNewCode | null>(null);
const fieldErrors = ref<Partial<Record<PromoField, string>>>({});
const formError = ref<string | null>(null);
const submitting = ref(false);

const clearFieldError = (field: PromoField): void => {
  if (fieldErrors.value[field] === undefined) return;

  const next = { ...fieldErrors.value };
  delete next[field];
  fieldErrors.value = next;
};

/** Новый код снимает отказ «код занят»: он был про прошлый код. */
const loadCode = async (): Promise<void> => {
  try {
    fresh.value = await $fetch<PromoNewCode>('/api/promo/new-code');
    formError.value = null;
    clearFieldError('code');
  } catch (error) {
    formError.value = failureText(error);
  }
};

const openForm = (): void => {
  formKey.value += 1;
  fresh.value = null;
  fieldErrors.value = {};
  formError.value = null;
  formOpen.value = true;
  void loadCode();
};

const closeForm = (): void => {
  formOpen.value = false;
};

const createLink = async (values: PromoFormValues): Promise<void> => {
  if (submitting.value) return;

  submitting.value = true;
  formError.value = null;

  try {
    const created = await $fetch<PromoCreated>('/api/promo', {
      method: 'POST',
      body: { code: fresh.value?.code ?? '', ...values },
    });

    formOpen.value = false;
    await navigateTo(`/promo/${encodeURIComponent(created.code)}`);
  } catch (error) {
    const errors = readPromoFieldErrors(error);

    if (errors !== null) {
      fieldErrors.value = errors;
    } else {
      formError.value = failureText(error);
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
        <AtomsWebPageTitle label="Промо" />
        <p class="m-0 max-w-[760px] font-manrope text-[14px] leading-[1.5] text-web-title">
          Ссылки в бота с меткой и QR для плакатов, визиток и роликов. По каждой метке видно, сколько людей
          перешли, сколько вступили в программу и сколько начали ездить с баллами.
        </p>
      </div>
      <AtomsWebActionButton label="Новая метка" size="page" :icon="PhPlus" @click="openForm" />
    </div>

    <MoleculesWebBento>
      <MoleculesWebTile v-for="tile in totals" :key="tile.metric" :cols="3" :rows="1" :title="tile.title" :metric="tile.metric">
        <div class="mt-3">
          <AtomsWebFigure
            v-if="tile.value !== null"
            size="tile"
            :tone="tile.tone"
            :value="formatNumber(tile.value)"
          />
          <AtomsWebHint v-else :text="state === 'loading' ? 'Считаем…' : 'Не загрузилось'" />
        </div>
      </MoleculesWebTile>
      <OrganismsWebPromoLinkTable :state="state" :links="links" />
    </MoleculesWebBento>

    <MoleculesWebDialog :open="formOpen" title="Новая метка" @close="closeForm">
      <MoleculesWebPromoForm
        :key="formKey"
        mode="create"
        :link="fresh?.link ?? null"
        :code="fresh?.code ?? null"
        :field-errors="fieldErrors"
        :form-error="formError"
        :submitting="submitting"
        @submit="createLink"
        @cancel="closeForm"
        @refresh-code="loadCode"
        @edit="clearFieldError"
      />
    </MoleculesWebDialog>
  </div>
</template>
