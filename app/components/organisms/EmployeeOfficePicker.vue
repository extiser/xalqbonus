<script setup lang="ts">
import type { EmployeeOffice } from '#shared/types/orders';

/**
 * Выбор офиса на экране сотрудника в Mini App.
 *
 * Показывается, когда офисов больше одного: с одним офисом выбирать нечего, и экран сразу
 * открывает стойку. Без офисов вовсе — текст, а не пустой список: пустота читается как поломка,
 * а менеджеру нужно знать, к кому идти (issue #122).
 */
defineProps<{
  fullName: string;
  offices: EmployeeOffice[];
}>();

defineEmits<{ select: [officeId: string] }>();
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-col gap-0.5">
      <p class="text-sm text-slate-500">{{ fullName }}</p>
      <h1 class="text-2xl font-semibold">Выдача заказов</h1>
    </header>

    <p v-if="offices.length === 0" class="text-base leading-relaxed text-slate-700">
      Вас не привязали к офису. Обратитесь к руководителю.
    </p>

    <template v-else>
      <p class="text-base text-slate-700">Выберите офис, в котором работаете</p>
      <ul class="flex flex-col gap-2">
        <li v-for="office in offices" :key="office.officeId">
          <button
            type="button"
            class="flex w-full flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            @click="$emit('select', office.officeId)"
          >
            <span class="text-base font-semibold">{{ office.name }}</span>
            <span class="text-sm text-slate-500">{{ office.address }}</span>
            <span v-if="office.archived" class="text-xs text-slate-400">В архиве</span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>
