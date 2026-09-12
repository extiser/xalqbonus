<script setup lang="ts">
/**
 * Шапка экрана участника: баланс, имя и отметка свежести данных.
 *
 * Баланс крупный и стоит выше всего остального — он то, ради чего водитель открывает
 * приложение, и читаться должен с вытянутой руки, не приглядываясь.
 *
 * Строка «Данные обновлены в…» стоит сразу под ним намеренно: поездки приезжают прогоном,
 * а не в момент завершения заказа, и водитель, закрывший заказ минуту назад, своей поездки
 * не увидит. Строка объясняет это до того, как он придёт с вопросом в офис (issue #101).
 */
defineProps<{
  /** Подпись над числом: без неё крупное число не отвечает на вопрос, чего оно. */
  balanceTitle: string;
  /** Баланс готовой строкой с разделёнными разрядами. Считает его сервер, и только он. */
  balance: string;
  name: string;
  /** Пусто, когда успешных прогонов заказов не было ни одного, — тогда строки нет вовсе. */
  updatedNote: string | null;
  /** Обещание 300 баллов. Пусто у того, у кого поездки уже есть. */
  promise: string | null;
}>();
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-sm text-slate-500">{{ balanceTitle }}</p>
      <p class="text-5xl leading-none font-semibold tabular-nums">{{ balance }}</p>
      <p class="mt-2 text-base font-medium text-slate-700">{{ name }}</p>
      <p v-if="updatedNote" class="text-sm text-slate-400">{{ updatedNote }}</p>
    </div>

    <p
      v-if="promise"
      class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900"
    >
      {{ promise }}
    </p>
  </section>
</template>
