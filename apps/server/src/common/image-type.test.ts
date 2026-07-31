import { describe, expect, it } from 'vitest';
import { detectImageType } from './image-type';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('detectImageType', () => {
  it('распознаёт PNG и JPEG по сигнатуре', () => {
    expect(detectImageType(png)).toEqual({ mime: 'image/png', ext: 'png' });
    expect(detectImageType(jpeg)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
  });

  it('отклоняет SVG, даже если он назван картинкой — это вектор XSS', () => {
    expect(detectImageType(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
  });

  it('отклоняет исполняемые и произвольные данные', () => {
    expect(detectImageType(Buffer.from('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(detectImageType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });

  it('не падает на пустом и обрезанном буфере', () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});
