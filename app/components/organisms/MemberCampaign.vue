<script setup lang="ts">
import type { MemberCampaign } from '#shared/types/miniapp';

/**
 * Акция на экране участника — рабочий минимум (issue #166): название, сроки, состояние
 * строкой, «Участвовать» и ссылка «Отказаться».
 *
 * Вёрстка по макетам сюда не входит и приезжает своей задачей: она переоденет этот блок,
 * а вызовы ручек и разбор состояний останутся прежними. Тексты — с сервера, на языке
 * водителя.
 */
defineProps<{
  campaign: MemberCampaign;
  /** Ответ в пути: кнопки гаснут, чтобы второе нажатие не ушло вдогонку. */
  acting: boolean;
  error: string | null;
}>();

defineEmits<{ join: []; decline: [] }>();
</script>

<template>
  <section class="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
    <div class="flex flex-col gap-1">
      <p class="text-lg font-semibold text-slate-900">{{ campaign.title }}</p>
      <p class="text-sm text-slate-600">{{ campaign.window }}</p>
      <p class="text-base font-medium text-slate-800">{{ campaign.stateText }}</p>
    </div>

    <template v-if="campaign.canRespond">
      <AtomsMiniAppButton :label="campaign.joinLabel" :disabled="acting" @click="$emit('join')" />
      <button
        type="button"
        class="self-center rounded-md px-2 py-1 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:text-slate-300"
        :disabled="acting"
        @click="$emit('decline')"
      >
        {{ campaign.declineLabel }}
      </button>
    </template>

    <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
  </section>
</template>
