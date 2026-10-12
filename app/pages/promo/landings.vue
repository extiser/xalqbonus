<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhUploadSimple } from '@phosphor-icons/vue';
import type { LandingUploadValues } from '~/components/molecules/web/LandingUploadForm.vue';
import type { LandingSelection } from '~/components/organisms/web/LandingList.vue';
import { toLoadState } from '~/utils/loadState';
import { failureField, failureMessage, failureText } from '~/utils/requestError';
import { PROMO_TABS } from '~/utils/sectionTabs';
import type { LandingField } from '#shared/promo';
import type {
  LandingArchived,
  LandingCard,
  LandingCheckResult,
  LandingCreated,
  LandingList,
  LandingVersionAdded,
} from '#shared/types/landings';

/**
 * Вкладка «Лендинги» раздела «Промо» (issue #478) — экран `_reference/design/web/promo/04-landings.html`,
 * окно загрузки и замены — `05-landing-upload.html`.
 *
 * Слева список: экран заявки по умолчанию и загруженные лендинги; справа предпросмотр выбранного —
 * ровно то, что увидит человек, открывший приложение по метке. Выбранная строка — в адресе
 * (`?landing=<id>`, `default` — экран по умолчанию); без выбора — первая строка.
 */

definePageMeta({
  layout: 'web',
  middleware: 'promo-access',
});

useHead({ title: 'Лендинги — Промо — Xalq Taxi Bonus' });

const route = useRoute();
const router = useRouter();

const { data: list, status, refresh: refreshList } = await useFetch<LandingList>('/api/promo/landings');

const state = computed(() => toLoadState(status.value));

const selection = computed((): LandingSelection => {
  const value = route.query.landing;

  return typeof value === 'string' && value !== '' ? value : 'default';
});

/** Id выбранного загруженного лендинга; у экрана по умолчанию его нет. */
const landingId = computed(() => (selection.value === 'default' ? null : selection.value));

// `useRequestFetch`, а не `$fetch`: при отрисовке на сервере запрос несёт cookie сессии.
const requestFetch = useRequestFetch();

const {
  data: card,
  status: cardStatus,
  error: cardError,
  refresh: refreshCard,
} = await useAsyncData(
  'promo-landing-card',
  (): Promise<LandingCard | null> =>
    landingId.value === null
      ? Promise.resolve(null)
      : requestFetch<LandingCard>(`/api/promo/landings/${encodeURIComponent(landingId.value)}`),
  { watch: [landingId] },
);

const cardState = computed(() => toLoadState(cardStatus.value));

const select = (next: LandingSelection): void => {
  void router.replace({ query: { ...route.query, landing: next } });
};

const refreshAll = async (): Promise<void> => {
  await Promise.all([refreshList(), refreshCard()]);
};

// Действия предпросмотра: архив, возврат, удаление

const actionError = ref<string | null>(null);
const acting = ref(false);

const act = async (run: () => Promise<void>): Promise<void> => {
  if (acting.value) return;

  acting.value = true;
  actionError.value = null;

  try {
    await run();
  } catch (error) {
    actionError.value = failureText(error);
  } finally {
    acting.value = false;
  }
};

const setArchived = (archived: boolean): Promise<void> =>
  act(async () => {
    if (landingId.value === null) return;

    await $fetch<LandingArchived>(`/api/promo/landings/${encodeURIComponent(landingId.value)}/${archived ? 'archive' : 'unarchive'}`, {
      method: 'POST',
    });
    await refreshAll();
  });

const deleteOpen = ref(false);

const confirmDelete = (): Promise<void> =>
  act(async () => {
    if (landingId.value === null) return;

    try {
      await $fetch(`/api/promo/landings/${encodeURIComponent(landingId.value)}`, { method: 'DELETE' });
    } finally {
      deleteOpen.value = false;
    }

    select('default');
    await refreshList();
  });

// Окно «Загрузить лендинг» и «Заменить лендинг»

const uploadOpen = ref(false);
const uploadMode = ref<'upload' | 'replace'>('upload');
/** Ключ формы: новое открытие окна — чистая форма. */
const uploadKey = ref(0);
const check = ref<LandingCheckResult | null>(null);
const checking = ref(false);
const checkError = ref<string | null>(null);
const fieldErrors = ref<Partial<Record<LandingField, string>>>({});
const formError = ref<string | null>(null);
const submitting = ref(false);
/** Номер последней проверки: ответ на прежний файл, пришедший позже, не встаёт поверх нового. */
let checkRound = 0;

const openUpload = (mode: 'upload' | 'replace'): void => {
  uploadMode.value = mode;
  uploadKey.value += 1;
  check.value = null;
  checking.value = false;
  checkError.value = null;
  fieldErrors.value = {};
  formError.value = null;
  checkRound += 1;
  uploadOpen.value = true;
};

const closeUpload = (): void => {
  uploadOpen.value = false;
};

const clearFieldError = (field: LandingField): void => {
  if (fieldErrors.value[field] === undefined) return;

  const next = { ...fieldErrors.value };
  delete next[field];
  fieldErrors.value = next;
};

