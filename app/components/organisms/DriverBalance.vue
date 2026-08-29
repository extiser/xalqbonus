<script setup lang="ts">
import { computed } from 'vue';
import type { DriverCardResponse } from '#shared/types/driver';
import { formatDateTime, formatNumber, formatSignedNumber } from '~/utils/format';

/**
 * Счёт водителя и сверка кэша с журналом.
 *
 * Два числа стоят рядом намеренно. Баланс — производная от журнала, а `accounts.balance` —
 * кэш, обновляемый только вместе с записью в журнал и в одной транзакции; расхождение
 * означает, что кто-то правит баланс мимо сервиса. Это второй инвариант из `docs/points.md`
 * и второй запрос `make invariants`, суженный до одного счёта, и человек, открывший
 * карточку, обязан увидеть, что он сошёлся, а не поверить в это.
 */
const props = defineProps<{
  card: DriverCardResponse;
}>();

const converged = computed(() => props.card.balance?.difference === 0);

/**
 * Почему счёта нет. Два разных случая, и подменять один другим нельзя: у не участника
 * счёта нет по устройству программы, а у участника его отсутствие — расхождение.
 */
const missingAccountMessage = computed(() =>
  props.card.membership
    ? 'Счёта нет, хотя человек в программе. Участие без счёта — расхождение, его надо разбирать.'
    : 'Счёта нет — в программе не состоит. Баллов нет, и ноль здесь показывать нечему.',
);
</script>

<template>
  <MoleculesSectionPanel
    title="Счёт и сверка с журналом"
    note="Баланс — производная от журнала, поле баланса всего лишь кэш. Сверка здесь — тот же запрос, что второй в make invariants."
  >
    <MoleculesStateNotice v-if="!card.balance" state="empty" :message="missingAccountMessage" />
    <div v-else>
      <dl class="grid gap-3 sm:grid-cols-3">
        <MoleculesCounterTile
          label="Кэш баланса"
          :value="card.balance.cachedBalance"
          hint="xb.accounts.balance"
        />
        <MoleculesCounterTile
          label="Сумма журнала"
          :value="card.balance.journalBalance"
          hint="сумма delta по xb.point_entries"
        />
        <!-- Единственное место экрана, которое горит красным: расхождение кэша с журналом
             означает запись мимо сервиса журнала, и заметить его надо не вглядываясь. -->
        <div
          class="rounded-md px-3 py-2 ring-1 ring-inset"
          :class="
            converged
              ? 'bg-emerald-50 ring-emerald-200'
              : 'bg-red-50 ring-red-200'
          "
        >
          <dt class="text-xs" :class="converged ? 'text-emerald-700' : 'text-red-700'">
            Расхождение
          </dt>
          <dd
            class="mt-0.5 font-mono text-lg tabular-nums"
            :class="converged ? 'text-emerald-800' : 'text-red-800'"
          >
            {{ converged ? formatNumber(0) : formatSignedNumber(card.balance.difference) }}
          </dd>
          <p class="mt-0.5 text-xs" :class="converged ? 'text-emerald-700' : 'text-red-700'">
            {{ converged ? 'журнал равен балансу' : 'баланс правят мимо журнала' }}
          </p>
        </div>
      </dl>

      <dl class="mt-4 divide-y divide-slate-100">
        <MoleculesFactRow
          label="Операций в журнале"
          :value="formatNumber(card.balance.entriesCount)"
          mono
        />
        <MoleculesFactRow
          label="Первая операция"
          :value="formatDateTime(card.balance.firstEntryAt)"
          mono
        />
        <MoleculesFactRow
          label="Последняя операция"
          :value="formatDateTime(card.balance.lastEntryAt)"
          mono
        />
        <MoleculesFactRow label="Счёт" :value="card.balance.accountId" mono />
      </dl>

      <!-- Сосуществование со старым ботом названо на экране: он продолжает править балансы
           в public мимо нашего журнала, и расхождение на переходный период ожидаемо.
           Сверка это показывает, но не исправляет (docs/principles.md). -->
      <p v-if="!converged" class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        Кэш баланса разошёлся с журналом. Пока жив старый бот, правящий балансы напрямую,
        расхождение ожидаемо и не исправляется само. Тот же счёт покажет и
        <span class="font-mono">make invariants</span> вторым запросом.
      </p>
    </div>
  </MoleculesSectionPanel>
</template>
