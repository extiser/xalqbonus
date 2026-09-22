<script setup lang="ts">
import type { MemberChestKind, MemberTextPart } from '~/types/memberView';

/**
 * Строка правил акции: сундук слева, фраза справа по центру картинки.
 *
 * Главная награда недели — золотой плашкой впритык к краям экрана и сундуком крупнее
 * на 10 %: левый край текста у всех трёх строк при этом один, на нём держится колонка.
 *
 * Выделения во фразе приходят разметкой кусков: действие водителя — полужирным, числа
 * и сроки — жирным белым, название сундука — золотом.
 */
const props = defineProps<{
  chest: MemberChestKind;
  highlighted: boolean;
  lines: MemberTextPart[][];
}>();

const EMPHASIS_CLASSES: Record<MemberTextPart['emphasis'], string> = {
  plain: 'font-light text-xb-secondary',
  action: 'font-semibold text-xb-text',
  strong: 'font-bold text-xb-text',
  gold: 'font-bold text-xb-gold',
};

const chestImage = (): string => `/design/chest-${props.chest}.png`;
</script>

<template>
  <div class="promo-rule" :class="highlighted ? 'promo-rule-gold' : ''">
    <img class="promo-rule-chest" :src="chestImage()" alt="">
    <div class="promo-rule-text">
      <div v-for="(line, index) in lines" :key="index">
        <span v-for="(part, partIndex) in line" :key="partIndex" :class="EMPHASIS_CLASSES[part.emphasis]">{{ part.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.promo-rule {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0 12px 35px;
  font-size: 14px;
  text-align: left;
}

.promo-rule-text {
  flex: 1;
  margin-top: 10px;
  margin-left: 3px;
}

.promo-rule-chest {
  flex-shrink: 0;
  width: 70px;
  height: 70px;
  margin: -14px 0 -14px -16px;
  object-fit: contain;
}

.promo-rule-gold {
  position: relative;
  margin: 0 -5px;
  padding: 22px 32px 12px 28px;
  border-radius: 22px;
  border: 1px solid rgba(247, 188, 62, 0.3);
  background: linear-gradient(135deg, rgba(247, 188, 62, 0.1) 0%, rgba(247, 188, 62, 0.03) 60%, rgba(247, 188, 62, 0) 100%);
  box-shadow: 0 0 44px -14px rgba(247, 188, 62, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.promo-rule-gold .promo-rule-text {
  margin-left: 0;
}

.promo-rule-gold .promo-rule-chest {
  width: 80px;
  height: 80px;
  margin: -10px 0 -10px -10px;
}

@media (min-width: 330px) {
  .promo-rule {
    font-size: 15px;
  }
}

@media (min-width: 361px) {
  .promo-rule {
    font-size: 16px;
  }
}

@media (min-width: 400px) {
  .promo-rule {
    padding: 12px 0 12px 44px;
    font-size: 17px;
  }

  .promo-rule-chest {
    width: 104px;
    height: 104px;
  }

  .promo-rule-gold {
    margin: 0;
    padding-top: 2px;
    padding-left: 32px;
  }

  .promo-rule-gold .promo-rule-chest {
    width: 116px;
    height: 116px;
  }
}
</style>
