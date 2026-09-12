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
 *
 * Кнопка обновления стоит рядом с этой строкой — там, где у человека и возникает желание
 * обновить. Без неё он шёл в меню Telegram к «Обновить страницу», а перезагрузка страницы
 * в Mini App — это перезагрузка личности (issue #105).
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
  /** Подпись кнопки обновления. Читают её экранным диктором, на экране стоит значок. */
  refreshLabel: string;
  /** Перечитывание в пути: кнопка гаснет, чтобы второе нажатие не повторило запрос. */
  refreshing: boolean;
  /**
   * Отказ последнего обновления. Пусто, когда обновление удалось или его не просили.
   *
   * Строка нужна, потому что без неё нажатие ничем не отвечает: кнопка покрутилась
   * и погасла, а на экране всё прежнее — и это неотличимо от неработающей кнопки.
   */
  refreshFailedNote: string | null;
}>();

defineEmits<{ refresh: [] }>();
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-sm text-slate-500">{{ balanceTitle }}</p>
      <p class="text-5xl leading-none font-semibold tabular-nums">{{ balance }}</p>
      <p class="mt-2 text-base font-medium text-slate-700">{{ name }}</p>
      <div class="mt-1 flex items-center gap-2">
        <p v-if="updatedNote" class="text-sm text-slate-400">{{ updatedNote }}</p>

        <!--
          Значок без подписи: строка рядом уже сказала, о чём речь, а подпись во всю ширину
          звала бы нажимать её вместо чтения баланса. Имя кнопки при этом есть — `aria-label`,
          иначе диктор прочтёт пустую кнопку.
        -->
        <button
          type="button"
          class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:text-slate-300"
          :aria-label="refreshLabel"
          :title="refreshLabel"
          :disabled="refreshing"
          @click="$emit('refresh')"
        >
          <svg
            class="size-4"
            :class="{ 'animate-spin': refreshing }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>

      <!--
        Отказ обновления — строкой под отметкой свежести, а не вместо экрана: баланс, имя
        и отметка уже прочитаны и верны, и стирать их в ответ на просьбу обновить нельзя.
      -->
      <p v-if="refreshFailedNote" class="text-sm text-red-700">{{ refreshFailedNote }}</p>
    </div>

    <p
      v-if="promise"
      class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900"
    >
      {{ promise }}
    </p>
  </section>
</template>
