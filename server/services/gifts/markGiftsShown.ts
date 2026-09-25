import { markGiftsShown as writeGiftsShown } from '#server/repositories/gifts';

/**
 * Водитель видел шторку со своими подарками (issue #219): второй раз сама она не показывается.
 * Чужие идентификаторы и не подарки молча пропускаются — условием записи, а не отказом:
 * отметка ничего не меняет в балансе, и спорить экрану не о чем.
 */
export const markGiftsShown = async (personId: string, rewardIds: readonly string[]): Promise<void> => {
  if (rewardIds.length === 0) {
    return;
  }

  await writeGiftsShown(personId, rewardIds);
};
