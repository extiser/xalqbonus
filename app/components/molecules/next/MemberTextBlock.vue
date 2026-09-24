<script setup lang="ts">
/**
 * Блок текста экрана: заголовок и абзацы под ним — приветствие на шаге 1 регистрации
 * и текст заглушек (`registration/registration-language.html`, `state-*.html`).
 *
 * На двуязычном экране блоков два: узбекский первым — `primary`, крупно и белым, русский
 * вторым — `secondary`, тише, чтобы языки не спорили. Одноязычная заглушка — один `primary`.
 *
 * Абзацы — отдельными строками массива, между ними воздух; перенос строки внутри абзаца
 * сохраняется: «Попробуйте ещё раз» в макетах стоит с новой строки.
 */
type TextBlockTone = 'primary' | 'secondary';

defineProps<{
  title: string;
  paragraphs: string[];
  tone: TextBlockTone;
}>();
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <AtomsNextMemberScreenTitle :text="title" :tone="tone" />
    <p
      v-for="(paragraph, index) in paragraphs"
      :key="index"
      class="m-0 max-w-[360px] whitespace-pre-line text-[15px] font-normal leading-[1.5]"
      :class="[tone === 'primary' ? 'text-xb-secondary' : 'text-xb-grey', index > 0 ? 'mt-2.5' : '']"
    >{{ paragraph }}</p>
  </div>
</template>
