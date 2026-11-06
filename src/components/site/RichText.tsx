import Link from "next/link";
import { parseRichText, type Inline } from "@/lib/richtext";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((n, i) => {
        if (n.t === "bold") return <strong key={i}>{n.v}</strong>;
        if (n.t === "link") {
          return n.href.startsWith("/") ? (
            <Link key={i} href={n.href}>{n.v}</Link>
          ) : (
            <a key={i} href={n.href}>{n.v}</a>
          );
        }
        return <span key={i}>{n.v}</span>;
      })}
    </>
  );
}

/** Renders admin-written text (see lib/richtext.ts). Output is built from React elements, never raw HTML. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((b, i) => {
        if (b.t === "h") return <h2 key={i}><Inlines items={b.c} /></h2>;
        if (b.t === "ul") {
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}><Inlines items={it} /></li>
              ))}
            </ul>
          );
        }
        return <p key={i}><Inlines items={b.c} /></p>;
      })}
    </>
  );
}
