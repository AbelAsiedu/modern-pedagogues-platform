/**
 * A deliberately tiny, safe text format for admin-editable pages. It is parsed into a typed tree and rendered
 * by React (which escapes everything), so an editor can never inject HTML or script.
 *
 *   ## Heading            a heading
 *   blank line            ends a paragraph or list
 *   - item                a bullet list item
 *   **bold**              bold text
 *   [label](/page)        a link: /path, https://, mailto: or tel: only
 *   {email} {phone} ...   replaced with the business facts in SITE (see TEMPLATE_VARS)
 */

export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string };
export type Block = { t: "p"; c: Inline[] } | { t: "h"; c: Inline[] } | { t: "ul"; items: Inline[][] };

/** Same-site path, https URL, mailto: or tel:. Never javascript:, data: or protocol-relative URLs. */
export function isSafeHref(href: string): boolean {
  return /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9]+)$/.test(href);
}

/** Replace {name} tokens with values. Unknown tokens are left as written so a typo is visible, not silent. */
export function fillTemplate(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{([a-z_]+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? vars[name]! : whole));
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: src.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (m[2] !== undefined && m[3] !== undefined) {
      out.push(isSafeHref(m[3]) ? { t: "link", v: m[2], href: m[3] } : { t: "text", v: m[2] });
    }
    last = at + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

export function parseRichText(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: "ul", items: list });
    list = null;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (line.startsWith("## ")) {
      flushPara();
      flushList();
      blocks.push({ t: "h", c: parseInline(line.slice(3)) });
    } else if (line.startsWith("- ")) {
      flushPara();
      (list ??= []).push(parseInline(line.slice(2)));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
