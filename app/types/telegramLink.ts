import type { DriverTelegramOtherDriver } from '#shared/types/driver';

/**
 * Типы блока «Telegram» карточки водителя (issue #305).
 *
 * Лежат отдельно от компонентов, потому что читают их двое — composable и организм, —
 * а `<script setup>` типов наружу не отдаёт.
 */

/**
 * Отказ привязки или отвязки: текст из ответа ручки и, у «привязан к другому водителю», тот
 * водитель — его имя в тексте становится ссылкой на его карточку.
 */
export type TelegramLinkDenial = {
  message: string;
  other: DriverTelegramOtherDriver | null;
};
