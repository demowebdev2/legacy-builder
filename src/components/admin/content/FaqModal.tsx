"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, Select, Switch } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/hooks/useAction";

export type FaqAudience = Doc<"faqs">["audience"];

export const AUDIENCE_TITLE: Record<FaqAudience, string> = {
  consumer: "If you need cover",
  agent: "If you are an agent",
};

export function FaqModal({ faq, audience, nextSortOrder, onClose }: { faq: Doc<"faqs"> | null; audience: FaqAudience; nextSortOrder: number; onClose: () => void }) {
  const saveFaq = useMutation(api.cms.saveFaq);
  const [group, setGroup] = useState<FaqAudience>(faq?.audience ?? audience);
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [published, setPublished] = useState(faq?.published ?? true);
  const [sortOrder, setSortOrder] = useState(String(faq?.sortOrder ?? nextSortOrder));
  const [submitted, setSubmitted] = useState(false);

  const questionError = question.trim().length < 5 ? "Write the question (at least 5 characters)." : null;
  const answerError = answer.trim().length < 5 ? "Write the answer (at least 5 characters)." : null;
  const sortValue = Number(sortOrder);
  const sortError = sortOrder.trim() === "" || !Number.isInteger(sortValue) || sortValue < 0 ? "Whole number, 0 or more." : null;

  const [save, saving] = useAction(
    async () => {
      await saveFaq({ id: faq?._id, audience: group, question: question.trim(), answer: answer.trim(), published, sortOrder: sortValue });
      return true;
    },
    { success: faq ? "FAQ updated" : "FAQ added", successBody: published ? "Live on the public FAQ now." : "Saved hidden — not shown publicly." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (questionError || answerError || sortError) return;
    if (await save()) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={faq ? "Edit FAQ" : "Add an FAQ"}
      subtitle={AUDIENCE_TITLE[group]}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="faq-form" loading={saving}>
            {faq ? "Save FAQ" : "Add FAQ"}
          </Button>
        </>
      }
    >
      <form id="faq-form" onSubmit={onSubmit} noValidate>
        <Field label="Question" required error={submitted ? questionError : null}>
          <input value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
        </Field>
        <Field label="Answer" required error={submitted ? answerError : null}>
          <textarea value={answer} maxLength={2000} rows={6} onChange={(e) => setAnswer(e.target.value)} />
        </Field>
        <FieldGrid>
          <Field label="Audience">
            <Select
              value={group}
              onChange={(e) => setGroup(e.target.value as FaqAudience)}
              options={[
                { value: "consumer", label: "Consumers — if you need cover" },
                { value: "agent", label: "Agents — if you are an agent" },
              ]}
            />
          </Field>
          <Field label="Order" error={submitted ? sortError : null} help="Lower numbers show first">
            <input type="number" inputMode="numeric" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
        </FieldGrid>
        <Switch checked={published} onChange={setPublished} label={published ? "Published — shown on the public FAQ" : "Hidden — saved but not shown"} />
      </form>
    </Modal>
  );
}
