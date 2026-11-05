// ==========================================
// 複数のテキストファイルを1つのZIPにまとめる（圧縮はしない、まとめるだけ）
// 外部のライブラリを使わずに動くように、ZIPの決まった形をそのまま書いている
// ファイル名は日本語でも文字化けしないように UTF-8 の印を付ける
// ==========================================

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: 'ファイル名.txt', data: Uint8Array }] → ZIPの中身（Uint8Array）
function makeZip(files, date) {
    const d = date || new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const enc = new TextEncoder();

    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach(f => {
        const nameBytes = enc.encode(f.name);
        const crc = crc32(f.data);
        const size = f.data.length;

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);   // ファイルの始まりの印
        local.setUint16(4, 20, true);           // 必要なバージョン
        local.setUint16(6, 0x0800, true);       // ファイル名が UTF-8
        local.setUint16(8, 0, true);            // 圧縮しない
        local.setUint16(10, dosTime, true);
        local.setUint16(12, dosDate, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, size, true);
        local.setUint32(22, size, true);
        local.setUint16(26, nameBytes.length, true);
        local.setUint16(28, 0, true);
        locals.push(new Uint8Array(local.buffer), nameBytes, f.data);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true); // 目次の印
        central.setUint16(4, 20, true);
        central.setUint16(6, 20, true);
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 0, true);
        central.setUint16(12, dosTime, true);
        central.setUint16(14, dosDate, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, size, true);
        central.setUint32(24, size, true);
        central.setUint16(28, nameBytes.length, true);
        central.setUint32(42, offset, true);    // このファイルの位置
        centrals.push(new Uint8Array(central.buffer), nameBytes);

        offset += 30 + nameBytes.length + size;
    });

    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);         // 目次の終わりの印
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
    let p = 0;
    parts.forEach(b => { out.set(b, p); p += b.length; });
    return out;
}

if (typeof module !== 'undefined') {
    module.exports = { makeZip, crc32 };
}
