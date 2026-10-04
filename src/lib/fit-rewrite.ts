// lib/fit-rewrite.ts
// A small byte-level FIT rewriter: walks a .fit file's definition and data
// messages, can drop whole message types, and can edit fields in place,
// then re-writes the header data size and both CRCs. Used for the bundled
// sample data - anonymising real recordings (scripts/demo/make-demo-data.ts)
// and, when a user loads the samples, shifting their timestamps so they
// land in the last few weeks instead of on the day they were generated.
// Decoding for display stays with fit-file-parser; this only needs field
// offsets, never meaning.

export interface FitField {
  num: number;
  size: number;
  baseType: number;
}

interface MessageDef {
  global: number;
  littleEndian: boolean;
  fields: FitField[];
  /** Total data-message payload size, including developer fields. */
  size: number;
}

/** A data message's fields, readable and writable in place. */
export interface FitMessage {
  global: number;
  /** The message's (non-developer) fields, in file order. */
  fields: readonly FitField[];
  has(num: number): boolean;
  get(num: number): number | null;
  set(num: number, value: number): void;
  /** A numeric field's values (null where invalid) - for array fields such as time_in_zone's. */
  getArray(num: number): (number | null)[] | null;
  /** Writes values (null = invalid) into a numeric field, up to its length. */
  setArray(num: number, values: (number | null)[]): void;
  /** Fills a field with its base type's "invalid" value (or zeros for strings/bytes). */
  clear(num: number): void;
}

export interface RewriteOptions {
  /** Keep messages of this global message number (default: keep all). */
  keep?: (global: number) => boolean;
  /** Drop a single data message of a kept type by returning false (runs
      before `edit`; the message's definition stays in the file). */
  filter?: (msg: FitMessage) => boolean;
  /** Edit a kept data message's fields in place. */
  edit?: (msg: FitMessage) => void;
  /** Walk a truncated file as far as its whole records go instead of
      throwing (for reading what a damaged file does contain). */
  partial?: boolean;
}

// FIT base types (low 5 bits of the base-type byte): size and invalid value.
const BASE: Record<number, { size: number; invalid: number; signed?: boolean }> = {
  0x00: { size: 1, invalid: 0xff }, // enum
  0x01: { size: 1, invalid: 0x7f, signed: true }, // sint8
  0x02: { size: 1, invalid: 0xff }, // uint8
  0x03: { size: 2, invalid: 0x7fff, signed: true }, // sint16
  0x04: { size: 2, invalid: 0xffff }, // uint16
  0x05: { size: 4, invalid: 0x7fffffff, signed: true }, // sint32
  0x06: { size: 4, invalid: 0xffffffff }, // uint32
  0x0a: { size: 1, invalid: 0 }, // uint8z
  0x0b: { size: 2, invalid: 0 }, // uint16z
  0x0c: { size: 4, invalid: 0 } // uint32z
};

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const b = bytes[i]!;
    let tmp = CRC_TABLE[crc & 0xf]!;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf]!;
    tmp = CRC_TABLE[crc & 0xf]!;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf]!;
  }
  return crc;
}

