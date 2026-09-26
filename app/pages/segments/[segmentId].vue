<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDemoEditor } from '~/composables/useDemoEditor';
import { useSegmentPreview } from '~/composables/useSegmentPreview';
import { formatDateTime } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { failureText } from '~/utils/requestError';
import {
  describeSegmentConditions,
  fromConditionsDraft,
  sameSegmentConditions,
  toConditionsDraft,
  type SegmentConditionsDraft,
} from '~/utils/segmentConditions';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { SegmentRequestBody, SegmentResponse } from '#shared/types/segment';

/**
 * Страница сегмента: условия, предпросмотр состава и архив.
 *
 * Предпросмотр считает по тому, что сейчас в форме: пока условия совпадают с сохранёнными —
 * ручкой сохранённого сегмента, после правки — без сохранения, и подписывает, по чему
 * посчитано. Сохранять ради того, чтобы увидеть число, не нужно (issue #165).
 *
 * Архивный открывается целиком: из выбора он убран, а по ссылке из прежней рассылки
 * обязан показать, кого тогда звали.
 *
 * Демо-сегмент правит только владелец (issue #212): у остальных условия на чтение, архива нет.
 */

definePageMeta({
  middleware: 'segments-access',
});

const route = useRoute();
const segmentId = computed(() => String(route.params.segmentId));

const { data, status, refresh } = await useFetch<SegmentResponse>(
  () => `/api/segments/${segmentId.value}`,
);

useHead({ title: () => `${data.value?.segment.name ?? 'Сегмент'} — XalqBonus` });

const state = computed(() => toLoadState(status.value));
const segment = computed(() => data.value?.segment ?? null);
const archived = computed(() => segment.value?.archivedAt !== null);

const { canEdit } = useDemoEditor();
const editable = computed(() => canEdit(segment.value?.isDemo ?? false));

const name = ref('');
const description = ref('');
const conditions = ref<SegmentConditionsDraft>(toConditionsDraft(EMPTY_SEGMENT_CONDITIONS));

/**
 * Поля заполняются из сегмента и переписываются, когда он перечитан: страница получает его
 * после ответа ручки, а после сохранения — заново, и форма обязана показать записанное.
 */
watch(
  segment,
  (value) => {
    name.value = value?.name ?? '';
    description.value = value?.description ?? '';
    conditions.value = toConditionsDraft(value?.conditions ?? EMPTY_SEGMENT_CONDITIONS);
  },
  { immediate: true },
);

const draftConditions = computed(() => fromConditionsDraft(conditions.value));

/** Условия формы совпадают с сохранёнными — предпросмотр идёт по сохранённому сегменту. */
const matchesSaved = computed(
  () => segment.value !== null && sameSegmentConditions(draftConditions.value, segment.value.conditions),
);

const preview = useSegmentPreview(() => ({
  conditions: draftConditions.value,
  isDemo: segment.value?.isDemo ?? false,
  savedSegmentId: matchesSaved.value ? segmentId.value : null,
}));

const saving = ref(false);
const saveError = ref<string | null>(null);

const save = async (): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  const body: SegmentRequestBody = {
    name: name.value,
    description: description.value,
    conditions: draftConditions.value,
  };

  try {
    await $fetch<SegmentResponse>(`/api/segments/${segmentId.value}`, { method: 'PATCH', body });
    await refresh();
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};

const archiving = ref(false);
const archiveError = ref<string | null>(null);

/** Архив и возврат — одна кнопка на два адреса: состояние сегмента решает, какой из них. */
const toggleArchive = async (): Promise<void> => {
  archiving.value = true;
  archiveError.value = null;

  try {
    await $fetch<SegmentResponse>(
      `/api/segments/${segmentId.value}/${archived.value ? 'unarchive' : 'archive'}`,
      { method: 'POST' },
    );
    await refresh();
  } catch (error) {
    archiveError.value = failureText(error);
  } finally {
    archiving.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/segments" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все сегменты
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">{{ segment?.name ?? 'Сегмент' }}</h1>
        <AtomsStatusBadge v-if="segment?.isDemo" tone="demo" label="ДЕМО" />
      </div>
      <template v-if="segment">
        <p v-if="segment.isDemo" class="mt-1 text-sm text-slate-500">
          Демо-сегмент: берёт только демо-водителей.
          {{ editable ? '' : 'Менять его может только владелец.' }}
        </p>
        <p v-if="segment.description" class="mt-1 text-sm text-slate-600">
          {{ segment.description }}
        </p>
        <p class="mt-1 text-xs text-slate-500">
          {{ describeSegmentConditions(segment.conditions).join(' · ') || 'все демо-водители' }}
        </p>
        <p class="mt-1 text-xs text-slate-400">
          Завёл {{ segment.createdByName }} {{ formatDateTime(segment.createdAt) }} · изменён
          {{ formatDateTime(segment.updatedAt) }}
        </p>
        <p v-if="segment.archivedAt" class="mt-1 text-sm text-slate-500">
          Сегмент в архиве с {{ formatDateTime(segment.archivedAt) }}: при выборе
          не предлагается, у прежних рассылок остаётся.
        </p>
      </template>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем сегмент…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Сегмент не прочитался. Такого сегмента нет, или запрос не прошёл."
    />
    <template v-else-if="segment">
      <OrganismsSegmentForm
        v-model:name="name"
        v-model:description="description"
        v-model:conditions="conditions"
        title="Условия"
        submit-label="Сохранить"
        :saving="saving"
        :error="saveError"
        :demo="segment.isDemo"
        :readonly="!editable"
        @submit="save"
      />

      <OrganismsSegmentPreview
        :state="preview.state.value"
        :data="preview.data.value"
        :error="preview.error.value"
        :has-conditions="preview.hasConditions.value"
        :refreshing="preview.refreshing.value"
        :basis="matchesSaved ? 'saved' : 'draft'"
        @page="preview.page"
      />

      <MoleculesSectionPanel
        v-if="editable"
        title="Архив"
        note="Удаления нет: на сегмент ссылаются рассылки и акции, и удалённый унёс бы ответ на вопрос «кого мы тогда звали»."
      >
        <div class="space-y-3">
          <AtomsActionButton
            :label="archived ? 'Вернуть из архива' : 'Убрать в архив'"
            :tone="archived ? 'primary' : 'danger'"
            :disabled="archiving"
            @click="toggleArchive"
          />
          <p v-if="archiveError" class="text-sm text-red-700">{{ archiveError }}</p>
        </div>
      </MoleculesSectionPanel>
    </template>
  </div>
</template>
