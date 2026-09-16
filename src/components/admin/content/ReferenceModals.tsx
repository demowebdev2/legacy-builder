"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid, Select, Switch } from "@/components/ui/Form";
import type { IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/hooks/useAction";

export type FormOptionGroup = Doc<"formOptions">["group"];

export const FORM_OPTION_GROUPS: Array<{ group: FormOptionGroup; label: string; help: string }> = [
  { group: "age_range", label: "Age range", help: "Consumer request — about you" },
  { group: "coverage_amount", label: "Cover amount", help: "Consumer request — coverage" },
  { group: "protecting", label: "Who to protect", help: "Consumer request — coverage" },
  { group: "call_time", label: "Best time to call", help: "Consumer request — contact" },
  { group: "budget_range", label: "Monthly budget range", help: "Consumer request — assumption D7, client to confirm" },
  { group: "contact_method", label: "Preferred contact method", help: "Consumer request — contact" },
  { group: "producer_count", label: "Producer count", help: "Agency application" },
];

const ICONS = ["shield", "home", "heart", "chart", "cross", "coin", "plus", "star", "users", "user", "bank", "clock", "badge", "lock", "target", "doc"] satisfies IconName[];

function sortError(value: string) {
  const n = Number(value);
  return value.trim() === "" || !Number.isInteger(n) || n < 0 ? "Whole number, 0 or more." : null;
}

function FormFooter({ formId, saving, label, onClose }: { formId: string; saving: boolean; label: string; onClose: () => void }) {
  return (
    <>
      <Button variant="out" size="s" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="navy" size="s" type="submit" form={formId} loading={saving}>
        {label}
      </Button>
    </>
  );
}

export function CoverageTypeModal({ row, nextSortOrder, onClose }: { row: Doc<"coverageTypes"> | null; nextSortOrder: number; onClose: () => void }) {
  const upsert = useMutation(api.referenceData.upsertCoverageType);
  const [key, setKey] = useState(row?.key ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [icon, setIcon] = useState(row?.icon ?? "shield");
  const [cardDescription, setCardDescription] = useState(row?.cardDescription ?? "");
  const [wizardDescription, setWizardDescription] = useState(row?.wizardDescription ?? "");
  const [imageUrl, setImageUrl] = useState(row?.imageUrl ?? "");
  const [requiresTpmo, setRequiresTpmo] = useState(row?.requiresTpmo ?? false);
  const [active, setActive] = useState(row?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? nextSortOrder));
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    key: /^[a-z_]{2,30}$/.test(key) ? null : "Lowercase letters and underscores, 2–30 characters.",
    name: name.trim() ? null : "Name is required.",
    imageUrl: !imageUrl.trim() || /^https:\/\//.test(imageUrl.trim()) ? null : "Use an https:// URL, or leave empty.",
    sortOrder: sortError(sortOrder),
  };
  const [save, saving] = useAction(
    async () => {
      await upsert({
        id: row?._id,
        key,
        name: name.trim(),
        icon,
        cardDescription: cardDescription.trim(),
        wizardDescription: wizardDescription.trim(),
        requiresTpmo,
        imageUrl: imageUrl.trim() || undefined,
        active,
        sortOrder: Number(sortOrder),
      });
      return true;
    },
    { success: row ? "Coverage type saved" : "Coverage type added" },
  );
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    if (await save()) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit ${row.name}` : "Add a coverage type"}
      subtitle="Shown on the home page, the request wizard and agent preferences"
      footer={<FormFooter formId="coverage-form" saving={saving} label="Save" onClose={onClose} />}
    >
      <form id="coverage-form" onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <Field label="Name" required error={submitted ? errors.name : null}>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Key" required error={submitted ? errors.key : null} help={row ? "Keys cannot change — leads and preferences reference them." : "Permanent identifier, e.g. final_expense"}>
            <input value={key} disabled={!!row} maxLength={30} onChange={(e) => setKey(e.target.value.toLowerCase())} />
          </Field>
          <Field label="Card description" full help="Home page coverage card">
            <input value={cardDescription} maxLength={120} onChange={(e) => setCardDescription(e.target.value)} />
          </Field>
          <Field label="Wizard description" full help="Request wizard option">
            <input value={wizardDescription} maxLength={120} onChange={(e) => setWizardDescription(e.target.value)} />
          </Field>
          <Field label="Icon">
            <Select value={icon} onChange={(e) => setIcon(e.target.value)} options={[...new Set<string>([...ICONS, icon])]} />
          </Field>
          <Field label="Sort order" error={submitted ? errors.sortOrder : null}>
            <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <Field label="Image URL" full error={submitted ? errors.imageUrl : null} help="Optional. Prefer an image uploaded to the media library.">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" />
          </Field>
        </FieldGrid>
        <div className="stack" style={{ gap: ".55rem", marginBottom: ".9rem" }}>
          <Switch checked={requiresTpmo} onChange={setRequiresTpmo} label="Requires a TPMO attestation (Medicare rules)" />
          <Switch checked={active} onChange={setActive} label={active ? "Active — offered to consumers and agents" : "Inactive — hidden from new requests"} />
        </div>
        {requiresTpmo && (
          <Alert kind="i">Only agents with an approved TPMO attestation are eligible for leads of this type. Changing this affects distribution immediately.</Alert>
        )}
      </form>
    </Modal>
  );
}

export function MarketingSourceModal({ row, nextSortOrder, onClose }: { row: Doc<"marketingSources"> | null; nextSortOrder: number; onClose: () => void }) {
  const upsert = useMutation(api.referenceData.upsertMarketingSource);
  const [key, setKey] = useState(row?.key ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [channel, setChannel] = useState(row?.channel ?? "website");
  const [defaultLeadType, setDefaultLeadType] = useState<"" | "exclusive" | "standard">(row?.defaultLeadType ?? "");
  const [active, setActive] = useState(row?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? nextSortOrder));
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    key: /^[a-z0-9_]{2,40}$/.test(key) ? null : "Lowercase letters, digits and underscores, 2–40 characters.",
    name: name.trim() ? null : "Name is required.",
    sortOrder: sortError(sortOrder),
  };
  const [save, saving] = useAction(
    async () => {
      await upsert({ id: row?._id, key, name: name.trim(), channel, defaultLeadType: defaultLeadType || undefined, active, sortOrder: Number(sortOrder) });
      return true;
    },
    { success: row ? "Marketing source saved" : "Marketing source added" },
  );
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    if (await save()) onClose();
  };
  const channels = [...new Set(["website", "meta", "partner", "admin", "other", channel])];

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit ${row.name}` : "Add a marketing source"}
      subtitle="Where a lead came from — used for reporting and, in source grading mode, for its default grade"
      footer={<FormFooter formId="source-form" saving={saving} label="Save" onClose={onClose} />}
    >
      <form id="source-form" onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <Field label="Name" required error={submitted ? errors.name : null}>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Key" required error={submitted ? errors.key : null} help={row ? "Keys cannot change." : "Sent by integrations, e.g. tiktok_ads"}>
            <input value={key} disabled={!!row} maxLength={40} onChange={(e) => setKey(e.target.value.toLowerCase())} />
          </Field>
          <Field label="Channel" help="Partner-channel sources can post to the signed partner API">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} options={channels} />
          </Field>
          <Field label="Default lead type" help="Used when grading by source">
            <Select
              value={defaultLeadType}
              onChange={(e) => setDefaultLeadType(e.target.value as "" | "exclusive" | "standard")}
              options={[
                { value: "", label: "None — follow the grading ratio" },
                { value: "exclusive", label: "Exclusive" },
                { value: "standard", label: "Standard" },
              ]}
            />
          </Field>
          <Field label="Sort order" error={submitted ? errors.sortOrder : null}>
            <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
        </FieldGrid>
        <Switch checked={active} onChange={setActive} label={active ? "Active" : "Inactive — kept for reporting history; partner API posts with this key are refused"} />
      </form>
    </Modal>
  );
}

