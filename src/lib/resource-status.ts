export const STATUS_LABEL = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Declined",
  SUSPENDED: "Taken down",
} as const;

export const STATUS_BADGE = {
  DRAFT: "bg-navy/10",
  IN_REVIEW: "bg-amber-100 text-amber-900",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-900",
  APPROVED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-900",
  SUSPENDED: "bg-red-100 text-red-900",
} as const;

export type ResourceStatusKey = keyof typeof STATUS_LABEL;

export const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