function makeMessage(def: MessageDef, bytes: Uint8Array, start: number): FitMessage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsets = new Map<number, { offset: number; field: FitField }>();
  let o = start;
  for (const f of def.fields) {
    offsets.set(f.num, { offset: o, field: f });
    o += f.size;
  }
  const le = def.littleEndian;
  type Base = (typeof BASE)[number];
  // Numeric fields only; `count` is how many values the field holds.
  const numeric = (num: number) => {
    const entry = offsets.get(num);
    if (!entry) return null;
    const base = BASE[entry.field.baseType & 0x1f];
    if (!base || entry.field.size % base.size !== 0) return null;
    return { ...entry, base, count: entry.field.size / base.size };
  };
  const read = (offset: number, base: Base) => {
    let v: number;
    if (base.size === 1) v = base.signed ? view.getInt8(offset) : view.getUint8(offset);
    else if (base.size === 2) v = base.signed ? view.getInt16(offset, le) : view.getUint16(offset, le);
    else v = base.signed ? view.getInt32(offset, le) : view.getUint32(offset, le);
    return v === base.invalid ? null : v;
  };
  const write = (offset: number, base: Base, value: number) => {
    if (base.size === 1) base.signed ? view.setInt8(offset, value) : view.setUint8(offset, value);
    else if (base.size === 2) base.signed ? view.setInt16(offset, value, le) : view.setUint16(offset, value, le);
    else base.signed ? view.setInt32(offset, value, le) : view.setUint32(offset, value, le);
  };
  return {
    global: def.global,
    fields: def.fields,
    has: (num) => offsets.has(num),
    get(num) {
      const e = numeric(num);
      // get/set treat only single-value fields as numbers.
      return e && e.count === 1 ? read(e.offset, e.base) : null;
    },
    set(num, value) {
      const e = numeric(num);
      if (e && e.count === 1) write(e.offset, e.base, value);
    },
    getArray(num) {
      const e = numeric(num);
      return e ? Array.from({ length: e.count }, (_, i) => read(e.offset + i * e.base.size, e.base)) : null;
    },
    setArray(num, values) {
      const e = numeric(num);
      if (!e) return;
      for (let i = 0; i < Math.min(e.count, values.length); i++) write(e.offset + i * e.base.size, e.base, values[i] ?? e.base.invalid);
    },
    clear(num) {
      const entry = offsets.get(num);
      if (!entry) return;
      const base = BASE[entry.field.baseType & 0x1f];
      if (!base || entry.field.size % base.size !== 0) {
        bytes.fill(0, entry.offset, entry.offset + entry.field.size);
        return;
      }
      for (let p = entry.offset; p < entry.offset + entry.field.size; p += base.size) {
        if (base.size === 1) view.setUint8(p, base.invalid);
        else if (base.size === 2) view.setUint16(p, base.invalid, le);
        else view.setUint32(p, base.invalid >>> 0, le);
      }
    }
  };
}

/**
 * Rewrites a FIT file, returning new bytes. Only the first FIT file in a
 * chained file is processed. Throws on anything that isn't a FIT file.
 */
