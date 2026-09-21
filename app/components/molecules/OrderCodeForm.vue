<script setup lang="ts">
/**
 * «Выдать по коду» над таблицей заказов в вебе. Код — заказа или награды: поле одно
 * (issue #172).
 *
 * Поиск уходит и по пятой цифре, и кнопкой: за столом код могут вставить, а могут набрать
 * и нажать Enter — оба пути ведут в один и тот же запрос.
 */
defineProps<{
  searching: boolean;
  error: string | null;
  notice: string | null;
}>();

const code = defineModel<string>({ required: true });

const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <MoleculesSectionPanel
    title="Выдать по коду"
    note="Пять цифр, которые называет водитель. Ищется среди заказов и наград выбранного офиса, ждущих выдачи."
  >
    <form class="flex flex-wrap items-center gap-3" @submit.prevent="emit('submit')">
      <div class="w-56">
        <AtomsCodeInput v-model="code" label="Код заказа или награды, пять цифр" @complete="emit('submit')" />
      </div>
      <AtomsSubmitButton label="Найти" size="large" :disabled="searching" />
    </form>
    <p v-if="notice" class="mt-3 text-sm font-medium text-emerald-700">{{ notice }}</p>
    <p v-if="error" class="mt-3 text-sm text-red-700">{{ error }}</p>
  </MoleculesSectionPanel>
</template>
