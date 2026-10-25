export const SITE_PRESET_IDS = [
  "punctum-default",
  "colagem-autoral",
  "editorial-silencioso",
  "delicado-luminoso",
  "intenso-noturno",
  "minimalista-claro",
  "aconchegante-organico",
] as const;

export type SitePresetId = (typeof SITE_PRESET_IDS)[number];
