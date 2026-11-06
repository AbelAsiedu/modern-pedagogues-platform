import { SITE } from "./site";

/** The business facts shown across the site, after the admin's edits have been applied. */
export type Business = {
  name: string;
  motto: string;
  email: string;
  phoneDisplay: string;
  /** For tel: links, for example +233593660708. */
  phoneTel: string;
  /** For wa.me links, digits only with the country code, for example 233593660708. */
  whatsappNumber: string;
  momoNetwork: string;
  momoNumber: string;
};

/**
 * Digits only, with the country code. A Ghana number written locally (0593660708) becomes 233593660708.
 * Used for wa.me links, which need the full international number.
 */
export function internationalDigits(display: string): string {
  let d = display.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 10) d = `233${d.slice(1)}`;
  return d;
}

export const DEFAULT_BUSINESS: Business = {
  name: SITE.name,
  motto: SITE.motto,
  email: SITE.email,
  phoneDisplay: SITE.phoneDisplay,
  phoneTel: SITE.phoneTel,
  whatsappNumber: SITE.whatsappNumber,
  momoNetwork: SITE.momoNetwork,
  momoNumber: SITE.phoneDisplay,
};

export function businessFrom(get: (key: string) => string): Business {
  const phoneDisplay = get("site.phone");
  const digits = internationalDigits(phoneDisplay);
  return {
    name: get("site.name"),
    motto: get("site.motto"),
    email: get("site.email"),
    phoneDisplay,
    phoneTel: `+${digits}`,
    whatsappNumber: digits,
    momoNetwork: get("site.momo_network"),
    momoNumber: get("site.momo_number"),
  };
}

export const whatsappUrl = (biz: Pick<Business, "whatsappNumber">, message: string) =>
  `https://wa.me/${biz.whatsappNumber}?text=${encodeURIComponent(message)}`;
