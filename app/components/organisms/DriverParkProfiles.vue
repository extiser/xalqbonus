<script setup lang="ts">
import type { DriverCardResponse } from '#shared/types/driver';

/**
 * Учётки человека в парке — все сразу.
 *
 * Несколько профилей у одного человека — не служебная деталь: у восьми пар двойников
 * из двенадцати `profile_id` общий, у четырёх разный, и вторая четвёрка склеивается
 * только номером ВУ. Именно из этих учёток и складывается один баланс (docs/drivers.md).
 */
defineProps<{
  card: DriverCardResponse;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Учётки в парке"
    note="Учётка — не личность. Увольнение и заведение заново дают вторую учётку тому же человеку, и поездки пишутся на обе."
  >
    <MoleculesStateNotice
      v-if="card.profiles.length === 0"
      state="empty"
      message="Учёток в парке нет. Человек заводится вместе с профилем — такую строку надо разбирать."
    />
    <div v-else class="grid gap-3 lg:grid-cols-2">
      <MoleculesParkProfileCard
        v-for="profile in card.profiles"
        :key="profile.profileId"
        :profile="profile"
      />
    </div>
  </MoleculesSectionPanel>
</template>
