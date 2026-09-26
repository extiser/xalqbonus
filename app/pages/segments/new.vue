<script setup lang="ts">
import { ref } from 'vue';
import { useDemoEditor } from '~/composables/useDemoEditor';
import { useSegmentPreview } from '~/composables/useSegmentPreview';
import { failureText } from '~/utils/requestError';
import {
  fromConditionsDraft,
  toConditionsDraft,
  type SegmentConditionsDraft,
} from '~/utils/segmentConditions';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { SegmentCreateRequestBody, SegmentResponse } from '#shared/types/segment';

/**
 * Новый сегмент: форма условий и предпросмотр состава по ним — до сохранения.
 *
 * Подбор границ и есть основная работа этого экрана: число пересчитывается по мере правки,
 * и сохраняется сегмент, когда оно устроило, а не ради того, чтобы его увидеть (issue #165).
 *
 * Поле «Демо» видит только владелец (issue #212); предпросмотр считает по нему же: демо-сегмент
 * берёт только демо-водителей, живой — только живых.
 */

definePageMeta({
  middleware: 'segments-access',
});

useHead({ title: 'Новый сегмент — XalqBonus' });

const name = ref('');
const description = ref('');
const conditions = ref<SegmentConditionsDraft>(toConditionsDraft(EMPTY_SEGMENT_CONDITIONS));

const { ownsDemo } = useDemoEditor();

/** Поле «Демо» нового сегмента. */
const demo = ref(false);

const preview = useSegmentPreview(() => ({
  conditions: fromConditionsDraft(conditions.value),
  isDemo: demo.value,
  savedSegmentId: null,
}));

const saving = ref(false);
const saveError = ref<string | null>(null);

const create = async (): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  const body: SegmentCreateRequestBody = {
    name: name.value,
    description: description.value,
    conditions: fromConditionsDraft(conditions.value),
    isDemo: demo.value,
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
    >
      <MoleculesDemoField
        v-if="ownsDemo"
        v-model="demo"
        hint="Демо-сегмент берёт только демо-водителей, живой — только живых. Демо-акция идёт только на демо-сегменте."
      />
    </OrganismsSegmentForm>

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
