<script setup lang="ts">
/**
 * Форма поиска водителя: одно поле на три признака.
 *
 * Одно, а не три, намеренно: оператор не знает заранее, что ему сейчас продиктуют —
 * номер удостоверения, телефон или фамилию, — а выбор вкладки стоит времени на каждом
 * водителе. Что из этого пришло, разбирает сервер.
 *
 * Поле крупное и с курсором внутри при открытии: с него начинается каждый второй разговор
 * в офисе, и лишнее нажатие перед первым словом здесь платится на каждом водителе.
 *
 * Набранное в поле вебвизор Метрики не записывает: сюда диктуют телефон и номер ВУ (issue #432).
 *
 * Кроме страницы, где поле не главное: на «Заказах» оно стоит в карточке оформления под полем
 * кода и забирало бы фокус и прокрутку на себя при каждом открытии страницы (issue #294).
 */
withDefaults(defineProps<{ autofocus?: boolean }>(), { autofocus: true });

const model = defineModel<string>({ required: true });

const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <form class="flex flex-wrap items-center gap-2" @submit.prevent="emit('submit')">
    <div class="min-w-64 flex-1">
      <AtomsTextInput
        v-model="model"
        type="search"
        size="large"
        sensitive
        :autofocus="autofocus"
        aria-label="Номер удостоверения, телефон или имя"
        placeholder="Номер удостоверения, телефон или имя"
      />
    </div>
    <AtomsSubmitButton label="Найти" size="large" />
  </form>
</template>
