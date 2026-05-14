import { describe, it } from 'vitest';

describe('debug nav', () => {
  it('logs navigator language details', () => {
    console.log('initial language:', navigator.language);
    console.log('window === globalThis:', window === globalThis);
    console.log('window.navigator === navigator:', window.navigator === navigator);
    const desc = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    console.log('own desc:', desc);
    const protoDesc = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window.navigator),
      'language',
    );
    console.log('proto desc:', protoDesc);
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => 'ko-KR',
    });
    console.log('after define:', navigator.language);
  });
});
