/*
 * 纯 JavaScript 实现的 Jasypt 兼容加解密（StandardPBEStringEncryptor 默认配置）。
 *
 * 与 Java 侧等价的配置：
 *   algorithm              = PBEWithMD5AndDES
 *   keyObtentionIterations = 1000
 *   saltGenerator          = org.jasypt.salt.RandomSaltGenerator（8 字节随机盐，明文拼接在密文前）
 *   ivGenerator            = org.jasypt.salt.NoOpIVGenerator（IV 由 PBKDF1 派生）
 *   stringOutputType       = base64
 *
 * 密文格式：Base64( salt[8] || DES-CBC-PKCS5( key, iv, utf8(text) ) )
 * 其中 (key, iv) = PBKDF1-MD5(password, salt, 1000) 的前 8 字节 / 后 8 字节。
 *
 * WebCrypto 不提供 MD5 和 DES，因此这里自带一份实现。加解密对象都是很短的配置项，
 * 实现以可读性为先，没有做性能优化。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Jasypt = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* MD5                                                                 */
  /* ------------------------------------------------------------------ */

  var MD5_S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];
  var MD5_K = [];
  for (var ki = 0; ki < 64; ki++) {
    MD5_K[ki] = Math.floor(Math.abs(Math.sin(ki + 1)) * 4294967296) >>> 0;
  }

  function rotl32(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  function md5(input) {
    var msgLen = input.length;
    var paddedLen = (((msgLen + 8) >> 6) + 1) << 6; // 补到 64 的倍数，并预留 8 字节长度
    var buf = new Uint8Array(paddedLen);
    buf.set(input);
    buf[msgLen] = 0x80;
    var bitLen = msgLen * 8;
    // 64 位小端长度；JS 位运算只到 32 位，高 32 位用除法算
    var lo = bitLen >>> 0;
    var hi = Math.floor(bitLen / 4294967296) >>> 0;
    buf[paddedLen - 8] = lo & 0xff;
    buf[paddedLen - 7] = (lo >>> 8) & 0xff;
    buf[paddedLen - 6] = (lo >>> 16) & 0xff;
    buf[paddedLen - 5] = (lo >>> 24) & 0xff;
    buf[paddedLen - 4] = hi & 0xff;
    buf[paddedLen - 3] = (hi >>> 8) & 0xff;
    buf[paddedLen - 2] = (hi >>> 16) & 0xff;
    buf[paddedLen - 1] = (hi >>> 24) & 0xff;

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var M = new Array(16);

    for (var off = 0; off < paddedLen; off += 64) {
      for (var j = 0; j < 16; j++) {
        var p = off + j * 4;
        M[j] = (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
      }
      var a = a0, b = b0, c = c0, d = d0;
      for (var i = 0; i < 64; i++) {
        var f, g;
        if (i < 16) {
          f = (b & c) | (~b & d);
          g = i;
        } else if (i < 32) {
          f = (d & b) | (~d & c);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          f = b ^ c ^ d;
          g = (3 * i + 5) % 16;
        } else {
          f = c ^ (b | ~d);
          g = (7 * i) % 16;
        }
        var tmp = d;
        d = c;
        c = b;
        b = (b + rotl32((a + f + MD5_K[i] + M[g]) >>> 0, MD5_S[i])) >>> 0;
        a = tmp;
      }
      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }

    var out = new Uint8Array(16);
    var words = [a0, b0, c0, d0];
    for (var w = 0; w < 4; w++) {
      out[w * 4] = words[w] & 0xff;
      out[w * 4 + 1] = (words[w] >>> 8) & 0xff;
      out[w * 4 + 2] = (words[w] >>> 16) & 0xff;
      out[w * 4 + 3] = (words[w] >>> 24) & 0xff;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* DES（FIPS 46-3）                                                     */
  /* ------------------------------------------------------------------ */

  var DES_IP = [
    58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
    62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
    57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
    61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7
  ];
  var DES_FP = [
    40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
    38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
    36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
    34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25
  ];
  var DES_E = [
    32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9,
    8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
    16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
    24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1
  ];
  var DES_P = [
    16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
    2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25
  ];
  var DES_PC1 = [
    57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
    10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
    63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
    14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4
  ];
  var DES_PC2 = [
    14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
    23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
    41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
    44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32
  ];
  var DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
  var DES_SBOX = [
    [
      14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
      0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
      4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
      15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13
    ],
    [
      15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
      3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
      0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
      13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9
    ],
    [
      10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
      13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
      13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
      1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12
    ],
    [
      7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
      13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
      10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
      3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14
    ],
    [
      2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
      14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
      4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
      11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3
    ],
    [
      12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
      10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
      9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
      4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13
    ],
    [
      4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
      13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
      1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
      6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12
    ],
    [
      13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
      1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
      7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
      2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11
    ]
  ];

  function bytesToBits(bytes) {
    var bits = new Array(bytes.length * 8);
    for (var i = 0; i < bytes.length; i++) {
      for (var j = 0; j < 8; j++) {
        bits[i * 8 + j] = (bytes[i] >>> (7 - j)) & 1;
      }
    }
    return bits;
  }

  function bitsToBytes(bits) {
    var bytes = new Uint8Array(bits.length / 8);
    for (var i = 0; i < bytes.length; i++) {
      var v = 0;
      for (var j = 0; j < 8; j++) {
        v = (v << 1) | bits[i * 8 + j];
      }
      bytes[i] = v;
    }
    return bytes;
  }

  // 置换表按 DES 规范从 1 开始编号
  function permute(bits, table) {
    var out = new Array(table.length);
    for (var i = 0; i < table.length; i++) {
      out[i] = bits[table[i] - 1];
    }
    return out;
  }

  function rotateLeftBits(bits, n) {
    return bits.slice(n).concat(bits.slice(0, n));
  }

  function desSubkeys(keyBytes) {
    var key = permute(bytesToBits(keyBytes), DES_PC1);
    var C = key.slice(0, 28);
    var D = key.slice(28);
    var subkeys = [];
    for (var r = 0; r < 16; r++) {
      C = rotateLeftBits(C, DES_SHIFTS[r]);
      D = rotateLeftBits(D, DES_SHIFTS[r]);
      subkeys.push(permute(C.concat(D), DES_PC2));
    }
    return subkeys;
  }

  function desFeistel(R, subkey) {
    var e = permute(R, DES_E);
    for (var i = 0; i < 48; i++) {
      e[i] ^= subkey[i];
    }
    var out = [];
    for (var s = 0; s < 8; s++) {
      var b = s * 6;
      var row = (e[b] << 1) | e[b + 5];
      var col = (e[b + 1] << 3) | (e[b + 2] << 2) | (e[b + 3] << 1) | e[b + 4];
      var v = DES_SBOX[s][row * 16 + col];
      out.push((v >>> 3) & 1, (v >>> 2) & 1, (v >>> 1) & 1, v & 1);
    }
    return permute(out, DES_P);
  }

  function desBlock(subkeys, block, decrypt) {
    var bits = permute(bytesToBits(block), DES_IP);
    var L = bits.slice(0, 32);
    var R = bits.slice(32);
    for (var r = 0; r < 16; r++) {
      var f = desFeistel(R, subkeys[decrypt ? 15 - r : r]);
      var newR = new Array(32);
      for (var i = 0; i < 32; i++) {
        newR[i] = L[i] ^ f[i];
      }
      L = R;
      R = newR;
    }
    return bitsToBytes(permute(R.concat(L), DES_FP));
  }

  function xorInto(dst, src) {
    for (var i = 0; i < dst.length; i++) {
      dst[i] ^= src[i];
    }
    return dst;
  }

  function desCbcEncrypt(key, iv, data) {
    var padLen = 8 - (data.length % 8); // PKCS#5：总是补齐，至少 1 字节
    var padded = new Uint8Array(data.length + padLen);
    padded.set(data);
    for (var p = data.length; p < padded.length; p++) {
      padded[p] = padLen;
    }
    var subkeys = desSubkeys(key);
    var out = new Uint8Array(padded.length);
    var prev = iv;
    for (var off = 0; off < padded.length; off += 8) {
      var block = xorInto(padded.slice(off, off + 8), prev);
      var c = desBlock(subkeys, block, false);
      out.set(c, off);
      prev = c;
    }
    return out;
  }

  function desCbcDecrypt(key, iv, data) {
    if (data.length === 0 || data.length % 8 !== 0) {
      throw new Error('密文长度不是 8 的倍数');
    }
    var subkeys = desSubkeys(key);
    var out = new Uint8Array(data.length);
    var prev = iv;
    for (var off = 0; off < data.length; off += 8) {
      var c = data.slice(off, off + 8);
      out.set(xorInto(desBlock(subkeys, c, true), prev), off);
      prev = c;
    }
    var padLen = out[out.length - 1];
    if (padLen < 1 || padLen > 8) {
      throw new Error('填充无效（密码错误或密文损坏）');
    }
    for (var i = out.length - padLen; i < out.length; i++) {
      if (out[i] !== padLen) {
        throw new Error('填充无效（密码错误或密文损坏）');
      }
    }
    return out.slice(0, out.length - padLen);
  }

  /* ------------------------------------------------------------------ */
  /* PBKDF1（PKCS#5 v1.5）——对应 SunJCE 的 PBES1Core.deriveCipherKey       */
  /* ------------------------------------------------------------------ */

  function pbkdf1Md5(passwordBytes, salt, iterations) {
    var seed = new Uint8Array(passwordBytes.length + salt.length);
    seed.set(passwordBytes);
    seed.set(salt, passwordBytes.length);
    var t = md5(seed);
    for (var i = 1; i < iterations; i++) {
      t = md5(t);
    }
    return { key: t.slice(0, 8), iv: t.slice(8, 16) };
  }

  /*
   * SunJCE 的 PBEKey 只接受 0x20..0x7E 的可打印 ASCII 字符，其它字符会抛
   * InvalidKeySpecException("Password is not ASCII")，Jasypt 随之初始化失败。
   * 这里保持一致，避免在 JS 里"成功"加密出 Java 解不开的密文。
   */
  function passwordToBytes(password) {
    var normalized = password.normalize ? password.normalize('NFC') : password;
    var bytes = new Uint8Array(normalized.length);
    for (var i = 0; i < normalized.length; i++) {
      var code = normalized.charCodeAt(i);
      if (code < 0x20 || code > 0x7e) {
        throw new Error('密码只能包含可打印的 ASCII 字符（Java PBEWithMD5AndDES 的限制）');
      }
      bytes[i] = code & 0x7f;
    }
    return bytes;
  }

  /* ------------------------------------------------------------------ */
  /* 编码工具                                                            */
  /* ------------------------------------------------------------------ */

  var utf8Encoder = new TextEncoder();
  var utf8Decoder = new TextDecoder('utf-8');

  function base64Encode(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }

  function base64Decode(str) {
    // Jasypt 内置的 commons-codec Base64 会忽略非 Base64 字符（换行、空格等）
    var cleaned = str.replace(/[^A-Za-z0-9+/=]/g, '');
    var bin;
    try {
      bin = atob(cleaned);
    } catch (e) {
      throw new Error('密文不是合法的 Base64');
    }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  function randomSalt(size) {
    var salt = new Uint8Array(size);
    var cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (!cryptoObj || !cryptoObj.getRandomValues) {
      throw new Error('当前环境没有安全随机数源（crypto.getRandomValues）');
    }
    cryptoObj.getRandomValues(salt);
    return salt;
  }

  /* ------------------------------------------------------------------ */
  /* 对外 API                                                            */
  /* ------------------------------------------------------------------ */

  var SALT_SIZE = 8; // DES 块大小，Jasypt 的 saltSizeBytes 默认取 cipher.getBlockSize()
  var ITERATIONS = 1000;

  function encrypt(text, password) {
    var salt = randomSalt(SALT_SIZE);
    return encryptWithSalt(text, password, salt);
  }

  // 拆出来方便测试：给定盐即可得到确定性输出
  function encryptWithSalt(text, password, salt) {
    var derived = pbkdf1Md5(passwordToBytes(password), salt, ITERATIONS);
    var cipherText = desCbcEncrypt(derived.key, derived.iv, utf8Encoder.encode(text));
    var out = new Uint8Array(salt.length + cipherText.length);
    out.set(salt);
    out.set(cipherText, salt.length);
    return base64Encode(out);
  }

  function decrypt(encrypted, password) {
    var raw = base64Decode(encrypted);
    if (raw.length < SALT_SIZE + 8) {
      throw new Error('密文太短');
    }
    var salt = raw.slice(0, SALT_SIZE);
    var derived = pbkdf1Md5(passwordToBytes(password), salt, ITERATIONS);
    var plain = desCbcDecrypt(derived.key, derived.iv, raw.slice(SALT_SIZE));
    return utf8Decoder.decode(plain);
  }

  return {
    encrypt: encrypt,
    decrypt: decrypt,
    encryptWithSalt: encryptWithSalt,
    _internals: {
      md5: md5,
      desBlock: desBlock,
      desSubkeys: desSubkeys,
      desCbcEncrypt: desCbcEncrypt,
      desCbcDecrypt: desCbcDecrypt,
      pbkdf1Md5: pbkdf1Md5,
      passwordToBytes: passwordToBytes
    }
  };
});
