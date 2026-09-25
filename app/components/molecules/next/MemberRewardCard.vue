<script setup lang="ts">
import { computed } from 'vue';
import type { MemberRewardView } from '~/types/memberView';

/**
 * Награда на главной — `_reference/design/home/rewards-block.html`. В разделе «Мои награды»
 * награду рисует `MemberItemCard`.
 *
 * `compact` — ждущие, две строки: что и где ждать. Кода нет — он виден любому, кто заглянул
 * через плечо; вместо него обещание «код внутри» и шеврон. Цвет золотой, а не зелёный: на главной
 * зелёный был бы третьим акцентом после граната баланса и золота акции, а золото там уже значит
 * подарок.
 *
 * `full` — ждущих нет, но награды были: одна последняя целиком — что, откуда, состояние и офис
 * (сцена 3 блока). Полученная — спокойная строка. Сгоревшая гаснет целиком, но остаётся читаемой:
 * пустота вместо неё выглядела бы так, будто награды и не было.
 *
 * Карточка обязана открываться — в обоих вариантах, тем же `open`: экран награды у товара
 * и произвольной есть всегда (Руслан, 25-09-2026). Кроме баллов: они на балансе, экран им
 * не нужен, и их карточка не нажимается, как в разделе. У полной шеврона нет — меняется только
 * отклик на нажатие.
 */
type RewardCardVariant = 'full' | 'compact';

const props = defineProps<{
  reward: MemberRewardView;
  variant: RewardCardVariant;
}>();

defineEmits<{ open: [] }>();

const isAwaiting = computed(() => props.reward.status === 'awaiting');

const opens = computed(() => props.reward.kind !== 'points');
</script>

<template>
  <AtomsNextMemberCard v-if="variant === 'compact'" tone="gold" clickable @click="$emit('open')">
    <span class="flex items-center gap-3 px-3.5 py-[13px]">
      <span class="flex min-w-0 grow flex-col gap-0.5">
        <span class="text-[16px] font-bold leading-[1.25]">{{ reward.title }}</span>
        <AtomsNextMemberStateLine tone="gold" :state="reward.state" :hint="reward.hint" />
      </span>
      <AtomsNextMemberChevron tone="gold" />
    </span>
  </AtomsNextMemberCard>

  <!-- Строчные элементы внутри: нажимаемая карточка — `<button>`, и блочный `<article>` в ней недопустим -->
  <AtomsNextMemberCard
    v-else
    :tone="isAwaiting ? 'green' : 'plain'"
    :dimmed="reward.status === 'expired'"
    :clickable="opens"
    @click="$emit('open')"
  >
    <span class="flex flex-col gap-[3px] px-4 py-3.5">
      <span class="text-[16px] leading-[1.25]" :class="reward.status === 'issued' ? 'font-semibold' : 'font-bold'">
        {{ reward.title }}
      </span>
      <span v-if="reward.origin" class="text-[13px] font-light text-xb-grey">{{ reward.origin }}</span>
      <span class="mt-1">
        <AtomsNextMemberStateLine :tone="isAwaiting ? 'green' : 'quiet'" :state="reward.state" />
      </span>
      <span v-if="reward.office" class="text-[13px] font-light text-xb-grey">{{ reward.office }}</span>
    </span>
  </AtomsNextMemberCard>
</template>
