<script setup lang="ts">
/**
 * Форма поиска водителя: одно поле на три признака.
 *
 * Одно, а не три, намеренно: оператор не знает заранее, что ему сейчас продиктуют —
 * номер удостоверения, телефон или фамилию, — а выбор вкладки стоит времени на каждом
 * водителе. Что из этого пришло, разбирает сервер.
 */
const model = defineModel<string>({ required: true });

const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <form class="flex flex-wrap items-center gap-2" @submit.prevent="emit('submit')">
    <div class="min-w-64 flex-1">
      <AtomsSearchInput
        v-model="model"
        label="Номер удостоверения, телефон или имя"
        placeholder="Номер удостоверения, телефон или имя"
      />
    </div>
    <AtomsSubmitButton label="Найти" />
  </form>
</template>
