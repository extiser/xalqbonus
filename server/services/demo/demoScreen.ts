import { plainText } from '#server/bot/texts';
import type { DemoRole, Language } from '#server/generated/prisma/enums';
import type { MiniAppDemo } from '#shared/types/miniapp';

/**
 * Полоса «Демо-аккаунт» и шторка «Войти как» (issue #205) — роль и тексты на языке экрана
 * под полосой.
 */
export const demoScreen = (role: DemoRole, language: Language): MiniAppDemo => ({
  role,
  texts: {
    account: plainText('demo_account', language),
    roles: {
      driver: plainText('demo_role_driver', language),
      manager: plainText('demo_role_manager', language),
    },
    change: plainText('demo_change', language),
    sheetTitle: plainText('demo_sheet_title', language),
    sheetSubtitle: plainText('demo_sheet_subtitle', language),
    options: {
      driver: plainText('demo_option_driver', language),
      manager: plainText('demo_option_manager', language),
    },
    enter: plainText('demo_enter', language),
    close: plainText('button_close', language),
  },
});

/**
 * Экран сотрудника одноязычный, русский (docs/frontend.md → «Язык»), и полоса над ним говорит
 * так же: иначе над русским экраном стояла бы узбекская полоса.
 */
export const DEMO_MANAGER_LANGUAGE: Language = 'ru';
