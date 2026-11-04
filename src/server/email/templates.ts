import type { EmailMessage } from "./mailer";

const SIGNOFF = "\n\nThe Modern Pedagogues\nIf you did not expect this email you can safely ignore it.";

export type TemplateName = "verify_email" | "password_reset" | "account_exists" | "password_changed";

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
