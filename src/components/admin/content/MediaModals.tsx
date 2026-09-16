"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/hooks/useAction";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/;

/** Upload to Convex storage, then record the file with its (required) alt text. */
export function MediaUploadModal({ onClose }: { onClose: () => void }) {
  const generateUploadUrl = useMutation(api.cms.generateMediaUploadUrl);
  const saveMedia = useMutation(api.cms.saveMedia);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const chooseFile = (chosen: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = chosen ? URL.createObjectURL(chosen) : null;
    previewRef.current = url;
    setFile(chosen);
    setPreview(url);
  };

  const fileError = !file ? "Choose an image to upload." : !TYPES.test(file.type) ? "Upload a PNG, JPEG, WebP, GIF or SVG image." : file.size > MAX_BYTES ? "Images must be under 8 MB." : null;
  const altError = altText.trim().length < 3 ? "Alt text is required — describe what the image shows." : null;

  const [upload, uploading] = useAction(
    async (chosen: File) => {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": chosen.type }, body: chosen });
      if (!response.ok) throw new Error("The upload failed. Try again.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await saveMedia({ storageId, filename: chosen.name, altText: altText.trim(), contentType: chosen.type, sizeBytes: chosen.size });
      return true;
    },
    { success: "Image uploaded", successBody: "Available in the media library with its alt text." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (fileError || altError || !file) return;
    if (await upload(file)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload an image"
      subtitle="Alt text is required on upload — publishing is blocked without it"
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="media-upload-form" loading={uploading}>
            Upload
          </Button>
        </>
      }
    >
      <form id="media-upload-form" onSubmit={onSubmit} noValidate>
        <Field label="Image file" required error={submitted ? fileError : null} help="PNG, JPEG, WebP, GIF or SVG, up to 8 MB. Use licensed images only.">
          <input type="file" accept="image/*" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
        </Field>
        {preview && file && (
          <div className="media-tile" style={{ maxWidth: 260, marginBottom: ".9rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={preview} alt={altText || "Preview of the selected image"} />
            <div className="meta">
              <span className="xs strong">{file.name}</span>
              <span className="xs">{Math.round(file.size / 1024)} KB</span>
            </div>
          </div>
        )}
        <Field label="Alt text" required error={submitted ? altError : null} help="What the image shows, for screen readers and search engines.">
          <input value={altText} maxLength={200} onChange={(e) => setAltText(e.target.value)} placeholder="Agent meeting a family at their kitchen table" />
        </Field>
      </form>
    </Modal>
  );
}

export function MediaAltModal({ media, onClose }: { media: { _id: Id<"media">; filename: string; altText: string; url: string | null; placeholder: boolean }; onClose: () => void }) {
  const updateMediaAlt = useMutation(api.cms.updateMediaAlt);
  const [altText, setAltText] = useState(media.altText);
  const [submitted, setSubmitted] = useState(false);
  const altError = altText.trim().length < 3 ? "Alt text is required." : null;
  const [save, saving] = useAction(
    async () => {
      await updateMediaAlt({ mediaId: media._id, altText: altText.trim() });
      return true;
    },
    { success: "Alt text updated" },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (altError) return;
    if (await save()) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit alt text"
      subtitle={media.filename}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="media-alt-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="media-alt-form" onSubmit={onSubmit} noValidate>
        {media.url && (
          <div className="media-tile" style={{ maxWidth: 260, marginBottom: ".9rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- storage and placeholder URLs are not next/image sources */}
            <img src={media.url} alt={media.altText} />
          </div>
        )}
        <Field label="Alt text" required error={submitted ? altError : null}>
          <input value={altText} maxLength={200} onChange={(e) => setAltText(e.target.value)} />
        </Field>
        {media.placeholder && (
          <Alert kind="w">
            <b>Placeholder image.</b> This is a development stand-in, not a licensed image. Upload a licensed replacement before launch.
          </Alert>
        )}
      </form>
    </Modal>
  );
}
