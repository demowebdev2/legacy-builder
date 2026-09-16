"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ProfileTabs } from "@/components/agent/ProfileTabs";
import { type AgentAccount, useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList } from "@/components/ui/Display";
import { Alert, Avatar, PageLoading } from "@/components/ui/Feedback";
import { Field, FieldGrid } from "@/components/ui/Form";
import { formatDate } from "@/domain/format";
import { formatUsPhone } from "@/domain/normalize";
import { useAction } from "@/hooks/useAction";

const ROLE_LABEL: Record<string, string> = { AGENT: "Individual agent", AGENCY_PRINCIPAL: "Agency principal", PRODUCER: "Producer" };

export default function ProfilePage() {
  const agent = useAgentAccount();
  return (
    <>
      <PageHeader title="Profile & security" />
      <ProfileTabs active="profile" />
      {agent === undefined ? <PageLoading /> : agent ? <ProfileView agent={agent} /> : null}
    </>
  );
}

function ProfileView({ agent }: { agent: AgentAccount }) {
  const { me, account } = agent;
  return (
    <div className="g g2">
      <div className="stack">
        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <div className="row" style={{ marginBottom: "1.1rem" }}>
              <Avatar name={me.name} large />
              <div>
                <div className="strong">{me.name}</div>
                <div className="sm">
                  {account.name} · {ROLE_LABEL[me.role ?? ""] ?? me.role}
                </div>
              </div>
            </div>
            <DetailsForm key={`${me.firstName}|${me.lastName}|${me.phone}`} firstName={me.firstName ?? ""} lastName={me.lastName ?? ""} phone={me.phone ?? ""} email={me.email ?? ""} />
          </CardBody>
        </Card>
      </div>
      <div className="stack">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <DefinitionList
              items={[
                ["Account", account.name],
                ["Type", account.type === "agency" ? "Agency" : "Individual"],
                ["Your role", ROLE_LABEL[me.role ?? ""] ?? "—"],
                ["Status", <StatusBadge key="status" status={account.status} />],
              ]}
            />
            <p className="xs" style={{ marginTop: ".7rem" }}>
              Business details such as the agency name, NPN or EIN are changed by our team so they stay matched to your licences. Ask through support.
            </p>
          </CardBody>
        </Card>
        <DataCard />
      </div>
    </div>
  );
}

function DetailsForm({ firstName, lastName, phone, email }: { firstName: string; lastName: string; phone: string; email: string }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [mobile, setMobile] = useState(phone ? formatUsPhone(phone) : "");
  const [touched, setTouched] = useState(false);
  const [save, saving] = useAction(() => updateProfile({ firstName: first, lastName: last, phone: mobile.trim() || undefined }), { success: "Profile saved" });

  const errors = {
    first: first.trim() ? null : "Enter your first name.",
    last: last.trim() ? null : "Enter your last name.",
    mobile: !mobile.trim() || mobile.replace(/\D/g, "").length >= 10 ? null : "Enter a 10-digit US mobile number.",
  };
  const dirty = first !== firstName || last !== lastName || mobile.replace(/\D/g, "") !== phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!errors.first && !errors.last && !errors.mobile) void save();
      }}
      noValidate
    >
      <FieldGrid>
        <Field label="First name" required error={touched ? errors.first : null}>
          <input value={first} autoComplete="given-name" onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name" required error={touched ? errors.last : null}>
          <input value={last} autoComplete="family-name" onChange={(e) => setLast(e.target.value)} />
        </Field>
        <Field label="Email" full help="Your sign-in email cannot be changed here. Contact support and we will verify the new address first.">
          <input type="email" value={email} readOnly disabled />
        </Field>
        <Field label="Mobile" full error={touched ? errors.mobile : null}>
          <input type="tel" value={mobile} autoComplete="tel" onChange={(e) => setMobile(e.target.value)} />
        </Field>
      </FieldGrid>
      <Button type="submit" variant="navy" size="s" loading={saving} disabled={!dirty}>
        Save changes
      </Button>
    </form>
  );
}

function DataCard() {
  const tickets = useQuery(api.support.myTickets);
  const openTicket = useMutation(api.support.openTicket);
  const [request, requesting] = useAction(
    () => openTicket({ kind: "data_export", category: "Data export", message: "Please send me an export of the personal data held on my account." }),
    { success: "Data export requested", successBody: "We will email you when it is ready." },
  );
  const open = (tickets ?? []).find((t) => t.kind === "data_export" && t.status === "open");

  return (
    <Card>
      <CardHeader title="Your data" />
      <CardBody>
        <p className="sm" style={{ marginBottom: ".9rem" }}>
          Accounts are never hard-deleted. On request we anonymise your personal details and retain the financial and assignment records we are obliged to
          keep.
        </p>
        {open ? (
          <Alert kind="i">Export requested on {formatDate(open.createdAt)}. We will email you when it is ready.</Alert>
        ) : (
          <Button variant="out" size="s" loading={requesting} disabled={tickets === undefined} onClick={() => void request()}>
            Request a data export
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
