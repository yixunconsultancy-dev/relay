// Wrappers around Rust commands for the generated-documents browser (Phase 6).

import { invoke } from "@tauri-apps/api/core";

import { useQuery } from "@tanstack/react-query";

export type DocumentKind =
  | "appointment_summary"
  | "proposal"
  | "slides"
  | "writeup"
  | "policy_summary";

export const DOCUMENT_KINDS: DocumentKind[] = [
  "appointment_summary",
  "proposal",
  "slides",
  "writeup",
  "policy_summary",
];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  appointment_summary: "Appointment summary",
  proposal: "Proposal",
  slides: "Slides",
  writeup: "Writeup",
  policy_summary: "Policy summary",
};

export interface GeneratedDocument {
  kind: DocumentKind;
  path: string;
  filename: string;
  size: number;
  modified_at: string | null;
  contact_slug: string | null;
  date_iso: string | null;
}

export async function listGeneratedDocuments(): Promise<GeneratedDocument[]> {
  return invoke<GeneratedDocument[]>("list_generated_documents");
}

export async function openDocument(path: string): Promise<void> {
  return invoke<void>("open_generated_document", { path });
}

export async function revealDocumentInFinder(path: string): Promise<void> {
  return invoke<void>("reveal_generated_document", { path });
}

export async function deleteGeneratedDocument(path: string): Promise<void> {
  return invoke<void>("delete_generated_document", { path });
}

/** Reveal multiple files simultaneously in Finder (macOS). */
export async function revealFilesInFinder(paths: string[]): Promise<void> {
  return invoke<void>("reveal_files_in_finder", { paths });
}

export function useGeneratedDocuments() {
  return useQuery({
    queryKey: ["documents", "generated"],
    queryFn: listGeneratedDocuments,
  });
}

/** Best-effort slugify matching the kit's filename convention. */
export function contactSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

// Generated filenames look like `YYYY-MM-DD <contact-slug>[-purpose].ext`.
// Both the contact slug and the purpose can contain hyphens, so the only
// reliable way to recover the contact is to match the parsed slug against
// the known contacts and pick the longest one that is a prefix match.
//
// Returns the matched contact slug, or null if no contact matches.
export function matchContactSlug(
  documentSlug: string | null,
  knownSlugs: readonly string[]
): string | null {
  if (!documentSlug) return null;
  let best: string | null = null;
  for (const slug of knownSlugs) {
    if (!slug) continue;
    if (documentSlug === slug || documentSlug.startsWith(`${slug}-`)) {
      if (!best || slug.length > best.length) best = slug;
    }
  }
  return best;
}

/** True if a generated doc filename slug refers to this contact. */
export function documentBelongsToContact(
  documentSlug: string | null,
  contactName: string,
  allContactNames: readonly string[]
): boolean {
  if (!documentSlug) return false;
  const target = contactSlug(contactName);
  if (!target) return false;
  const known = allContactNames.map(contactSlug);
  return matchContactSlug(documentSlug, known) === target;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Contact Document file operations ─────────────────────────────────────────

export async function importContactDocumentFile(
  srcPath: string,
  contactId: string,
  filename: string
): Promise<string> {
  return invoke<string>("import_contact_document", { srcPath, contactId, filename });
}

export async function deleteContactDocumentFile(path: string): Promise<void> {
  return invoke<void>("delete_contact_document", { path });
}

export async function openContactDocumentFile(path: string): Promise<void> {
  return invoke<void>("open_contact_document", { path });
}

export async function revealContactDocumentFile(path: string): Promise<void> {
  return invoke<void>("reveal_contact_document", { path });
}

export async function purgeContactDocumentFolder(contactId: string): Promise<void> {
  return invoke<void>("purge_contact_documents", { contactId });
}

/** Delete all vault/Generated/ files whose slug matches this contact.
 *  Returns the number of files removed. */
export async function purgeContactGeneratedDocuments(contactSlug: string): Promise<number> {
  return invoke<number>("purge_contact_generated_documents", { contactSlug });
}

/** Derive a simple type label from a file extension. */
export function fileTypeFromName(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "pdf", xlsx: "xlsx", xls: "xlsx", csv: "csv",
    pptx: "pptx", ppt: "pptx", docx: "docx", doc: "docx",
    png: "image", jpg: "image", jpeg: "image",
  };
  return map[ext] ?? ext;
}