/** Отказ по полю окна — под поле; не про поле — плашкой над полями. */
const showUploadFailure = (error: unknown): void => {
  const field = failureField(error);
  const message = failureMessage(error);

  if ((field === 'name' || field === 'file') && message !== null) {
    fieldErrors.value = { ...fieldErrors.value, [field]: message };
  } else {
    formError.value = failureText(error);
  }
};

const archiveBody = (file: File, name?: string): FormData => {
  const body = new FormData();

  if (name !== undefined) body.append('name', name);
  body.append('file', file);

  return body;
};

const checkArchive = async (file: File): Promise<void> => {
  checkRound += 1;

  const round = checkRound;

  check.value = null;
  checkError.value = null;
  checking.value = true;

  try {
    const result = await $fetch<LandingCheckResult>('/api/promo/landings/check', { method: 'POST', body: archiveBody(file) });

    if (round === checkRound) check.value = result;
  } catch (error) {
    if (round !== checkRound) return;

    const field = failureField(error);
    const message = failureMessage(error);

    if (field === 'file' && message !== null) fieldErrors.value = { ...fieldErrors.value, file: message };
    else checkError.value = failureText(error);
  } finally {
    if (round === checkRound) checking.value = false;
  }
};

const submitUpload = async (values: LandingUploadValues): Promise<void> => {
  if (submitting.value) return;

  submitting.value = true;
  formError.value = null;

  try {
    if (uploadMode.value === 'upload') {
      const created = await $fetch<LandingCreated>('/api/promo/landings', {
        method: 'POST',
        body: archiveBody(values.file, values.name),
      });

      uploadOpen.value = false;
      select(created.id);
      await refreshList();
    } else if (landingId.value !== null) {
      await $fetch<LandingVersionAdded>(`/api/promo/landings/${encodeURIComponent(landingId.value)}/versions`, {
        method: 'POST',
        body: archiveBody(values.file),
      });

      uploadOpen.value = false;
      await refreshAll();
    }
  } catch (error) {
    showUploadFailure(error);
  } finally {
    submitting.value = false;
  }
};

const preview = computed(() => {
  if (selection.value === 'default') {
    return list.value ? { kind: 'default' as const, screen: list.value.defaultScreen } : null;
  }

  return card.value ? { kind: 'landing' as const, card: card.value } : null;
});

const previewMissing = computed(() => cardError.value?.statusCode === 404);
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 grow basis-[520px] flex-col gap-2">
        <AtomsWebPageTitle label="Промо" />
        <p class="m-0 max-w-[760px] font-manrope text-[14px] leading-[1.5] text-web-title">
          Здесь лежат экраны заявки для рекламы. Человек видит такой экран, когда открывает приложение по рекламной
          метке. У каждой метки рекламы свой лендинг. Какой лендинг лучше приводит людей, видно по воронкам меток.
        </p>
        <div class="mt-1.5">
          <MoleculesWebLevelTabs label="Вкладки раздела «Промо»" current="landings" :tabs="PROMO_TABS" />
        </div>
      </div>
      <AtomsWebActionButton label="Загрузить лендинг" size="page" :icon="PhUploadSimple" @click="openUpload('upload')" />
    </div>

    <div v-if="actionError" class="px-1 pb-4">
      <AtomsWebFormAlert :text="actionError" />
    </div>

    <MoleculesWebBento>
      <OrganismsWebLandingList :state="state" :list="list ?? null" :selected="selection" @select="select" />

      <OrganismsWebLandingPreview
        v-if="preview"
        :subject="preview"
        :busy="acting"
        @replace="openUpload('replace')"
        @archive="setArchived(true)"
        @unarchive="setArchived(false)"
        @delete="deleteOpen = true"
      />
      <MoleculesWebTile v-else :cols="8" :rows="6" title="Предпросмотр" :medium="12">
        <div class="mt-3.5">
          <AtomsWebHint
            :text="
              previewMissing
                ? 'Такого лендинга нет. Возможно, его удалили. Выберите строку в списке.'
                : (selection === 'default' ? state : cardState) === 'loading'
                  ? 'Загружаем лендинг…'
                  : 'Лендинг не загрузился. Это отказ запроса.'
            "
          />
        </div>
      </MoleculesWebTile>
    </MoleculesWebBento>

    <MoleculesWebDialog
      :open="uploadOpen"
      :title="uploadMode === 'upload' ? 'Загрузить лендинг' : 'Заменить лендинг'"
      @close="closeUpload"
    >
      <MoleculesWebLandingUploadForm
        :key="uploadKey"
        :mode="uploadMode"
        :fixed-name="card?.name ?? ''"
        :check="check"
        :checking="checking"
        :check-error="checkError"
        :field-errors="fieldErrors"
        :form-error="formError"
        :submitting="submitting"
        @pick="checkArchive"
        @submit="submitUpload"
        @cancel="closeUpload"
        @edit="clearFieldError"
      />
    </MoleculesWebDialog>

    <MoleculesWebConfirmDialog
      :open="deleteOpen"
      title="Удалить лендинг"
      :message="`Лендинг «${card?.name ?? ''}» удалится вместе со всеми версиями и картинками. Вернуть его будет нельзя.`"
      confirm-label="Удалить"
      danger
      :busy="acting"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    />
  </div>
</template>
