import { format } from "./money";
import { fillTemplate } from "./richtext";
import { INDICATIVE_TUTORING_RATE, SITE } from "./site";

/** Tokens an editor may use in site text. They always reflect the current business facts. */
export const TEMPLATE_VARS: Readonly<Record<string, string>> = {
  name: SITE.name,
  email: SITE.email,
  phone: SITE.phoneDisplay,
  momo: SITE.momoNetwork,
  founded: String(SITE.founded),
  country: SITE.country,
  motto: SITE.motto,
};

export const templateVars = (extra: Record<string, string> = {}) => ({
  ...TEMPLATE_VARS,
  rate: format(INDICATIVE_TUTORING_RATE),
  ...extra,
});

export { fillTemplate };
