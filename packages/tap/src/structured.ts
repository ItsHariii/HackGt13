// The subset of RFC 8941 Structured Field Values that RFC 9421 needs:
// dictionaries whose members are inner lists (Signature-Input) or byte
// sequences (Signature), with parameters on both.

export type BareItem = string | number | boolean | Token | Uint8Array;
export type Params = Map<string, BareItem>;

/** An sf-token, kept distinct from an sf-string so it serializes unquoted. */
export class Token {
  constructor(readonly value: string) {}
}

export interface Item {
  value: BareItem;
  params: Params;
}
export interface InnerList {
  items: Item[];
  params: Params;
}
export type Member = Item | InnerList;

export function isInnerList(member: Member): member is InnerList {
  return "items" in member;
}

export class StructuredFieldError extends Error {}

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  dictionary(): Map<string, Member> {
    const out = new Map<string, Member>();
    this.ows();
    if (this.done()) return out;
    for (;;) {
      const key = this.key();
      let member: Member;
      if (this.peek() === "=") {
        this.i++;
        member = this.peek() === "(" ? this.innerList() : this.item();
      } else {
        member = { value: true, params: this.params() };
      }
      out.set(key, member);
      this.ows();
      if (this.done()) return out;
      this.expect(",");
      this.ows();
      if (this.done()) throw new StructuredFieldError("trailing comma");
    }
  }

  private innerList(): InnerList {
    this.expect("(");
    const items: Item[] = [];
    for (;;) {
      while (this.peek() === " ") this.i++;
      if (this.peek() === ")") {
        this.i++;
        return { items, params: this.params() };
      }
      items.push(this.item());
      const next = this.peek();
      if (next !== " " && next !== ")") {
        throw new StructuredFieldError("bad inner list");
      }
    }
  }

  private item(): Item {
    return { value: this.bareItem(), params: this.params() };
  }

  private params(): Params {
    const out: Params = new Map();
    while (this.peek() === ";") {
      this.i++;
      while (this.peek() === " ") this.i++;
      const key = this.key();
      let value: BareItem = true;
      if (this.peek() === "=") {
        this.i++;
        value = this.bareItem();
      }
      out.set(key, value);
    }
    return out;
  }

  private bareItem(): BareItem {
    const c = this.peek();
    if (c === '"') return this.string();
    if (c === ":") return this.bytes();
    if (c === "?") {
      this.i++;
      const b = this.s[this.i++];
      if (b !== "0" && b !== "1") throw new StructuredFieldError("bad boolean");
      return b === "1";
    }
    if (c !== undefined && /[-0-9]/.test(c)) return this.integer();
    if (c !== undefined && /[A-Za-z*]/.test(c)) return this.token();
    throw new StructuredFieldError(`unexpected ${c ?? "end of input"}`);
  }

  private string(): string {
    this.expect('"');
    let out = "";
    for (;;) {
      const c = this.s[this.i++];
      if (c === undefined)
        throw new StructuredFieldError("unterminated string");
      if (c === '"') return out;
      if (c === "\\") {
        const next = this.s[this.i++];
        if (next !== '"' && next !== "\\") {
          throw new StructuredFieldError("bad escape");
        }
        out += next;
      } else {
        const code = c.charCodeAt(0);
        if (code < 0x20 || code > 0x7e) {
          throw new StructuredFieldError("non-ASCII string");
        }
        out += c;
      }
    }
  }

  private bytes(): Uint8Array {
    this.expect(":");
    const end = this.s.indexOf(":", this.i);
    if (end < 0) throw new StructuredFieldError("unterminated byte sequence");
    const b64 = this.s.slice(this.i, end);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      throw new StructuredFieldError("bad byte sequence");
    }
    this.i = end + 1;
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let k = 0; k < binary.length; k++) out[k] = binary.charCodeAt(k);
    return out;
  }

  private integer(): number {
    const m = /^-?\d{1,15}/.exec(this.s.slice(this.i));
    if (!m) throw new StructuredFieldError("bad integer");
    this.i += m[0].length;
    if (this.peek() === ".")
      throw new StructuredFieldError("decimals unsupported");
    return Number(m[0]);
  }

  private token(): Token {
    const m = /^[A-Za-z*][!#$%&'*+\-.^_`|~0-9A-Za-z:/]*/.exec(
      this.s.slice(this.i),
    );
    if (!m) throw new StructuredFieldError("bad token");
    this.i += m[0].length;
    return new Token(m[0]);
  }

  private key(): string {
    const m = /^[a-z*][a-z0-9_\-.*]*/.exec(this.s.slice(this.i));
    if (!m) throw new StructuredFieldError("bad key");
    this.i += m[0].length;
    return m[0];
  }

  private ows() {
    while (this.peek() === " " || this.peek() === "\t") this.i++;
  }
  private peek() {
    return this.s[this.i];
  }
  private done() {
    return this.i >= this.s.length;
  }
  private expect(c: string) {
    if (this.s[this.i] !== c) throw new StructuredFieldError(`expected ${c}`);
    this.i++;
  }
}

export function parseDictionary(input: string): Map<string, Member> {
  return new Parser(input.trim()).dictionary();
}

export function serializeBareItem(value: BareItem): string {
  if (typeof value === "string") {
    if (!/^[\x20-\x7e]*$/.test(value)) {
      throw new StructuredFieldError("strings must be printable ASCII");
    }
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new StructuredFieldError("only integers are supported");
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "?1" : "?0";
  if (value instanceof Token) return value.value;
  let binary = "";
  for (const b of value) binary += String.fromCharCode(b);
  return `:${btoa(binary)}:`;
}

export function serializeParams(params: Params): string {
  let out = "";
  for (const [key, value] of params) {
    out += value === true ? `;${key}` : `;${key}=${serializeBareItem(value)}`;
  }
  return out;
}

export function serializeItem(item: Item): string {
  return serializeBareItem(item.value) + serializeParams(item.params);
}

export function serializeInnerList(list: InnerList): string {
  return `(${list.items.map(serializeItem).join(" ")})${serializeParams(list.params)}`;
}
