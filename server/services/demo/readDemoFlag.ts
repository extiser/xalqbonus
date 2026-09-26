import { findDemoFlag, type DemoEntityKind } from '#server/repositories/demo';

export type { DemoEntityKind };

/** Сущность, о которой спрашивают: вид и идентификатор. */
export type DemoEntityRef = {
  kind: DemoEntityKind;
  id: string;
};

/**
 * Демо ли сущность (issue #212). Пусто — её нет: отказ «не найдено» скажет сама операция,
 * своим текстом, и отвечать за неё здесь было бы вторым местом того же правила.
 *
 * Признак ставится при заведении и больше не меняется, поэтому прочитанный до операции
 * он верен и во время неё: гонки «прочитали живым, записали демо» нет.
 */
export const readDemoFlag = async (entity: DemoEntityRef): Promise<boolean | null> =>
  findDemoFlag(entity.kind, entity.id);
