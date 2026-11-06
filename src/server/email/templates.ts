import type { EmailMessage } from "./mailer";

const SIGNOFF = "\n\nThe Modern Pedagogues\nIf you did not expect this email you can safely ignore it.";

export type TemplateName =
  | "verify_email"
  | "password_reset"
  | "account_exists"
  | "password_changed"
  | "tutor_application_received"
  | "tutor_application_alert"
  | "tutor_decision"
  | "order_placed"
  | "order_alert"
  | "order_paid"
  | "resource_submitted"
  | "resource_alert"
  | "resource_decision"
  | "payout_recorded";

export function verifyEmailMessage(to: string, name: string, link: string): EmailMessage & { template: TemplateName } {
  return {
    template: "verify_email",
    to,
    subject: "Confirm your email address",
    text: `Hello ${name},\n\nWelcome to The Modern Pedagogues. Please confirm your email address to activate your account:\n\n${link}\n\nThis link expires in 24 hours.${SIGNOFF}`,
  };
}

export function passwordResetMessage(to: string, name: string, link: string): EmailMessage & { template: TemplateName } {
  return {
    template: "password_reset",
    to,
    subject: "Set or reset your password",
    text: `Hello ${name},\n\nUse the link below to choose a new password:\n\n${link}\n\nThis link expires in 1 hour and can be used once.${SIGNOFF}`,
  };
}

/** Sent instead of a second verification email when someone registers with an address that already has an account. */
export function accountExistsMessage(to: string, name: string, resetLink: string): EmailMessage & { template: TemplateName } {
  return {
    template: "account_exists",
    to,
    subject: "You already have an account",
    text: `Hello ${name},\n\nSomeone tried to register with this email address, but an account already exists. If that was you, you can sign in, or reset your password here:\n\n${resetLink}${SIGNOFF}`,
  };
}

export function passwordChangedMessage(to: string, name: string): EmailMessage & { template: TemplateName } {
  return {
    template: "password_changed",
    to,
    subject: "Your password was changed",
    text: `Hello ${name},\n\nYour password was just changed and you were signed out of other devices. If this was not you, reset your password immediately and contact us.${SIGNOFF}`,
  };
}

export function tutorApplicationReceivedMessage(to: string, name: string): EmailMessage & { template: TemplateName } {
  return {
    template: "tutor_application_received",
    to,
    subject: "We received your tutor application",
    text: `Hello ${name},\n\nThank you for applying to tutor with The Modern Pedagogues. Our team reviews every application and will contact you about next steps. Nothing is published on the website until you have been reviewed and approved.${SIGNOFF}`,
  };
}

/** Sent to TMP's own inbox so a new application is noticed even before anyone opens the admin area. */
export function tutorApplicationAlertMessage(to: string, applicant: string, link: string): EmailMessage & { template: TemplateName } {
  return {
    template: "tutor_application_alert",
    to,
    subject: `New tutor application: ${applicant}`,
    text: `A new tutor application from ${applicant} is waiting for review:\n\n${link}${SIGNOFF}`,
  };
}

export type TutorDecisionKind = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export function tutorDecisionMessage(to: string, name: string, decision: TutorDecisionKind, note: string | null): EmailMessage & { template: TemplateName } {
  const extra = note ? `\n\nMessage from our team:\n${note}` : "";
  const body: Record<TutorDecisionKind, [string, string]> = {
    APPROVED: ["Your tutor profile is approved", "Good news: your application has been approved and your profile is now listed on our website. We will be in touch about the next steps."],
    REJECTED: ["About your tutor application", "Thank you for your interest in tutoring with The Modern Pedagogues. After review, we are not able to take your application forward at this time."],
    CHANGES_REQUESTED: ["We need a little more from you on your tutor application", "Thank you for applying. Before we can continue we need a few changes or some more information."],
  };
  const [subject, text] = body[decision];
  return { template: "tutor_decision", to, subject, text: `Hello ${name},\n\n${text}${extra}${SIGNOFF}` };
}

