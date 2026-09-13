<script setup lang="ts">
import type { MemberOffice, MemberOrderTexts } from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';

/**
 * Выбор офиса перед витриной: один заказ — один офис, и остатки у офисов разные
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 */
defineProps<{
  state: LoadState;
  offices: MemberOffice[];
  texts: MemberOrderTexts;
}>();

defineEmits<{ select: [officeId: string] }>();
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">{{ texts.officesTitle }}</h1>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      :message="texts.officesFailed"
    />
    <MoleculesStateNotice
      v-else-if="offices.length === 0"
      state="empty"
      :message="texts.officesEmpty"
    />

    <div v-else class="flex flex-col gap-3">
      <MoleculesMemberOfficeItem
        v-for="office in offices"
        :key="office.officeId"
        :office="office"
        :map-label="texts.openMap"
        @select="$emit('select', office.officeId)"
      />
    </div>
  </section>
</template>
