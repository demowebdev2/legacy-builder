"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/hooks/useAction";
import { publicPath } from "./CmsTabs";

type Content = Doc<"cmsPages">["content"];

const SEO_TITLE_AIM = 60;
const SEO_TITLE_MAX = 70;
const META_AIM = 160;
const META_MAX = 200;

/** Prototype `editPageModal` plus a sections repeater. Save draft keeps the live page unchanged. */
export function EditPageModal({ page, onClose }: { page: Doc<"cmsPages">; onClose: () => void }) {
  const savePage = useMutation(api.cms.savePage);
  const initial: Content = page.draftContent ?? page.content;
  const [heroTitle, setHeroTitle] = useState(initial.heroTitle);
  const [heroBody, setHeroBody] = useState(initial.heroBody);
  const [badge, setBadge] = useState(initial.badge);
  const [sections, setSections] = useState(initial.sections.map((s, i) => ({ ...s, id: i })));
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle);
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription);
  const [submitted, setSubmitted] = useState(false);
  const [nextId, setNextId] = useState(initial.sections.length);

  const titleError = heroTitle.trim() ? null : "A headline is required.";
  const seoTitleError = seoTitle.length > SEO_TITLE_MAX ? `Keep the title tag under ${SEO_TITLE_MAX} characters.` : null;
  const metaError = seoDescription.length > META_MAX ? `Keep the meta description under ${META_MAX} characters.` : null;
  const sectionError = sections.some((s) => !s.heading.trim() && !s.body.trim()) ? "Remove empty sections or fill them in." : null;
  const invalid = !!(titleError || seoTitleError || metaError || sectionError);

  const content = (): Content => ({
    heroTitle: heroTitle.trim(),
    heroBody: heroBody.trim(),
    badge: badge.trim(),
    sections: sections.map((s) => ({ heading: s.heading.trim(), body: s.body.trim() })),
    seoTitle: seoTitle.trim(),
    seoDescription: seoDescription.trim(),
  });

  const toast = useToast();
  const [mode, setMode] = useState<"draft" | "publish" | null>(null);
  const [save, saving] = useAction(async (publish: boolean) => {
    await savePage({ pageId: page._id, content: content(), publish });
    return true;
  });

  const submit = async (publish: boolean) => {
    setSubmitted(true);
    if (invalid) return;
    setMode(publish ? "publish" : "draft");
    const ok = await save(publish);
    setMode(null);
    if (!ok) return;
    toast.success(publish ? "Published" : "Draft saved", publish ? `Live on the public site now — check ${publicPath(page.slug)}.` : "Not visible to the public yet.");
    onClose();
  };

  const updateSection = (id: number, patch: Partial<{ heading: string; body: string }>) =>
    setSections((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Edit ${page.title}`}
      subtitle={`${publicPath(page.slug)} · version ${page.version} · ${page.status === "published" ? "published" : "draft saved, live version unchanged"}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="out" size="s" loading={saving && mode === "draft"} disabled={saving} onClick={() => void submit(false)}>
            Save draft
          </Button>
          <Button variant="navy" size="s" loading={saving && mode === "publish"} disabled={saving} onClick={() => void submit(true)}>
            Publish
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        noValidate
      >
        {page.draftContent && (
          <div style={{ marginBottom: "1rem" }}>
            <Alert kind="i">You are editing an unpublished draft. The public page still shows version {page.version} until you publish.</Alert>
          </div>
        )}
        <Field label="Headline" required error={submitted ? titleError : null}>
          <input value={heroTitle} maxLength={120} onChange={(e) => setHeroTitle(e.target.value)} />
        </Field>
        <Field label="Intro paragraph">
          <textarea value={heroBody} maxLength={600} onChange={(e) => setHeroBody(e.target.value)} />
        </Field>
        <Field label="Badge text" help="Short line above the headline. Leave empty to hide it.">
          <input value={badge} maxLength={80} onChange={(e) => setBadge(e.target.value)} />
        </Field>

        <hr className="hr" />
        <div className="row-b" style={{ marginBottom: ".6rem" }}>
          <div className="eyebrow">Sections</div>
          <Button
            variant="out"
            size="xs"
            icon="plus"
            onClick={() => {
              setSections((list) => [...list, { heading: "", body: "", id: nextId }]);
              setNextId((n) => n + 1);
            }}
          >
            Add section
          </Button>
        </div>
        {sections.length === 0 && <p className="xs" style={{ marginBottom: ".9rem" }}>No body sections. The page shows its hero and built-in blocks only.</p>}
        {sections.map((s, i) => (
          <div key={s.id} className="faq-item" style={{ marginBottom: ".75rem" }}>
            <div className="row-b" style={{ marginBottom: ".4rem" }}>
              <span className="xs strong">Section {i + 1}</span>
              <Button variant="ghost" size="xs" icon="x" onClick={() => setSections((list) => list.filter((x) => x.id !== s.id))} aria-label={`Remove section ${i + 1}`}>
                Remove
              </Button>
            </div>
            <Field label="Heading">
              <input value={s.heading} maxLength={120} onChange={(e) => updateSection(s.id, { heading: e.target.value })} />
            </Field>
            <Field label="Body">
              <textarea value={s.body} maxLength={3000} onChange={(e) => updateSection(s.id, { body: e.target.value })} />
            </Field>
          </div>
        ))}
        {submitted && sectionError && (
          <p className="xs" style={{ color: "var(--red)", marginBottom: ".9rem" }} role="alert">
            {sectionError}
          </p>
        )}

        <hr className="hr" />
        <div className="eyebrow" style={{ marginBottom: ".5rem" }}>
          Search engine
        </div>
        <Field
          label="Title tag"
          error={submitted ? seoTitleError : null}
          help={`${seoTitle.length} characters — aim for under ${SEO_TITLE_AIM}${seoTitle.length > SEO_TITLE_AIM ? " (may be truncated in results)" : ""}`}
        >
          <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
        </Field>
        <Field
          label="Meta description"
          error={submitted ? metaError : null}
          help={`${seoDescription.length} characters — aim for ${META_AIM} or fewer`}
        >
          <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
