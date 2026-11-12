import type { Id } from "@convex/_generated/dataModel";

/** Uploads to Convex storage and returns the args a send mutation expects. Server re-checks type and size. */
export async function uploadAttachment(
  file: File | null,
  generateUrl: () => Promise<string>,
): Promise<{ attachmentId?: Id<"_storage">; attachmentName?: string; attachmentType?: string }> {
  if (!file) return {};
  const url = await generateUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error("That file could not be uploaded. Please try again.");
  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
  return { attachmentId: storageId, attachmentName: file.name, attachmentType: file.type };
}
