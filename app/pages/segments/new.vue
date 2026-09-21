<script setup lang="ts">
import { ref } from 'vue';
import { useSegmentPreview } from '~/composables/useSegmentPreview';
import { failureText } from '~/utils/requestError';
import {
  fromConditionsDraft,
  toConditionsDraft,
  type SegmentConditionsDraft,
} from '~/utils/segmentConditions';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { SegmentRequestBody, SegmentResponse } from '#shared/types/segment';

/**
 * Новый сегмент: форма условий и предпросмотр состава по ним — до сохранения.
 *
 * Подбор границ и есть основная работа этого экрана: число пересчитывается по мере правки,
 * и сохраняется сегмент, когда оно устроило, а не ради того, чтобы его увидеть (issue #165).
 */

definePageMeta({
  middleware: 'segments-access',
});

useHead({ title: 'Новый сегмент — XalqBonus' });

const name = ref('');
const description = ref('');
const conditions = ref<SegmentConditionsDraft>(toConditionsDraft(EMPTY_SEGMENT_CONDITIONS));

const preview = useSegmentPreview(() => ({
  conditions: fromConditionsDraft(conditions.value),
  savedSegmentId: null,
}));

const saving = ref(false);
const saveError = ref<string | null>(null);

const create = async (): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  const body: SegmentRequestBody = {
    name: name.value,
    description: description.value,
    conditions: fromConditionsDraft(conditions.value),
  };

  try {
    const created = await $fetch<SegmentResponse>('/api/segments', { method: 'POST', body });

    await navigateTo(`/segments/${created.segment.segmentId}`);
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/segments" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все сегменты
      </NuxtLink>
      <h1 class="mt-2 text-xl font-semibold text-slate-900">Новый сегмент</h1>
    </div>

    <OrganismsSegmentForm
      v-model:name="name"
      v-model:description="description"
      v-model:conditions="conditions"
      title="Условия"
      submit-label="Завести сегмент"
      :saving="saving"
      :error="saveError"
      @submit="create"
    />

    <OrganismsSegmentPreview
      :state="preview.state.value"
      :data="preview.data.value"
      :error="preview.error.value"
      :has-conditions="preview.hasConditions.value"
      :refreshing="preview.refreshing.value"
      basis="draft"
      @page="preview.page"
    />
  </div>
</template>
