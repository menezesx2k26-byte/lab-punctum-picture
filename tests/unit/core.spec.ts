import { describe, expect, it } from "vitest";
import { normalizeTeamDomain } from "../../worker/utils/auth";
import {
  IMAGE_PRESETS,
  isImagePreset,
  negotiateImageFormat,
} from "../../worker/media/presets";
import { canPublish, evaluatePublishChecklist } from "../../worker/utils/publish";
import { orderedPositions } from "../../worker/utils/reorder";
import { slugify } from "../../worker/utils/slug";
import { albumCreateSchema, inquirySchema } from "../../worker/utils/validation";

describe("utilitários centrais", () => {
  it("gera slugs estáveis em português", () => {
    expect(slugify("Ensaio de Casal — São Paulo")).toBe(
      "ensaio-de-casal-sao-paulo",
    );
  });

  it("valida schemas essenciais", () => {
    expect(albumCreateSchema.safeParse({ title: "Ana e Lucas" }).success).toBe(true);
    expect(albumCreateSchema.safeParse({ title: "A" }).success).toBe(false);
    expect(
      inquirySchema.safeParse({
        name: "Cliente Exemplo",
        email: "cliente@exemplo.com",
        message: "Gostaria de um orçamento para setembro.",
      }).success,
    ).toBe(true);
  });

  it("bloqueia publicação com checklist incompleto", () => {
    const checks = evaluatePublishChecklist({
      title: "Ensaio",
      slug: "ensaio",
      coverBelongsToAlbum: false,
      readyImageCount: 1,
    });
    expect(checks.hasCover).toBe(false);
    expect(canPublish(checks)).toBe(false);
  });

  it("resolve somente presets permitidos e negocia formato", () => {
    expect(isImagePreset("hero")).toBe(true);
    expect(isImagePreset("9999x9999")).toBe(false);
    expect(IMAGE_PRESETS.thumb.width).toBe(320);
    expect(negotiateImageFormat("image/avif,image/webp")).toBe("image/avif");
    expect(negotiateImageFormat("image/avif,image/webp", true)).toBe("image/webp");
    expect(negotiateImageFormat("image/avif", true)).toBe("image/avif");
    expect(negotiateImageFormat("image/jpeg", true)).toBe("image/jpeg");
    expect(negotiateImageFormat("image/webp")).toBe("image/webp");
    expect(negotiateImageFormat(null)).toBe("image/jpeg");
  });

  it("gera posições espaçadas para reorder", () => {
    expect(orderedPositions(["img-3", "img-1", "img-2"])).toEqual([
      { imageId: "img-3", position: 1000 },
      { imageId: "img-1", position: 2000 },
      { imageId: "img-2", position: 3000 },
    ]);
  });

  it("normaliza o domínio do Cloudflare Access", () => {
    expect(normalizeTeamDomain("minha-equipe")).toBe(
      "minha-equipe.cloudflareaccess.com",
    );
    expect(normalizeTeamDomain("https://minha-equipe.cloudflareaccess.com/")).toBe(
      "minha-equipe.cloudflareaccess.com",
    );
  });
});
