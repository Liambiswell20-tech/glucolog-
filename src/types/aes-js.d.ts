declare module 'aes-js' {
  export namespace ModeOfOperation {
    class ctr {
      constructor(key: Uint8Array, counter: Counter);
      encrypt(plaintext: Uint8Array): Uint8Array;
      decrypt(ciphertext: Uint8Array): Uint8Array;
    }
  }

  export class Counter {
    constructor(initialValue: number);
  }

  export namespace utils {
    namespace utf8 {
      function toBytes(text: string): Uint8Array;
      function fromBytes(bytes: Uint8Array): string;
    }
    namespace hex {
      function fromBytes(bytes: Uint8Array): string;
      function toBytes(hex: string): Uint8Array;
    }
  }
}
