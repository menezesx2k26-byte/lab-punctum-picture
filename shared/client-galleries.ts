import { z } from "zod";

export const CLIENT_THEMES = ["noir", "ivory", "warm"] as const;
// Canonical R4 product requirement. Do not lower this to match a provider limit.
export const CLIENT_MAX_UPLOAD_BYTES = 26_214_400;
export const CLIENT_MAX_UPLOAD_LABEL = "25 MiB";
// Current Cloudflare Images Binding .input() ceiling. This is a separate
// provider capability guard, not the product/specification maximum.
export const IMAGES_BINDING_MAX_INPUT_BYTES = 20_000_000;
export const IMAGES_BINDING_MAX_INPUT_LABEL = "20 MB";
export const IMAGES_BINDING_LIMIT_MESSAGE =
  "A especificação do estúdio mantém o limite de 25 MiB. A validação atual do Cloudflare Images aceita até 20 MB; arquivos acima de 20 MB ficam bloqueados antes de qualquer reserva ou envio. O requisito de 25 MiB não foi alterado.";
export const CLIENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const clientAccountCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(180),
  })
  .strict();
export const clientGalleryUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    introduction: z.string().trim().max(5000).optional(),
    theme: z.enum(CLIENT_THEMES).optional(),
    allowDownloads: z.boolean().optional(),
  })
  .strict();
export const clientGalleryCreateSchema = clientGalleryUpdateSchema
  .extend({
    clientId: z.uuid(),
    title: z.string().trim().min(1).max(120),
    theme: z.enum(CLIENT_THEMES).default("noir"),
  })
  .strict();
export const clientImageIntentSchema = z
  .object({
    filename: z.string().trim().min(1).max(240),
    mimeType: z.enum(CLIENT_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(CLIENT_MAX_UPLOAD_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    altText: z.string().trim().max(500).default(""),
  })
  .strict();
export type ClientAccountInput = z.infer<typeof clientAccountCreateSchema>;
export type ClientImageIntentInput = z.infer<typeof clientImageIntentSchema>;
export type ClientGalleryInput = z.infer<typeof clientGalleryCreateSchema>;
export type ClientTheme = (typeof CLIENT_THEMES)[number];
export type ClientGalleryStatus = "draft" | "published" | "archived";
export type ClientImage = {
  id: string;
  originalFilename: string;
  altText: string;
  position: number;
  status: "pending" | "ready" | "failed";
  favorite: boolean;
  favoriteCount?: number;
};
export type ClientGallery = {
  id: string;
  clientId: string;
  title: string;
  introduction: string;
  theme: ClientTheme;
  coverImageId: string | null;
  allowDownloads: boolean;
  status: ClientGalleryStatus;
  images?: ClientImage[];
  favoriteCount?: number;
};
