import { describe, expect, it } from 'vitest';
import { placeWord } from './place-word';

describe('placeWord', () => {
  it('превращает цифру в слово', () => {
    expect(placeWord('1')).toBe('первое');
    expect(placeWord('3')).toBe('третье');
  });

  it('понимает запись протокола: «2 место», «2-е»', () => {
    expect(placeWord('2 место')).toBe('второе');
    expect(placeWord('2-е')).toBe('второе');
  });

  it('за пределами десятки оставляет как есть — «одиннадцатое место» не награда', () => {
    expect(placeWord('14')).toBe('14');
  });

  it('не числовое место не трогает', () => {
    expect(placeWord('Гран-при')).toBe('Гран-при');
    expect(placeWord('')).toBe('');
  });
});
