/* ---------------------------------------------------------------------------
   KAIRO 1980 — QR codes, so an order started on a computer can finish on a phone
   ---------------------------------------------------------------------------
   The basket hands over to WhatsApp. On a phone that is one tap. On a desktop
   it opens WhatsApp Web, and a guest whose phone is not linked to that browser
   lands on a login screen with their order nowhere in sight — the whole basket
   built and then a dead end.

   So the confirmation screen offers the order as a QR code: scan it with the
   phone camera, WhatsApp opens on the phone with the message already written.
   That is the same "continue on your device" pattern airlines and payment
   providers use, and it needs no account, no app and no third party.

   Written here rather than pulled from a library because the site has no build
   step and a strict CSP: a QR encoder is a page of finite-field arithmetic, it
   never needs to change, and it costs one file instead of a dependency.

   Byte mode, error-correction level L (the most data per module — a screen is
   a clean, well-lit surface, so the redundancy is better spent on capacity).
   Rendered as SVG so it stays sharp at any size and prints cleanly.
--------------------------------------------------------------------------- */

(function () {
  'use strict';

  /* --- specification tables ------------------------------------------------
     Everything that can be computed is computed; only what the standard fixes
     by table is tabulated. Per version at level L:
       [ EC codewords per block, blocks in group 1, data codewords in a group-1
         block, blocks in group 2, data codewords in a group-2 block ]
  ------------------------------------------------------------------------- */
  var EC_L = [
    null,
    [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0], [18, 2, 68, 2, 69], [20, 4, 81, 0, 0], [24, 2, 92, 2, 93],
    [26, 4, 107, 0, 0], [30, 3, 115, 1, 116], [22, 5, 87, 1, 88], [24, 5, 98, 1, 99],
    [28, 1, 107, 5, 108], [30, 5, 120, 1, 121], [28, 3, 113, 4, 114], [28, 3, 107, 5, 108],
    [28, 4, 116, 4, 117], [28, 2, 111, 7, 112], [30, 4, 121, 5, 122], [30, 6, 117, 4, 118],
    [26, 8, 106, 4, 107]
  ];

  // Row/column centres of the alignment patterns, per version.
  var ALIGN = [
    null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
    [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
    [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106], [6, 32, 58, 84, 110]
  ];

  var MAX_VERSION = 25;

  function dataCapacity(version) {
    var t = EC_L[version];
    return t[1] * t[2] + t[3] * t[4];           // data codewords, all blocks
  }

  /* --- GF(256) -------------------------------------------------------------
     The Reed–Solomon field the standard uses, with 0x11D as the primitive
     polynomial. Log/antilog tables make multiplication an addition.
  ------------------------------------------------------------------------- */
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function buildTables() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // The generator polynomial for `degree` error-correction codewords.
  function generator(degree) {
    var poly = [1];
    for (var d = 0; d < degree; d++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var i = 0; i < poly.length; i++) {
        next[i] ^= poly[i];
        next[i + 1] ^= gfMul(poly[i], EXP[d]);
      }
      poly = next;
    }
    return poly;
  }

  function ecCodewords(data, count) {
    var gen = generator(count);
    var result = new Array(count).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result[0];
      result.shift();
      result.push(0);
      for (var j = 0; j < gen.length - 1; j++) {
        result[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return result;
  }

  /* --- bit stream ---------------------------------------------------------- */

  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (value, length) {
    for (var i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };

  /* --- data encoding -------------------------------------------------------
     Byte mode only. UTF-8 is what every scanner assumes for byte mode in
     practice, and it is what a wa.me URL needs.
  ------------------------------------------------------------------------- */

  function utf8Bytes(text) {
    var out = [];
    var encoded = encodeURI(text).replace(/%([0-9A-F]{2})/gi, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    for (var i = 0; i < encoded.length; i++) out.push(encoded.charCodeAt(i) & 0xFF);
    return out;
  }

  function chooseVersion(byteLength) {
    for (var v = 1; v <= MAX_VERSION; v++) {
      var countBits = v <= 9 ? 8 : 16;
      // 4 mode bits + the character count + the data itself.
      if (4 + countBits + byteLength * 8 <= dataCapacity(v) * 8) return v;
    }
    return 0;                                   // does not fit
  }

  function buildCodewords(bytes, version) {
    var buffer = new BitBuffer();
    buffer.put(4, 4);                                    // byte mode
    buffer.put(bytes.length, version <= 9 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

    var capacityBits = dataCapacity(version) * 8;
    var terminator = Math.min(4, capacityBits - buffer.bits.length);
    buffer.put(0, terminator);
    while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);

    var codewords = [];
    for (var b = 0; b < buffer.bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | buffer.bits[b + k];
      codewords.push(byte);
    }
    var pad = [0xEC, 0x11];
    for (var p = 0; codewords.length < dataCapacity(version); p++) {
      codewords.push(pad[p % 2]);
    }
    return codewords;
  }

  // Split into blocks, add EC to each, then interleave as the standard requires.
  function interleave(codewords, version) {
    var t = EC_L[version];
    var ecPerBlock = t[0];
    var blocks = [];
    var offset = 0;
    var g;
    for (g = 0; g < t[1]; g++) {
      blocks.push(codewords.slice(offset, offset + t[2]));
      offset += t[2];
    }
    for (g = 0; g < t[3]; g++) {
      blocks.push(codewords.slice(offset, offset + t[4]));
      offset += t[4];
    }
    var ecBlocks = blocks.map(function (block) { return ecCodewords(block, ecPerBlock); });

    var out = [];
    var longest = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
    var i, j;
    for (i = 0; i < longest; i++) {
      for (j = 0; j < blocks.length; j++) {
        if (i < blocks[j].length) out.push(blocks[j][i]);
      }
    }
    for (i = 0; i < ecPerBlock; i++) {
      for (j = 0; j < ecBlocks.length; j++) out.push(ecBlocks[j][i]);
    }
    return out;
  }

  /* --- the matrix ---------------------------------------------------------- */

  function Matrix(size) {
    this.size = size;
    this.modules = [];
    this.reserved = [];
    for (var r = 0; r < size; r++) {
      this.modules.push(new Uint8Array(size));
      this.reserved.push(new Uint8Array(size));
    }
  }
  Matrix.prototype.set = function (r, c, dark, reserve) {
    this.modules[r][c] = dark ? 1 : 0;
    if (reserve) this.reserved[r][c] = 1;
  };

  function placeFinder(m, row, col) {
    for (var r = -1; r <= 7; r++) {
      for (var c = -1; c <= 7; c++) {
        var rr = row + r, cc = col + c;
        if (rr < 0 || cc < 0 || rr >= m.size || cc >= m.size) continue;
        var dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                   (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                   (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        m.set(rr, cc, dark, true);
      }
    }
  }

  function placeAlignment(m, version) {
    var centres = ALIGN[version];
    for (var i = 0; i < centres.length; i++) {
      for (var j = 0; j < centres.length; j++) {
        var row = centres[i], col = centres[j];
        if (m.reserved[row][col]) continue;         // overlaps a finder
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            var dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            m.set(row + r, col + c, dark, true);
          }
        }
      }
    }
  }

  function placeTiming(m) {
    for (var i = 8; i < m.size - 8; i++) {
      if (!m.reserved[6][i]) m.set(6, i, i % 2 === 0, true);
      if (!m.reserved[i][6]) m.set(i, 6, i % 2 === 0, true);
    }
  }

  function reserveFormat(m, version) {
    var i;
    for (i = 0; i < 9; i++) {
      if (!m.reserved[8][i]) m.set(8, i, false, true);
      if (!m.reserved[i][8]) m.set(i, 8, false, true);
    }
    for (i = 0; i < 8; i++) {
      m.set(8, m.size - 1 - i, false, true);
      m.set(m.size - 1 - i, 8, false, true);
    }
    m.set(m.size - 8, 8, true, true);                 // the always-dark module
    if (version >= 7) {
      for (i = 0; i < 6; i++) {
        for (var j = 0; j < 3; j++) {
          m.set(m.size - 11 + j, i, false, true);
          m.set(i, m.size - 11 + j, false, true);
        }
      }
    }
  }

  // BCH(15,5) for the format, BCH(18,6) for the version — both computed.
  function bch(value, generatorPoly, bits) {
    var v = value << (bits - 1);
    var genBits = 0;
    var g = generatorPoly;
    while (g) { genBits++; g >>>= 1; }
    var rest = v;
    for (var i = bits + 4; i >= genBits; i--) {
      if (rest & (1 << (i - 1))) rest ^= generatorPoly << (i - genBits);
    }
    return v | rest;
  }

  // The 15 format bits are written twice: once wrapped around the top-left
  // finder, once split between the bottom-left and top-right ones, so a code
  // stays readable when part of it is damaged. Both copies skip the timing
  // lines, which is why neither is a straight run.
  function placeFormat(m, mask) {
    // 01 = level L, then the mask, through BCH(15,5) and the 0x5412 pattern.
    var value = bch((0x01 << 3) | mask, 0x537, 11) ^ 0x5412;
    for (var i = 0; i < 15; i++) {
      var bit = (value >>> i) & 1;

      // Copy 1: down column 8, then left along row 8, skipping the timing
      // module at (6,8) and (8,6).
      if (i < 6) m.modules[i][8] = bit;
      else if (i === 6) m.modules[7][8] = bit;
      else if (i === 7) m.modules[8][8] = bit;      // the corner
      else if (i === 8) m.modules[8][7] = bit;
      else m.modules[8][14 - i] = bit;

      // Copy 2: in from the right along row 8, then up column 8 from the
      // bottom, so damage to one corner cannot take both copies with it.
      if (i < 8) m.modules[8][m.size - 1 - i] = bit;
      else m.modules[m.size - 15 + i][8] = bit;
    }
    m.modules[m.size - 8][8] = 1;                   // the always-dark module
  }

  function placeVersion(m, version) {
    if (version < 7) return;
    var value = bch(version, 0x1F25, 13);
    for (var i = 0; i < 18; i++) {
      var bit = ((value >>> i) & 1) === 1 ? 1 : 0;
      var a = Math.floor(i / 3);
      var b = i % 3;
      m.modules[m.size - 11 + b][a] = bit;      // beside the bottom-left finder
      m.modules[a][m.size - 11 + b] = bit;      // beside the top-right finder
    }
  }

  function maskAt(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  function placeData(m, data, mask) {
    var bitIndex = 0;
    var upward = true;
    for (var right = m.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                    // the vertical timing line
      for (var step = 0; step < m.size; step++) {
        var row = upward ? m.size - 1 - step : step;
        for (var k = 0; k < 2; k++) {
          var col = right - k;
          if (m.reserved[row][col]) continue;
          var bit = 0;
          if (bitIndex < data.length * 8) {
            bit = (data[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
          }
          bitIndex++;
          if (maskAt(mask, row, col)) bit ^= 1;
          m.modules[row][col] = bit;
        }
      }
      upward = !upward;
    }
  }

  // The standard's four penalty rules, used to pick the least noisy mask.
  function penalty(m) {
    var size = m.size, score = 0, r, c, run, i;

    for (r = 0; r < size; r++) {
      run = 1;
      for (c = 1; c < size; c++) {
        if (m.modules[r][c] === m.modules[r][c - 1]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (c = 0; c < size; c++) {
      run = 1;
      for (r = 1; r < size; r++) {
        if (m.modules[r][c] === m.modules[r - 1][c]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }

    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m.modules[r][c];
        if (v === m.modules[r][c + 1] && v === m.modules[r + 1][c] && v === m.modules[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    var pattern = [1, 0, 1, 1, 1, 0, 1];
    function hasPattern(get, limit) {
      var found = 0;
      for (var start = 0; start + 7 <= limit; start++) {
        var ok = true;
        for (var k = 0; k < 7; k++) {
          if (get(start + k) !== pattern[k]) { ok = false; break; }
        }
        if (!ok) continue;
        var before = true, after = true;
        for (var b = 1; b <= 4; b++) {
          if (start - b >= 0 && get(start - b) !== 0) before = false;
          if (start + 6 + b < limit && get(start + 6 + b) !== 0) after = false;
        }
        if (before || after) found++;
      }
      return found;
    }
    for (r = 0; r < size; r++) {
      score += 40 * hasPattern(function (i) { return m.modules[r][i]; }, size);
    }
    for (c = 0; c < size; c++) {
      score += 40 * hasPattern(function (i) { return m.modules[i][c]; }, size);
    }

    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += m.modules[r][c];
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function build(text) {
    var bytes = utf8Bytes(text);
    var version = chooseVersion(bytes.length);
    if (!version) return null;                       // too long for a screen QR

    var codewords = interleave(buildCodewords(bytes, version), version);
    var size = version * 4 + 17;

    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var m = new Matrix(size);
      placeFinder(m, 0, 0);
      placeFinder(m, 0, size - 7);
      placeFinder(m, size - 7, 0);
      placeAlignment(m, version);
      placeTiming(m);
      reserveFormat(m, version);
      placeData(m, codewords, mask);
      placeFormat(m, mask);
      placeVersion(m, version);
      var score = penalty(m);
      if (!best || score < best.score) best = { matrix: m, score: score };
    }
    return best.matrix;
  }

  /* --- rendering ----------------------------------------------------------- */

  function svg(text, options) {
    var matrix = build(text);
    if (!matrix) return null;
    options = options || {};
    var quiet = options.quiet == null ? 4 : options.quiet;   // the standard margin
    var size = matrix.size;
    var total = size + quiet * 2;
    var dark = options.dark || '#1c1409';
    var light = options.light || '#ffffff';

    // One path for every dark module: a fraction of the DOM a rect-per-module
    // costs, and it scales to any size without seams.
    var path = [];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (matrix.modules[r][c]) path.push('M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z');
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" width="' + (options.width || 260) + '" height="' + (options.width || 260) +
      '" shape-rendering="crispEdges" role="img">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
      '<path fill="' + dark + '" d="' + path.join('') + '"/></svg>';
  }

  window.KairoQR = {
    svg: svg,
    // How many bytes still fit — the caller decides what to do when they do not.
    fits: function (text) { return chooseVersion(utf8Bytes(text).length) > 0; }
  };
})();