export function FormOptionModal({ row, group, nextSortOrder, onClose }: { row: Doc<"formOptions"> | null; group: FormOptionGroup; nextSortOrder: number; onClose: () => void }) {
  const upsert = useMutation(api.referenceData.upsertFormOption);
  const meta = FORM_OPTION_GROUPS.find((g) => g.group === group);
  const [label, setLabel] = useState(row?.label ?? "");
  const [active, setActive] = useState(row?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? nextSortOrder));
  const [submitted, setSubmitted] = useState(false);
  const errors = { label: label.trim() ? null : "Label is required.", sortOrder: sortError(sortOrder) };
  const [save, saving] = useAction(
    async () => {
      await upsert({ id: row?._id, group, label: label.trim(), active, sortOrder: Number(sortOrder) });
      return true;
    },
    { success: row ? "Option saved" : "Option added" },
  );
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    if (await save()) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit option` : `Add an option`}
      subtitle={`${meta?.label ?? group} · ${meta?.help ?? ""}`}
      footer={<FormFooter formId="option-form" saving={saving} label="Save" onClose={onClose} />}
    >
      <form id="option-form" onSubmit={onSubmit} noValidate>
        <Field label="Label" required error={submitted ? errors.label : null} help="Exactly as consumers or applicants see it">
          <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Sort order" error={submitted ? errors.sortOrder : null} help="Lower numbers show first">
          <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        <Switch checked={active} onChange={setActive} label={active ? "Active — shown on the form" : "Inactive — hidden from new submissions"} />
        {row && row.label !== label.trim() && label.trim() && (
          <div style={{ marginTop: ".9rem" }}>
            <Alert kind="i">Existing leads keep the label they were submitted with. The new label applies to new submissions.</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}
