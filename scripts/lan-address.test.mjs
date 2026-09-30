import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickLanAddress } from './lan-address.mjs';

const v4 = (address, internal = false) => ({ address, family: 'IPv4', internal });

test('en0(Wi-Fi) IPv4를 우선한다', () => {
  assert.equal(
    pickLanAddress({ lo0: [v4('127.0.0.1', true)], bridge100: [v4('192.168.64.1')], en0: [v4('192.168.0.12')] }),
    '192.168.0.12',
  );
});

test('en0가 없으면 사설 IP 대역을 고른다', () => {
  assert.equal(pickLanAddress({ utun4: [v4('100.64.0.2')], en1: [v4('10.0.0.7')] }), '10.0.0.7');
});

test('내부(loopback)와 IPv6는 제외한다', () => {
  assert.equal(
    pickLanAddress({ lo0: [v4('127.0.0.1', true)], en0: [{ address: 'fe80::1', family: 'IPv6', internal: false }] }),
    'localhost',
  );
});

test('숫자 family(4)도 IPv4로 인식한다', () => {
  assert.equal(pickLanAddress({ en0: [{ address: '172.20.10.3', family: 4, internal: false }] }), '172.20.10.3');
});

test('후보가 없으면 localhost', () => {
  assert.equal(pickLanAddress({}), 'localhost');
});
