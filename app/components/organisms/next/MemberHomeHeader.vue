<script setup lang="ts">
/**
 * Шапка главного экрана: аватар, имя с позывным, пилюля акции и обновление.
 *
 * Не шапка раздела: главная — витрина программы, а не раздел, и назад отсюда идти некуда.
 * Пилюля стоит, только пока водитель в акции: у невступившего прогресса не существует,
 * его зовёт плашка приглашения под балансом.
 */
defineProps<{
  name: string;
  callsign?: string;
  /** Прогресс акции. Нет — водитель не в акции, пилюли нет. */
  promo?: { done: number; total: number };
  texts: {
    profile: string;
    refresh: string;
    promo: string;
  };
}>();

defineEmits<{ profile: []; refresh: []; promo: [] }>();
</script>

<template>
  <div class="relative flex items-center gap-3">
    <AtomsNextMemberIconButton :label="texts.profile" size="l" @click="$emit('profile')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" stroke-width="1.8" />
        <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </AtomsNextMemberIconButton>

    <div class="min-w-0 grow">
      <AtomsNextMemberNameplate :name="name" :callsign="callsign" />
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <MoleculesNextMemberPromoPill
        v-if="promo"
        :done="promo.done"
        :total="promo.total"
        :label="texts.promo"
        @open="$emit('promo')"
      />
      <AtomsNextMemberIconButton :label="texts.refresh" size="l" @click="$emit('refresh')">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
          <path d="M20 4v4.4h-4.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </AtomsNextMemberIconButton>
    </div>
  </div>
</template>
