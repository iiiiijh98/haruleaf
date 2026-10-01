import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodePng } from './png.mjs';

test('PNG 시그니처와 IHDR 크기를 쓴다', () => {
  const rgba = new Uint8Array(4 * 3 * 2).fill(255);
  const png = encodePng(3, 2, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 2);
  assert.equal(png[24], 8); // bit depth
  assert.equal(png[25], 6); // RGBA
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

test('픽셀 수가 맞지 않으면 오류', () => {
  assert.throws(() => encodePng(2, 2, new Uint8Array(4)), /RGBA/);
});
