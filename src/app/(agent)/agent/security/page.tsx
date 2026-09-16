"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ProfileTabs } from "@/components/agent/ProfileTabs";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { formatDate, timeAgo } from "@/domain/format";
import { PASSWORD_MIN_LENGTH } from "@/domain/constants";

export default function SecurityPage() {
  const agent = useAgentAccount();
  return (
    <>
      <PageHeader title="Profile & security" />
      <ProfileTabs active="security" />
      {agent === undefined ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="g g2">
          <div className="stack">
            <PasswordCard email={agent?.me.email ?? null} />
          </div>
          <div className="stack">
            <TwoFactorCard />
            <SessionsCard />
          </div>
        </div>
      )}
    </>
  );
}

function PasswordCard({ email }: { email: string | null }) {
  const { signIn } = useAuthActions();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!email) return;
    setPending(true);
    try {
      await signIn("password", { email, flow: "reset" });
      setSent(true);
      toast.success("Reset code sent", `Check ${email} for an 8-digit code.`);
    } catch (e) {
      toast.error(e, "The code was not sent");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Password" />
      <CardBody>
        <p className="sm" style={{ marginBottom: ".9rem" }}>
          To change your password we email a one-time code to <b>{email ?? "your sign-in address"}</b>. Enter it with your new password — at least{" "}
          {PASSWORD_MIN_LENGTH} characters.
        </p>
        {sent ? (
          <div className="stack" style={{ gap: ".8rem" }}>
            <Alert kind="s">
              <b>Code sent.</b> It expires in 15 minutes.
            </Alert>
            <div className="b-row">
              <ButtonLink href={`/auth/verify?email=${encodeURIComponent(email ?? "")}`} variant="navy" size="s">
                Enter the code
              </ButtonLink>
              <Button variant="ghost" size="s" loading={pending} onClick={() => void send()}>
                Send another code
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="out" size="s" loading={pending} disabled={!email} onClick={() => void send()}>
            Send me a reset code
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function TwoFactorCard() {
  const status = useQuery(api.mfa.status);
  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        actions={
          status === undefined ? null : status.enrolled ? (
            <Badge tone="g" dot>
              On
            </Badge>
          ) : (
            <Badge tone="n">Optional</Badge>
          )
        }
      />
      <CardBody>
        <p className="sm" style={{ marginBottom: ".9rem" }}>
          {status?.enrolled
            ? "Your sign-in is protected by an authenticator app. Keep your recovery options somewhere safe."
            : "Optional for agents, mandatory for Legacy Builders staff. Recommended — your dashboard holds consumer contact details."}
        </p>
        <ButtonLink href="/auth/two-factor" variant="out" size="s" full>
          {status?.enrolled ? "Manage two-factor" : "Set up 2FA"}
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

function SessionsCard() {
  const sessions = useQuery(api.users.mySessions);
  const revoke = useMutation(api.users.revokeSession);
  const toast = useToast();
  const [pending, setPending] = useState<Id<"authSessions"> | null>(null);

  const onRevoke = async (id: Id<"authSessions">) => {
    setPending(id);
    try {
      await revoke({ sessionId: id });
      toast.success("Session signed out");
    } catch (e) {
      toast.error(e, "The session was not signed out");
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Active sessions" />
      <CardBody className="stack" style={{ gap: ".55rem" }}>
        {sessions === undefined ? (
          <LoadingBlock rows={2} />
        ) : sessions.length === 0 ? (
          <p className="sm">No active sessions.</p>
        ) : (
          sessions.map((s, i) => (
            <div key={s.id} className="row-b" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-s)", padding: ".65rem .8rem" }}>
              <div>
                <div className="strong">
                  {s.current ? "This device" : `Session ${sessions.length - i}`} {s.current && <Badge tone="g">Current</Badge>}
                </div>
                <div className="xs">
                  Signed in {formatDate(s.createdAt, true)} · {timeAgo(s.createdAt)} · expires {formatDate(s.expiresAt)}
                </div>
              </div>
              {!s.current && (
                <Button variant="ghost" size="xs" loading={pending === s.id} onClick={() => void onRevoke(s.id)}>
                  Revoke
                </Button>
              )}
            </div>
          ))
        )}
        <p className="xs">Signing out a session ends it on that device straight away. To end this one, use Sign out in the sidebar.</p>
      </CardBody>
    </Card>
  );
}
