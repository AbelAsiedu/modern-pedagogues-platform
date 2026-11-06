import { format } from "./money";
import type { Business } from "./business";
import { fillTemplate } from "./richtext";
import { INDICATIVE_TUTORING_RATE, SITE } from "./site";

/** Tokens an editor may use in site text. They always reflect the current business facts. */
export const TEMPLATE_VARS: Readonly<Record<string, string>> = {
  name: SITE.name,
  email: SITE.email,
  phone: SITE.phoneDisplay,
  momo: SITE.momoNetwork,
  momo_number: SITE.phoneDisplay,
  founded: String(SITE.founded),
  country: SITE.country,
  motto: SITE.motto,
};

export const templateVars = (extra: Record<string, string> = {}, biz?: Business) => ({
  ...TEMPLATE_VARS,
  ...(biz
    ? { name: biz.name, email: biz.email, phone: biz.phoneDisplay, momo: biz.momoNetwork, momo_number: biz.momoNumber, motto: biz.motto }
    : {}),
  rate: format(INDICATIVE_TUTORING_RATE),
  ...extra,
});

export { fillTemplate };
