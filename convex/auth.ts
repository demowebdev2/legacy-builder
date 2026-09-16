import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { type GenericActionCtx, type GenericDataModel, makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { PASSWORD_MIN_LENGTH } from "../src/domain/constants";
import { maskEmail, normalizeEmail } from "../src/domain/normalize";
import { randomString } from "../src/domain/reference";
import { sendEmail } from "./integrations/providers";
import { templates } from "./integrations/templates";

const logOutbound = makeFunctionReference<"mutation">("integrations/messaging:logOutbound");

type SendVerificationRequest = Parameters<typeof Email>[0]["sendVerificationRequest"];

/**
 * Convex Auth passes the action ctx as a second argument at runtime, but @auth/core's type only
 * declares one parameter (the library suppresses this with @ts-expect-error internally).
 */
async function sendResetCode({ identifier, token }: { identifier: string; token: string }, ctx: GenericActionCtx<GenericDataModel>) {
  {
    const rendered = templates.passwordReset(token);
    const result = await sendEmail({ to: identifier, ...rendered, tag: "password-reset" });
    await ctx.runMutation(logOutbound, {
      channel: "email",
      template: "password_reset",
      to: maskEmail(identifier),
      subject: rendered.subject,
      bodyPreview: "Password reset code (redacted)",
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: result.error,
    });
    if (result.status === "failed") throw new ConvexError("We could not send the reset email. Please try again.");
  }
}

/** Password reset: an 8-digit code emailed through the provider abstraction (console bypass in dev). */
const PasswordResetCode = Email({
  id: "password-reset",
  maxAge: 15 * 60,
  async generateVerificationToken() {
    return randomString(8, "0123456789");
  },
  sendVerificationRequest: sendResetCode as unknown as SendVerificationRequest,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Only the email is taken from client params — roles and accounts are assigned by
      // server-side mutations (application submit, invitation acceptance), never at sign-up.
      profile(params) {
        const email = normalizeEmail(typeof params.email === "string" ? params.email : "");
        if (!email) throw new ConvexError("Enter a valid email address.");
        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < PASSWORD_MIN_LENGTH) {
          throw new ConvexError(`Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`);
        }
        if (password.length > 128) throw new ConvexError("Password is too long.");
      },
      reset: PasswordResetCode,
    }),
  ],
});
