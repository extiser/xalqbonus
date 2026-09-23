<script setup lang="ts">
import type { MemberPromoRuleView } from '~/types/memberView';

/**
 * Экран приглашения в акцию — `product/design/comeback/02-promo-hero.html`.
 *
 * Первый вход в акцию: приветствие, срок, три правила с сундуками и решение. Экран целиком
 * подползает снизу вверх при открытии, блоки встают по очереди. Живой фон — тот же,
 * что на главной: переход с плашки приглашения сюда не должен менять небо.
 */
defineProps<{
  hello: string;
  title: string;
  invite: string;
  period: string;
  rules: MemberPromoRuleView[];
  texts: {
    ask: string;
    accept: string;
    consent: string;
    decline: string;
  };
}>();

defineEmits<{ accept: []; decline: [] }>();
</script>

<template>
  <section
    class="relative box-border flex min-h-dvh flex-col gap-[18px] bg-xb-screen px-4 pb-[22px] pt-[30px] font-manrope leading-[normal] text-xb-text min-[400px]:px-[22px] min-[400px]:pt-[60px]"
  >
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <AtomsNextMemberLiveBackdrop />
    </div>

    <AtomsNextMemberRise>
      <MoleculesNextMemberPromoHeadline :hello="hello" :title="title" :invite="invite" :period="period" />
    </AtomsNextMemberRise>

    <AtomsNextMemberRise :step="3">
      <div class="flex flex-col gap-3.5 min-[400px]:mt-2.5 min-[400px]:gap-[30px]">
        <MoleculesNextMemberPromoRule
          v-for="rule in rules"
          :key="rule.id"
          :chest="rule.chest"
          :highlighted="rule.highlighted"
          :lines="rule.lines"
        />
      </div>
    </AtomsNextMemberRise>

    <AtomsNextMemberRise :step="3">
      <MoleculesNextMemberPromoDecision
        :ask="texts.ask"
        :accept="texts.accept"
        :consent="texts.consent"
        :decline="texts.decline"
        @accept="$emit('accept')"
        @decline="$emit('decline')"
      />
    </AtomsNextMemberRise>
  </section>
</template>
