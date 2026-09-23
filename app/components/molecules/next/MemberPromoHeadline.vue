<script setup lang="ts">
/**
 * Верх экрана приглашения в акцию: приветствие по имени, заголовок с золотом книзу,
 * тихая подпись и срок пилюлей — `product/design/comeback/02-promo-hero.html`.
 *
 * Заголовок растёт ступенями от самого узкого экрана: Unbounded широкий, и «возвращения»
 * при 36 px просит 314 px строки — на узких он 30, на 430 и шире 44 (запас там 1 px:
 * тронешь трекинг или текст — перемерь).
 */
defineProps<{
  hello: string;
  /** Заголовок; перенос — `\n`. */
  title: string;
  invite: string;
  period: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center gap-[18px] text-center">
    <div class="promo-hello">{{ hello }}</div>
    <div>
      <h1 class="promo-title">{{ title }}</h1>
      <div class="promo-invite">{{ invite }}</div>
      <div class="promo-period">{{ period }}</div>
    </div>
  </div>
</template>

<style scoped>
.promo-hello {
  margin-bottom: -5px;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0.9px;
}

.promo-title {
  margin: 0;
  font-family: var(--font-unbounded);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.7px;
  white-space: pre-line;
}

/* Лёгкое золото в заголовке: сверху белый, книзу тёплый уход в золото. Заливка текстом —
   только там, где браузер умеет `background-clip`, иначе буквы остались бы прозрачными. */
@supports (-webkit-background-clip: text) or (background-clip: text) {
  .promo-title {
    background: linear-gradient(180deg, #fff 0%, #fff3e0 56%, #f7bc3e 80%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
}

.promo-invite {
  margin: 12px 0 18px;
  font-size: 13px;
  font-weight: 300;
  letter-spacing: 0.9px;
  color: #c2c9d3;
}

.promo-period {
  width: fit-content;
  margin: 6px auto 0;
  padding: 2px 10px 4px 12px;
  border-radius: 999px;
  background: #fff;
  color: #000;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.9px;
}

@media (min-width: 361px) {
  .promo-title {
    font-size: 36px;
    letter-spacing: -0.9px;
  }
}

@media (min-width: 400px) {
  .promo-hello {
    font-size: 16px;
  }

  .promo-invite {
    margin: 18px 0 28px;
    font-size: 16px;
  }

  .promo-period {
    font-size: 18px;
  }
}

@media (min-width: 415px) {
  .promo-title {
    font-size: 40px;
  }
}

@media (min-width: 430px) {
  .promo-title {
    font-size: 44px;
  }
}
</style>
