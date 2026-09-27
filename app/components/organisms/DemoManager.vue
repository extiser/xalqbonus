<script setup lang="ts">
import { ref, watch } from 'vue';
import type { DemoManagerSummary } from '#shared/types/demo';

/**
 * Демо-менеджер (issue #252): под ним смотрит зритель, выбравший роль менеджера. Есть — имя,
 * телефон и галочки демо-офисов; нет — «Завести» с телефоном.
 *
 * Наверх уходит весь набор офисов, а не «отметили такой-то»: ручка заменяет набор целиком,
 * как состав офиса на его странице.
 */
const props = defineProps<{
  manager: DemoManagerSummary | null;
  demoOffices: { officeId: string; name: string }[];
  saving: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  create: [phone: string];
  saveOffices: [officeIds: string[]];
}>();

const phone = ref('');

const submitPhone = (): void => {
  if (phone.value.trim() !== '') {
    emit('create', phone.value);
  }
};

watch(
  () => props.manager?.employeeId,
  (employeeId) => {
    if (employeeId) {
      phone.value = '';
    }
  },
);

const toggle = (officeId: string, checked: boolean): void => {
  const current = new Set(props.manager?.officeIds ?? []);

  if (checked) {
    current.add(officeId);
  } else {
    current.delete(officeId);
  }

  emit('saveOffices', [...current]);
};
</script>

<template>
  <MoleculesSectionPanel
    title="Демо-менеджер"
    note="Под ним входит зритель в роли менеджера. Своего входа у демо-менеджера нет — ни пароля, ни Telegram. Стойка показывает отмеченные демо-офисы."
  >
    <div class="space-y-4">
      <template v-if="manager">
        <p class="text-sm text-slate-900">
          {{ manager.fullName }}
          <span class="text-slate-500">· {{ manager.phone.display }}</span>
        </p>

        <MoleculesStateNotice
          v-if="demoOffices.length === 0"
          state="empty"
          message="Демо-офисов нет: их заводят в «Офисах» галочкой «Демо»."
        />
        <ul v-else class="space-y-2">
          <li v-for="office in demoOffices" :key="office.officeId">
            <label class="flex items-center gap-3">
              <input
                type="checkbox"
                class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                :checked="manager.officeIds.includes(office.officeId)"
                :disabled="saving"
                @change="toggle(office.officeId, ($event.target as HTMLInputElement).checked)"
              />
              <span class="text-sm text-slate-900">{{ office.name }}</span>
            </label>
          </li>
        </ul>
      </template>

      <template v-else>
        <MoleculesStateNotice state="empty" message="Демо-менеджера нет." />
        <div class="flex flex-wrap items-end gap-3">
          <label class="block min-w-56 flex-1">
            <span class="mb-1 block text-sm font-medium text-slate-700">Телефон</span>
            <AtomsTextInput v-model="phone" type="tel" placeholder="+998 90 123 45 67" />
          </label>
          <AtomsActionButton
            :label="saving ? 'Заводим…' : 'Завести'"
            tone="primary"
            :disabled="saving || phone.trim() === ''"
            @click="submitPhone"
          />
        </div>
      </template>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
