<script setup lang="ts">
/**
 * Окно половины Б — две даты, назначаются один раз, когда до половины дошла очередь.
 *
 * Правки назначенного окна нет: половина, чьё окно уже могло начаться, увидела бы акцию
 * и потеряла её. Поэтому форма показывается, только пока окно пусто, — решает страница.
 */
defineProps<{
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ submit: [] }>();

const startsOn = defineModel<string>('startsOn', { required: true });
const endsOn = defineModel<string>('endsOn', { required: true });
</script>

<template>
  <MoleculesSectionPanel
    title="Окно половины Б"
    note="Половина Б — контроль: пока её окно не началось, акции у её водителей нет вовсе. Окно назначается один раз."
  >
    <form class="space-y-4" @submit.prevent="emit('submit')">
      <div class="grid gap-4 sm:grid-cols-2">
        <MoleculesFormField v-model="startsOn" label="Первый день" type="date" required />
        <MoleculesFormField v-model="endsOn" label="Последний день" type="date" required />
      </div>
      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
      <AtomsSubmitButton label="Назначить окно" :disabled="submitting" />
    </form>
  </MoleculesSectionPanel>
</template>