export function rewriteFit(input: Uint8Array, opts: RewriteOptions = {}): Uint8Array<ArrayBuffer> {
  const headerSize = input[0]!;
  if (headerSize < 12 || input.length < headerSize + 2) throw new Error('Not a FIT file (bad header)');
  if (String.fromCharCode(input[8]!, input[9]!, input[10]!, input[11]!) !== '.FIT') throw new Error('Not a FIT file (no .FIT tag)');
  const headerView = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const dataSize = headerView.getUint32(4, true);
  let dataEnd = headerSize + dataSize;
  if (dataEnd + 2 > input.length) {
    if (!opts.partial) throw new Error('Truncated FIT file');
    dataEnd = input.length;
  }
  // Only reachable with `partial`: a record running past the end stops the walk.
  const overruns = (end: number) => end > dataEnd;

  const keep = opts.keep ?? (() => true);
  const bytes = input.slice(); // edits happen on a copy
  const out: Uint8Array[] = [];
  // Local type -> current definition. Dropped types stay here too: their
  // data messages still have to be skipped by their real size.
  const defs = new Map<number, MessageDef & { kept: boolean }>();
  // A data message from `start` (its record header) to `end`. Dropping one
  // with a full timestamp moves the base later compressed timestamps decode
  // from, so `filter` is for files without them.
  const emitData = (def: MessageDef & { kept: boolean }, start: number, end: number) => {
    if (!def.kept) return;
    if (opts.filter || opts.edit) {
      const msg = makeMessage(def, bytes, start + 1);
      if (opts.filter && !opts.filter(msg)) return;
      opts.edit?.(msg);
    }
    out.push(bytes.subarray(start, end));
  };

  let p = headerSize;
  while (p < dataEnd) {
    const recordHeader = bytes[p]!;
    if (recordHeader & 0x80) {
      // Compressed-timestamp data message.
      const local = (recordHeader >> 5) & 0x3;
      const def = defs.get(local);
      if (def === undefined) throw new Error(`Data message for undefined local type ${local}`);
      const end = p + 1 + def.size;
      if (overruns(end)) break;
      emitData(def, p, end);
      p = end;
    } else if (recordHeader & 0x40) {
      // Definition message.
      const local = recordHeader & 0x0f;
      const hasDev = (recordHeader & 0x20) !== 0;
      if (overruns(p + 6) || overruns(p + 6 + bytes[p + 5]! * 3)) break;
      const littleEndian = bytes[p + 2] === 0;
      const global = littleEndian ? bytes[p + 3]! | (bytes[p + 4]! << 8) : (bytes[p + 3]! << 8) | bytes[p + 4]!;
      const numFields = bytes[p + 5]!;
      let q = p + 6;
      const fields: FitField[] = [];
      let size = 0;
      for (let i = 0; i < numFields; i++) {
        const f = { num: bytes[q]!, size: bytes[q + 1]!, baseType: bytes[q + 2]! };
        fields.push(f);
        size += f.size;
        q += 3;
      }
      if (hasDev) {
        const numDev = bytes[q]!;
        q += 1;
        for (let i = 0; i < numDev; i++) {
          size += bytes[q + 1]!;
          q += 3;
        }
      }
      const kept = keep(global);
      defs.set(local, { global, littleEndian, fields, size, kept });
      if (kept) out.push(bytes.subarray(p, q));
      p = q;
    } else {
      // Normal data message.
      const local = recordHeader & 0x0f;
      const def = defs.get(local);
      if (def === undefined) throw new Error(`Data message for undefined local type ${local}`);
      const end = p + 1 + def.size;
      if (overruns(end)) break;
      emitData(def, p, end);
      p = end;
    }
  }

  const newDataSize = out.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(headerSize + newDataSize + 2);
  result.set(bytes.subarray(0, headerSize), 0);
  const view = new DataView(result.buffer);
  view.setUint32(4, newDataSize, true);
  if (headerSize >= 14) view.setUint16(12, fitCrc(result, 0, 12), true);
  let o = headerSize;
  for (const b of out) {
    result.set(b, o);
    o += b.length;
  }
  view.setUint16(o, fitCrc(result, 0, o), true);
  return result;
}

// ----- Timestamps -----

// Global message number -> its date_time fields besides the universal
// timestamp field 253.
const DATE_FIELDS: Record<number, number[]> = {
  0: [4], // file_id.time_created
  18: [2], // session.start_time
  19: [2], // lap.start_time
  34: [5], // activity.local_timestamp
  101: [2] // length.start_time
};

/**
 * Moves every timestamp in the file by `deltaSec`, rounded to a multiple of
 * 32s so compressed-timestamp headers (a 5-bit offset from the last full
 * timestamp) still decode to the same relative times.
 */
export function shiftFitTimestamps(bytes: Uint8Array, deltaSec: number): Uint8Array<ArrayBuffer> {
  const delta = Math.round(deltaSec / 32) * 32;
  return rewriteFit(bytes, {
    edit(msg) {
      for (const num of [253, ...(DATE_FIELDS[msg.global] ?? [])]) {
        const v = msg.get(num);
        if (v !== null) msg.set(num, v + delta);
      }
    }
  });
}

/** The file's latest timestamp (field 253 of any message), as FIT seconds. */
export function lastFitTimestamp(bytes: Uint8Array): number | null {
  let last: number | null = null;
  rewriteFit(bytes, {
    edit(msg) {
      const v = msg.get(253);
      if (v !== null && (last === null || v > last)) last = v;
    }
  });
  return last;
}

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
export const FIT_EPOCH_OFFSET = 631065600;
