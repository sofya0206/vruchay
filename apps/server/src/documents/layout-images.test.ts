import { describe, expect, it } from 'vitest';
import { imageFileIds } from './layout-images';

describe('imageFileIds', () => {
  it('берёт только картинки и без повторов', () => {
    const layout = [
      { type: 'image', props: { fileId: 'a' } },
      { type: 'text', props: { text: 'Грамота' } },
      { type: 'image', props: { fileId: 'b' } },
      { type: 'image', props: { fileId: 'a' } },
    ];
    expect(imageFileIds(layout)).toEqual(['a', 'b']);
  });

  it('сырой макет из базы любого вида не роняет разбор', () => {
    expect(imageFileIds(null)).toEqual([]);
    expect(imageFileIds({})).toEqual([]);
    expect(imageFileIds([null, 1, 'x', { type: 'image' }, { type: 'image', props: { fileId: 7 } }])).toEqual([]);
  });
});
