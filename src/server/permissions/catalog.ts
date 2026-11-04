/**
 * The single source of truth for what each role may do. Permissions describe responsibilities;
 * roles are bundles of them. An "admin" is deliberately NOT everything: finance and security
 * privileges are separate and must be granted explicitly.
 */

export const ROLE_KEYS = [
  "super_admin",
  "admin",
  "academic_manager",
  "finance_manager",
  "content_manager",
  "tutor",
  "student",
  "parent",
  "creator",
  "institutional_client",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = [
  // Users and security
  "users.view",
  "users.suspend",
  "users.restore",
  "users.manage_roles", // assign/revoke non-privileged roles
  "users.manage_privileged_roles", // assign/revoke super_admin, admin, finance_manager
  "audit.view",
  "settings.manage",
  // Academic operations
  "academic.manage_students",
  "academic.assign_tutor",
  "academic.set_rate", // agree or change a tutoring rate on a booking
  "academic.view_reports",
  "tutors.review_applications",
  "tutors.approve",
  "lms.manage_courses",
  "programmes.manage",
  // Content and marketplace
  "content.manage_site",
  "content.manage_legal",
  "marketplace.moderate",
  "marketplace.manage_creators",
  // Commerce and finance
  "commerce.manage_products",
  "commerce.manage_orders",
  "finance.view",
  "finance.refund",
  "finance.adjust_payment",
  "finance.set_commission",
  "finance.manage_payouts",
  // Portal access (resource ownership is checked separately, per record)
  "portal.student",
  "portal.parent",
  "portal.tutor",
  "portal.creator",
  "portal.institution",
  // Kaitlyn
  "assistant.manage_knowledge",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const ACADEMIC: readonly Permission[] = [
  "academic.manage_students",
  "academic.assign_tutor",
  "academic.set_rate",
  "academic.view_reports",
  "tutors.review_applications",
  "tutors.approve",
  "lms.manage_courses",
  "programmes.manage",
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  super_admin: ALL,
  admin: [
    "users.view",
    "users.suspend",
    "users.restore",
    "users.manage_roles",
    "audit.view",
    ...ACADEMIC,
    "content.manage_site",
    "content.manage_legal",
    "marketplace.moderate",
    "marketplace.manage_creators",
    "commerce.manage_products",
    "commerce.manage_orders",
    "assistant.manage_knowledge",
  ],
  academic_manager: [...ACADEMIC, "users.view"],
  finance_manager: [
    "finance.view",
    "finance.refund",
    "finance.adjust_payment",
    "finance.set_commission",
    "finance.manage_payouts",
    "commerce.manage_orders",
    "academic.set_rate",
    "audit.view",
    "users.view",
  ],
  content_manager: [
    "content.manage_site",
    "content.manage_legal",
    "marketplace.moderate",
    "assistant.manage_knowledge",
  ],
  tutor: ["portal.tutor"],
  student: ["portal.student"],
  parent: ["portal.parent"],
  creator: ["portal.creator"],
  institutional_client: ["portal.institution"],
};

/** Roles that only a super administrator may grant or revoke. */
export const PRIVILEGED_ROLES: readonly RoleKey[] = ["super_admin", "admin", "finance_manager"];

/** Roles that identify TMP staff. */
export const STAFF_ROLES: readonly RoleKey[] = [
  "super_admin",
  "admin",
  "academic_manager",
  "finance_manager",
  "content_manager",
];

export const ROLE_LABELS: Readonly<Record<RoleKey, { name: string; description: string }>> = {
  super_admin: { name: "Super Administrator", description: "Full control, including security and finance." },
  admin: { name: "Administrator", description: "Runs day-to-day operations. No finance or security privileges." },
  academic_manager: { name: "Academic Manager", description: "Manages tutors, students, courses and programmes." },
  finance_manager: { name: "Finance Manager", description: "Payments, refunds, payouts and commission." },
  content_manager: { name: "Content Manager", description: "Website content, legal pages and moderation." },
  tutor: { name: "Tutor", description: "Teaches assigned learners." },
  student: { name: "Student", description: "Learns through TMP." },
  parent: { name: "Parent / Guardian", description: "Manages children's learning and payments." },
  creator: { name: "Marketplace Creator", description: "Sells resources in the marketplace." },
  institutional_client: { name: "Institutional Client", description: "A school or institution using TMP services." },
};

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}