export function orderPlacedMessage(
  to: string,
  name: string,
  o: { reference: string; productTitle: string; amount: string; momoNetwork: string; momoNumber: string; ordersLink: string },
): EmailMessage & { template: TemplateName } {
  return {
    template: "order_placed",
    to,
    subject: `Your order ${o.reference}: ${o.productTitle}`,
    text:
      `Hello ${name},\n\nThank you for ordering "${o.productTitle}".\n\n` +
      `To complete your order, send ${o.amount} by ${o.momoNetwork} to ${o.momoNumber} and use ${o.reference} as the payment reference.\n\n` +
      `We confirm payments personally, usually within a few hours. When we do, your download appears here:\n\n${o.ordersLink}${SIGNOFF}`,
  };
}

/** Sent to TMP's own inbox so an order is noticed and its payment can be matched. */
export function orderAlertMessage(
  to: string,
  o: { buyer: string; productTitle: string; amount: string; reference: string; link: string },
): EmailMessage & { template: TemplateName } {
  return {
    template: "order_alert",
    to,
    subject: `New order ${o.reference}: ${o.productTitle}`,
    text: `${o.buyer} ordered "${o.productTitle}" (${o.amount}). Payment reference: ${o.reference}.\n\nWhen the MoMo payment arrives, confirm it here:\n\n${o.link}${SIGNOFF}`,
  };
}

export function orderPaidMessage(to: string, name: string, o: { productTitle: string; reference: string; ordersLink: string }): EmailMessage & { template: TemplateName } {
  return {
    template: "order_paid",
    to,
    subject: `Payment received: ${o.productTitle}`,
    text: `Hello ${name},\n\nWe have received your payment for "${o.productTitle}" (${o.reference}). You can download it now:\n\n${o.ordersLink}\n\nSign in if asked. The download stays available in your account.${SIGNOFF}`,
  };
}

export function resourceSubmittedMessage(to: string, name: string, title: string, link: string): EmailMessage & { template: TemplateName } {
  return {
    template: "resource_submitted",
    to,
    subject: `We received "${title}" for review`,
    text: `Hello ${name},\n\nThank you for submitting "${title}". Our team reviews every resource against the TMP quality standard. We will email you with the outcome, with specific feedback if changes are needed. You can follow its status here:\n\n${link}${SIGNOFF}`,
  };
}

export function resourceAlertMessage(to: string, creator: string, title: string, link: string): EmailMessage & { template: TemplateName } {
  return { template: "resource_alert", to, subject: `Resource awaiting review: ${title}`, text: `${creator} submitted "${title}" for review:\n\n${link}${SIGNOFF}` };
}

export type ResourceDecisionKind = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "SUSPENDED";

export function resourceDecisionMessage(to: string, name: string, title: string, decision: ResourceDecisionKind, note: string, link: string): EmailMessage & { template: TemplateName } {
  const body: Record<ResourceDecisionKind, [string, string]> = {
    APPROVED: [`"${title}" is approved`, "Good news: it met the TMP quality standard and is now live in the Resources section."],
    CHANGES_REQUESTED: [`Changes needed for "${title}"`, "Thank you for submitting it. It is close, but it does not yet meet the TMP quality standard. Please read the feedback below, make the changes, and submit it again."],
    REJECTED: [`About "${title}"`, "Thank you for submitting it. After review we are not able to publish it, for the reasons below. You are welcome to submit a different resource."],
    SUSPENDED: [`"${title}" has been taken down`, "We have removed it from the Resources section for the reason below. People who already bought it are not affected unless we tell you otherwise. Please reply to this email or contact TMP to resolve it."],
  };
  const [subject, text] = body[decision];
  const feedback = note ? `\n\nFeedback from our reviewer:\n${note}` : "";
  return { template: "resource_decision", to, subject, text: `Hello ${name},\n\n${text}${feedback}\n\nYour dashboard:\n${link}${SIGNOFF}` };
}

export function payoutRecordedMessage(to: string, name: string, amount: string, reference: string): EmailMessage & { template: TemplateName } {
  return { template: "payout_recorded", to, subject: `Payout of ${amount} sent`, text: `Hello ${name},\n\nWe have sent you ${amount} for your resource sales (MoMo reference ${reference}). Thank you for selling with The Modern Pedagogues.${SIGNOFF}` };
}
