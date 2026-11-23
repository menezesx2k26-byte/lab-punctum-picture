"use client";
import { isProtectedSection, protectImmersiveConfig } from "../../../shared/config/immersive-policy";

import {
  Check,
  Eye,
  FileText,
  Images,
  LayoutPanelTop,
  Monitor,
  Palette,
  Redo2,
  RotateCcw,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDITORIAL_TEXT_LIMITS,
  PUNCTUM_DEFAULT_SITE_CONFIG,
  SECTION_REGISTRY,
  siteConfigSchema,
  type EditorialConfig,
  type SiteConfig,
} from "../../../shared/config";
import { StudioPageComposer, type SectionEdit } from "./studio/StudioPageComposer";
import { StudioPhotosPanel, type StudioPhoto } from "./studio/StudioPhotosPanel";
import { StudioStylePanel } from "./studio/StudioStylePanel";

type StudioSection = "style" | "texts" | "page" | "photos";

type StudioResponse = {
  siteConfig?: SiteConfig;
  source?: string;
  issues?: string[];
  updatedAt?: string | null;
  revision?: number;
  hasUnpublishedChanges?: boolean;
  history?: PublishedVersion[];
  error?: { code?: string; message?: string; field?: string };
};

type PublishedVersion = {
  id: string;
  publishedAt: string;
  publishedBy: string;
  restoredFromVersionId: string | null;
  isCurrent: boolean;
};

type PreviewDevice = "computer" | "tablet" | "phone";
type SaveState = "loading" | "idle" | "saving" | "saved" | "error";

type CopyField = {
  path: readonly string[];
  label: string;
  context: string;
  maxLength: number;
  multiline?: boolean;
};

type CopyGroup = {
  title: string;
  description: string;
  fields: readonly CopyField[];
};

const COPY_GROUPS: readonly CopyGroup[] = [
  {
    title: "Página inicial · abertura",
    description: "A primeira mensagem que aparece sobre a foto principal.",
    fields: [
      { path: ["home", "hero", "eyebrow"], label: "Pequena frase acima", context: "Acima da frase principal", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["home", "hero", "title"], label: "Frase principal", context: "Primeira parte do grande título", maxLength: EDITORIAL_TEXT_LIMITS.title },
      { path: ["home", "hero", "accent"], label: "Trecho em destaque", context: "A parte inclinada do grande título", maxLength: EDITORIAL_TEXT_LIMITS.accent },
      { path: ["home", "hero", "body"], label: "Texto abaixo", context: "Apresentação curta da abertura", maxLength: EDITORIAL_TEXT_LIMITS.subtitle, multiline: true },
      { path: ["home", "hero", "primaryCta"], label: "Botão principal", context: "Leva para o portfólio", maxLength: EDITORIAL_TEXT_LIMITS.cta },
      { path: ["home", "hero", "secondaryCta"], label: "Segundo botão", context: "Leva para o arquivo completo", maxLength: EDITORIAL_TEXT_LIMITS.cta },
    ],
  },
  {
    title: "Página inicial · manifesto",
    description: "As frases que apresentam o olhar da Punctum.",
    fields: [
      { path: ["home", "statement", "eyebrow"], label: "Pequena chamada", context: "Antes do manifesto", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["home", "statement", "title"], label: "Frase do manifesto", context: "Título da seção", maxLength: EDITORIAL_TEXT_LIMITS.title, multiline: true },
      { path: ["home", "statement", "body"], label: "Texto do manifesto", context: "Ao lado da frase", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
    ],
  },
  {
    title: "Página inicial · acervo",
    description: "A apresentação dos carrosséis e das histórias em destaque.",
    fields: [
      { path: ["home", "carousel", "eyebrow"], label: "Chamada do acervo", context: "Acima do primeiro carrossel", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["home", "carousel", "title"], label: "Título do acervo", context: "Use uma quebra de linha se desejar", maxLength: EDITORIAL_TEXT_LIMITS.title, multiline: true },
      { path: ["home", "carousel", "body"], label: "Apresentação do acervo", context: "Ao lado do título", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["home", "carousel", "hint"], label: "Dica do carrossel", context: "Entre as setas", maxLength: EDITORIAL_TEXT_LIMITS.note },
      { path: ["home", "featured", "title"], label: "Título das histórias", context: "Primeira parte", maxLength: EDITORIAL_TEXT_LIMITS.title },
      { path: ["home", "featured", "accent"], label: "Trecho em destaque", context: "Segunda parte inclinada", maxLength: EDITORIAL_TEXT_LIMITS.accent },
      { path: ["home", "featured", "body"], label: "Apresentação das histórias", context: "Ao lado do título", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
    ],
  },
  {
    title: "Página inicial · sobre",
    description: "Sua apresentação, seu olhar e a frase da fotografia.",
    fields: [
      { path: ["home", "about", "eyebrow"], label: "Pequena chamada", context: "Acima da frase sobre você", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["home", "about", "quote"], label: "Frase sobre o olhar", context: "Em tamanho grande", maxLength: EDITORIAL_TEXT_LIMITS.title, multiline: true },
      { path: ["home", "about", "body"], label: "Texto de apresentação", context: "Sua biografia curta", maxLength: EDITORIAL_TEXT_LIMITS.biography, multiline: true },
      { path: ["home", "about", "cta"], label: "Botão do acervo", context: "Abaixo da apresentação", maxLength: EDITORIAL_TEXT_LIMITS.cta },
      { path: ["home", "about", "imageNote"], label: "Frase sobre a foto", context: "Sobre a imagem da seção", maxLength: EDITORIAL_TEXT_LIMITS.note },
    ],
  },
  {
    title: "Página inicial · contato",
    description: "O convite que aparece antes do formulário.",
    fields: [
      { path: ["home", "contact", "eyebrow"], label: "Pequena chamada", context: "Antes do título", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["home", "contact", "title"], label: "Título do contato", context: "Ao lado do formulário", maxLength: EDITORIAL_TEXT_LIMITS.title, multiline: true },
      { path: ["home", "contact", "body"], label: "Texto do contato", context: "Abaixo do título", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
    ],
  },
  {
    title: "Portfólio",
    description: "Abertura, apresentação das histórias e percurso livre.",
    fields: [
      { path: ["portfolio", "hero", "title"], label: "Título do portfólio", context: "Primeira parte", maxLength: EDITORIAL_TEXT_LIMITS.title },
      { path: ["portfolio", "hero", "accent"], label: "Trecho em destaque", context: "Segunda parte inclinada", maxLength: EDITORIAL_TEXT_LIMITS.accent },
      { path: ["portfolio", "hero", "body"], label: "Apresentação", context: "Abaixo do título", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["portfolio", "hero", "cta"], label: "Botão para as histórias", context: "Leva até os ensaios", maxLength: EDITORIAL_TEXT_LIMITS.cta },
      { path: ["portfolio", "hero", "imageNote"], label: "Legenda da foto principal", context: "Sobre a imagem", maxLength: EDITORIAL_TEXT_LIMITS.note },
      { path: ["portfolio", "listing", "intro"], label: "Texto antes das histórias", context: "Logo acima dos filtros", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["portfolio", "reel", "eyebrow"], label: "Chamada do percurso livre", context: "Acima do último carrossel", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["portfolio", "reel", "title"], label: "Título do percurso livre", context: "Use uma quebra de linha se desejar", maxLength: EDITORIAL_TEXT_LIMITS.title, multiline: true },
      { path: ["portfolio", "reel", "body"], label: "Texto do percurso livre", context: "Ao lado do título", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["portfolio", "reel", "hint"], label: "Dica do carrossel", context: "Entre as setas", maxLength: EDITORIAL_TEXT_LIMITS.note },
      { path: ["portfolio", "seo", "title"], label: "Título para busca", context: "Aparece na aba e nos buscadores", maxLength: EDITORIAL_TEXT_LIMITS.seoTitle },
      { path: ["portfolio", "seo", "description"], label: "Descrição para busca", context: "Resumo da página para buscadores", maxLength: EDITORIAL_TEXT_LIMITS.seoDescription, multiline: true },
    ],
  },
  {
    title: "Arquivo completo",
    description: "A frase de abertura e o texto que explica o acervo.",
    fields: [
      { path: ["archive", "hero", "title"], label: "Título do arquivo", context: "Primeira parte", maxLength: EDITORIAL_TEXT_LIMITS.title },
      { path: ["archive", "hero", "accent"], label: "Trecho em destaque", context: "Segunda parte inclinada", maxLength: EDITORIAL_TEXT_LIMITS.accent },
      { path: ["archive", "hero", "body"], label: "Apresentação do arquivo", context: "Ao lado das contagens", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["archive", "seo", "title"], label: "Título para busca", context: "Aparece na aba e nos buscadores", maxLength: EDITORIAL_TEXT_LIMITS.seoTitle },
      { path: ["archive", "seo", "description"], label: "Descrição para busca", context: "Resumo da página para buscadores", maxLength: EDITORIAL_TEXT_LIMITS.seoDescription, multiline: true },
    ],
  },
  {
    title: "Contato",
    description: "A abertura da página e o convite antes do formulário.",
    fields: [
      { path: ["contact", "hero", "eyebrow"], label: "Pequena chamada", context: "Acima da frase principal", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["contact", "hero", "title"], label: "Frase principal", context: "Sobre a foto", maxLength: EDITORIAL_TEXT_LIMITS.title, multiline: true },
      { path: ["contact", "hero", "body"], label: "Apresentação", context: "Abaixo da frase principal", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["contact", "hero", "imageNote"], label: "Legenda da foto", context: "No canto da imagem", maxLength: EDITORIAL_TEXT_LIMITS.note },
      { path: ["contact", "form", "eyebrow"], label: "Chamada do formulário", context: "Acima do título", maxLength: EDITORIAL_TEXT_LIMITS.eyebrow },
      { path: ["contact", "form", "title"], label: "Título do formulário", context: "Primeira parte", maxLength: EDITORIAL_TEXT_LIMITS.title },
      { path: ["contact", "form", "accent"], label: "Trecho em destaque", context: "Segunda parte inclinada", maxLength: EDITORIAL_TEXT_LIMITS.accent },
      { path: ["contact", "form", "body"], label: "Texto do formulário", context: "Ao lado dos campos", maxLength: EDITORIAL_TEXT_LIMITS.paragraph, multiline: true },
      { path: ["contact", "seo", "title"], label: "Título para busca", context: "Aparece na aba e nos buscadores", maxLength: EDITORIAL_TEXT_LIMITS.seoTitle },
      { path: ["contact", "seo", "description"], label: "Descrição para busca", context: "Resumo da página para buscadores", maxLength: EDITORIAL_TEXT_LIMITS.seoDescription, multiline: true },
    ],
  },
  {
    title: "Ensaios",
    description: "Textos iguais em todas as páginas de história.",
    fields: [
      { path: ["album", "storyTitle"], label: "Título da apresentação", context: "Antes do texto de cada ensaio", maxLength: EDITORIAL_TEXT_LIMITS.title },
      { path: ["album", "archiveNote"], label: "Texto ao final", context: "Depois da galeria", maxLength: EDITORIAL_TEXT_LIMITS.subtitle, multiline: true },
      { path: ["album", "archiveCta"], label: "Botão ao final", context: "Leva para o arquivo completo", maxLength: EDITORIAL_TEXT_LIMITS.cta },
    ],
  },
  {
    title: "Menu e rodapé",
    description: "Nomes visíveis; os destinos dos links continuam protegidos.",
    fields: [
      { path: ["chrome", "brandSubtitle"], label: "Palavra abaixo da marca", context: "No canto superior", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "navigation", "portfolio"], label: "Portfólio no menu", context: "O endereço continua /portfolio", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "navigation", "archive"], label: "Arquivo no menu", context: "O endereço continua /arquivo", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "navigation", "about"], label: "Apresentação no menu", context: "Leva para a seção sobre", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "navigation", "contact"], label: "Contato no menu", context: "O endereço continua /contato", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "footer", "tagline"], label: "Frase do rodapé", context: "Abaixo do nome da marca", maxLength: EDITORIAL_TEXT_LIMITS.subtitle, multiline: true },
      { path: ["chrome", "footer", "stories"], label: "Histórias no rodapé", context: "Leva para o portfólio", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "footer", "archive"], label: "Arquivo no rodapé", context: "Leva para o arquivo", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "footer", "contact"], label: "Contato no rodapé", context: "Leva para o contato", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "footer", "instagram"], label: "Instagram no rodapé", context: "Aparece quando houver link", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "footer", "email"], label: "E-mail no rodapé", context: "Aparece quando houver e-mail", maxLength: EDITORIAL_TEXT_LIMITS.navigation },
      { path: ["chrome", "footer", "credit"], label: "Assinatura do rodapé", context: "Depois do ano", maxLength: EDITORIAL_TEXT_LIMITS.note },
      { path: ["chrome", "whatsappCta"], label: "Botão do WhatsApp", context: "Ao lado dos formulários", maxLength: EDITORIAL_TEXT_LIMITS.cta },
    ],
  },
];

function readEditorialValue(editorial: EditorialConfig, path: readonly string[]): string {
  let current: unknown = editorial;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return "";
    current = Reflect.get(current, key);
  }
  return typeof current === "string" ? current : "";
}

function writeEditorialValue(
  config: SiteConfig,
  path: readonly string[],
  value: string,
): SiteConfig {
  const next = structuredClone(config);
  let current: object = next.editorial;
  for (const key of path.slice(0, -1)) {
    const child = Reflect.get(current, key);
    if (typeof child !== "object" || child === null) return config;
    current = child;
  }
  Reflect.set(current, path[path.length - 1], value);
  return next;
}

function CopyInput({
  field,
  value,
  onChange,
}: {
  field: CopyField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `studio-${field.path.join("-")}`;
  const remaining = field.maxLength - value.length;
  const inputProps = {
    id,
    className: "admin-input",
    value,
    maxLength: field.maxLength,
    required: true,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
    "aria-describedby": `${id}-help`,
  };

  return (
    <label className="studio-copy-field" htmlFor={id}>
      <span>{field.label}</span>
      <small id={`${id}-help`}>{field.context}</small>
      {field.multiline ? <textarea {...inputProps} rows={4} /> : <input {...inputProps} />}
      <small className={remaining < Math.ceil(field.maxLength * 0.15) ? "near-limit" : ""}>
        {remaining < Math.ceil(field.maxLength * 0.15)
          ? "Esse texto está perto do limite."
          : `${remaining} caracteres disponíveis`}
      </small>
    </label>
  );
}

export function StudioManager() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<SiteConfig | null>(null);
  const [section, setSection] = useState<StudioSection>("style");
  const [status, setStatus] = useState("Carregando seu Studio…");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [revision, setRevision] = useState<number | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [history, setHistory] = useState<PublishedVersion[]>([]);
  const [conflict, setConflict] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("computer");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [photos, setPhotos] = useState<StudioPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const configRef = useRef<SiteConfig | null>(null);
  const savedConfigRef = useRef<SiteConfig | null>(null);
  const revisionRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<number> | null>(null);
  const operationRef = useRef(false);
  const undoStackRef = useRef<SiteConfig[]>([]);
  const redoStackRef = useRef<SiteConfig[]>([]);
  const photosLoadedRef = useRef(false);

  const resetLocalHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryState({ undo: 0, redo: 0 });
  }, []);

  const commitConfig = useCallback((next: SiteConfig, message: string) => {
    next = protectImmersiveConfig(next);
    const current = configRef.current;
    if (!current || JSON.stringify(current) === JSON.stringify(next)) return;
    undoStackRef.current = [...undoStackRef.current.slice(-39), structuredClone(current)];
    redoStackRef.current = [];
    configRef.current = next;
    setConfig(next);
    setHistoryState({ undo: undoStackRef.current.length, redo: 0 });
    setStatus(message);
  }, []);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    const current = configRef.current;
    if (!previous || !current) return;
    redoStackRef.current.push(structuredClone(current));
    configRef.current = previous;
    setConfig(previous);
    setHistoryState({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
    setStatus("Última mudança desfeita.");
  }, []);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    const current = configRef.current;
    if (!next || !current) return;
    undoStackRef.current.push(structuredClone(current));
    configRef.current = next;
    setConfig(next);
    setHistoryState({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
    setStatus("Mudança refeita.");
  }, []);

  const loadPhotos = useCallback(async () => {
    if (photosLoadedRef.current || photosLoading) return;
    setPhotosLoading(true);
    setPhotosError(null);
    try {
      const response = await fetch("/admin/api/studio/photos", { cache: "no-store" });
      const body = (await response.json()) as {
        photos?: StudioPhoto[];
        error?: { message?: string };
      };
      if (!response.ok || !body.photos) {
        throw new Error(body.error?.message ?? "Não foi possível preparar suas fotografias.");
      }
      photosLoadedRef.current = true;
      setPhotos(body.photos);
    } catch (error) {
      photosLoadedRef.current = false;
      setPhotosError(
        error instanceof Error ? error.message : "Não foi possível preparar suas fotografias.",
      );
    } finally {
      setPhotosLoading(false);
    }
  }, [photosLoading]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const applyStudioResponse = useCallback((body: StudioResponse, replaceLocal = true) => {
    if (!body.siteConfig || typeof body.revision !== "number") {
      throw new Error("O Studio devolveu uma resposta incompleta.");
    }
    const protectedConfig = protectImmersiveConfig(body.siteConfig);
    savedConfigRef.current = protectedConfig;
    revisionRef.current = body.revision;
    setSavedConfig(protectedConfig);
    setRevision(body.revision);
    setHasUnpublishedChanges(Boolean(body.hasUnpublishedChanges));
    setHistory(body.history ?? []);
    if (replaceLocal) {
      configRef.current = protectedConfig;
      setConfig(protectedConfig);
    }
    setPreviewRevision(body.revision);
    return body.revision;
  }, []);

  const loadStudio = useCallback(async (replaceLocal = true) => {
    const response = await fetch("/admin/api/studio", { cache: "no-store" });
    const body = (await response.json()) as StudioResponse;
    if (!response.ok || !body.siteConfig) {
      throw new Error(body.error?.message ?? "Não foi possível abrir o Studio.");
    }
    applyStudioResponse(body, replaceLocal);
    if (replaceLocal) resetLocalHistory();
    setConflict(false);
    setSaveState("saved");
    setStatus(
      body.issues?.length
        ? "Abrimos uma versão segura para você continuar."
        : "Tudo salvo.",
    );
  }, [applyStudioResponse, resetLocalHistory]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void loadStudio().catch((error) => {
        if (active) {
          setSaveState("error");
          setStatus(error instanceof Error ? error.message : "Não foi possível abrir o Studio.");
        }
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [loadStudio]);

  const changed = useMemo(
    () => Boolean(config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig)),
    [config, savedConfig],
  );

  const persistCurrentDraft = useCallback(async (): Promise<number> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const candidate = configRef.current;
    const currentRevision = revisionRef.current;
    if (!candidate || currentRevision === null) throw new Error("O Studio ainda está abrindo.");
    if (
      savedConfigRef.current &&
      JSON.stringify(candidate) === JSON.stringify(savedConfigRef.current)
    ) {
      return currentRevision;
    }

    const candidateJson = JSON.stringify(candidate);
    setSaveState("saving");
    setStatus("Salvando…");
    const request = (async () => {
      const response = await fetch("/admin/api/studio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteConfig: candidate, revision: currentRevision }),
      });
      const body = (await response.json()) as StudioResponse;
      if (!response.ok || !body.siteConfig || typeof body.revision !== "number") {
        if (response.status === 409 && body.error?.code === "STUDIO_CHANGED_ELSEWHERE") {
          setConflict(true);
        }
        throw new Error(body.error?.message ?? "Não foi possível salvar agora.");
      }
      const localStillMatches = JSON.stringify(configRef.current) === candidateJson;
      const nextRevision = applyStudioResponse(body, localStillMatches);
      setSaveState("saved");
      setStatus("Tudo salvo.");
      return nextRevision;
    })()
      .catch((error) => {
        setSaveState("error");
        setStatus(error instanceof Error ? error.message : "Não foi possível salvar agora.");
        throw error;
      })
      .finally(() => {
        savePromiseRef.current = null;
      });
    savePromiseRef.current = request;
    return request;
  }, [applyStudioResponse]);

  useEffect(() => {
    if (!changed || conflict || operationRef.current || revision === null) return;
    setSaveState("idle");
    setStatus("Alteração pronta. Vamos salvar automaticamente.");
    const timeout = window.setTimeout(() => {
      if (!operationRef.current) {
        void persistCurrentDraft().catch(() => undefined);
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [changed, config, conflict, persistCurrentDraft, revision]);

  async function flushDraft(): Promise<number> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = configRef.current;
      const saved = savedConfigRef.current;
      if (current && saved && JSON.stringify(current) === JSON.stringify(saved)) {
        const currentRevision = revisionRef.current;
        if (currentRevision === null) break;
        return currentRevision;
      }
      await persistCurrentDraft();
    }
    const currentRevision = revisionRef.current;
    if (currentRevision === null) throw new Error("O Studio ainda está abrindo.");
    return currentRevision;
  }

  async function runStudioAction(
    path: "publish" | "discard" | "restore",
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    const response = await fetch(`/admin/api/studio/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as StudioResponse;
    if (!response.ok || !body.siteConfig) {
      if (response.status === 409 && body.error?.code === "STUDIO_CHANGED_ELSEWHERE") {
        setConflict(true);
      }
      throw new Error(body.error?.message ?? "Não foi possível concluir agora.");
    }
    applyStudioResponse(body);
    resetLocalHistory();
    setConflict(false);
    setSaveState("saved");
    setStatus(successMessage);
  }

  async function publishChanges() {
    if (conflict) return;
    operationRef.current = true;
    setBusyAction(true);
    setStatus("Preparando a publicação…");
    try {
      const currentRevision = await flushDraft();
      await runStudioAction(
        "publish",
        { revision: currentRevision },
        "Alterações publicadas. O site já está atualizado.",
      );
    } catch (error) {
      setSaveState("error");
      setStatus(error instanceof Error ? error.message : "Não foi possível publicar agora.");
    } finally {
      operationRef.current = false;
      setBusyAction(false);
    }
  }

  async function discardChanges() {
    if (!window.confirm("Isso vai apagar as mudanças que ainda não foram publicadas.")) return;
    operationRef.current = true;
    setBusyAction(true);
    try {
      if (savePromiseRef.current) await savePromiseRef.current;
      const currentRevision = revisionRef.current;
      if (currentRevision === null) return;
      await runStudioAction(
        "discard",
        { revision: currentRevision },
        "As alterações não publicadas foram descartadas.",
      );
    } catch (error) {
      setSaveState("error");
      setStatus(error instanceof Error ? error.message : "Não foi possível descartar agora.");
    } finally {
      operationRef.current = false;
      setBusyAction(false);
    }
  }

  async function restoreVersion(versionId: string) {
    if (
      !window.confirm(
        "Restaurar esta versão e publicá-la novamente? As alterações ainda não publicadas serão substituídas.",
      )
    ) return;
    operationRef.current = true;
    setBusyAction(true);
    try {
      if (savePromiseRef.current) await savePromiseRef.current;
      const currentRevision = revisionRef.current;
      if (currentRevision === null) return;
      await runStudioAction(
        "restore",
        { revision: currentRevision, versionId },
        "A versão escolhida foi restaurada como uma nova publicação.",
      );
    } catch (error) {
      setSaveState("error");
      setStatus(error instanceof Error ? error.message : "Não foi possível restaurar agora.");
    } finally {
      operationRef.current = false;
      setBusyAction(false);
    }
  }

  async function loadLatestSavedVersion() {
    if (!window.confirm("Carregar a versão mais recente salva? Suas mudanças locais serão descartadas.")) return;
    try {
      await loadStudio();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível recarregar agora.");
    }
  }

  function restoreAppearance() {
    if (!config) return;
    if (!window.confirm("Restaurar somente o estilo original? Seus textos e a ordem da página serão mantidos.")) return;
    const next = structuredClone(config);
    next.identity = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG.identity);
    next.theme = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG.theme);
    commitConfig(siteConfigSchema.parse(next), "A aparência original está pronta para você conferir.");
  }

  function restoreOriginal() {
    if (!window.confirm("Voltar todo o Studio ao original? Textos, aparência e página ainda precisarão ser publicados.")) return;
    commitConfig(
      structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG),
      "O original completo está pronto para você conferir.",
    );
  }

  function reorderSections(ids: string[]) {
    if (!config) return;
    const currentIds = config.pages.home.sections.map((item) => item.id);
    if (ids.length !== currentIds.length || ids.some((id) => !currentIds.includes(id))) return;
    const next = structuredClone(config);
    const byId = new Map(next.pages.home.sections.map((item) => [item.id, item]));
    next.pages.home.sections = ids.map((id) => byId.get(id)).filter(Boolean) as typeof next.pages.home.sections;
    commitConfig(siteConfigSchema.parse(next), "A ordem da página foi atualizada.");
  }

  function editSection(id: string, edit: SectionEdit) {
    if (!config) return;
    const next = structuredClone(config);
    const index = next.pages.home.sections.findIndex((item) => item.id === id);
    const target = next.pages.home.sections[index];
    if (!target) return;
    const definition = SECTION_REGISTRY[target.type];
    if (isProtectedSection(target.type) && (edit.kind === "variant" || edit.kind === "enabled")) return;
    if (target.type === "hero" && ["surface", "density", "alignment"].includes(edit.kind)) return;

    if (edit.kind === "enabled") {
      if (definition.required && !edit.value) return;
      target.enabled = edit.value;
    } else if (edit.kind === "variant") {
      if (!(definition.allowedVariants as readonly string[]).includes(edit.value)) return;
      Reflect.set(target, "variant", edit.value);
    } else if (edit.kind === "surface") {
      if (!(definition.allowedSurfaces as readonly string[]).includes(edit.value)) return;
      if (edit.value === "photo" && !config.theme.background.imageId) return;
      target.appearance.surface = edit.value;
      target.appearance.backgroundImageId =
        edit.value === "photo" ? config.theme.background.imageId : null;
    } else if (edit.kind === "density") {
      target.appearance.density = edit.value;
    } else if (edit.kind === "alignment") {
      target.appearance.alignment = edit.value;
    } else if (edit.kind === "item-count" && target.type === "featured-work") {
      target.itemCount = edit.value;
    } else if (edit.kind === "reset") {
      const original = PUNCTUM_DEFAULT_SITE_CONFIG.pages.home.sections.find(
        (candidate) => candidate.type === target.type,
      );
      if (!original) return;
      next.pages.home.sections[index] = {
        ...structuredClone(original),
        id: target.id,
        enabled: target.enabled,
      } as typeof target;
    }

    commitConfig(siteConfigSchema.parse(next), "Esta parte da página foi atualizada.");
  }

  if (!config) {
    return (
      <div className="studio-loading" role="status">
        {status}
      </div>
    );
  }

  return (
    <div className="studio-shell">
      <div className="admin-topbar studio-topbar">
        <div>
          <p className="eyebrow">Seu espaço criativo</p>
          <h1>Studio</h1>
          <p>Troque as palavras e o clima do site sem medo de estragar.</p>
          <div className="studio-quick-links" aria-label="Atalhos de entrega e portfólio">
            <Link href="/admin/albuns-privados" className="button ghost small">
              Álbuns privados ↗
            </Link>
            <Link href="/admin/clientes" className="button ghost small">
              Clientes ↗
            </Link>
            <Link href="/admin/ensaios" className="button ghost small">
              Ensaios públicos ↗
            </Link>
          </div>
        </div>
        <div className="studio-top-actions">
          <div className="studio-undo-actions" role="group" aria-label="Desfazer e refazer">
            <button
              className="button ghost"
              type="button"
              onClick={undo}
              disabled={historyState.undo === 0 || busyAction}
              aria-label="Desfazer última mudança"
              title="Desfazer"
            >
              <Undo2 size={16} aria-hidden="true" /> Desfazer
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={redo}
              disabled={historyState.redo === 0 || busyAction}
              aria-label="Refazer última mudança"
              title="Refazer"
            >
              <Redo2 size={16} aria-hidden="true" /> Refazer
            </button>
          </div>
          <button
            className="button ghost studio-mobile-preview-button"
            type="button"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={16} aria-hidden="true" /> Ver como ficou
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={discardChanges}
            disabled={busyAction || (!changed && !hasUnpublishedChanges)}
          >
            Descartar alterações
          </button>
          <button
            className="button"
            type="button"
            onClick={publishChanges}
            disabled={busyAction || conflict || (!changed && !hasUnpublishedChanges)}
          >
            <Check size={16} aria-hidden="true" />
            {busyAction ? "Aguarde…" : "Publicar alterações"}
          </button>
        </div>
      </div>

      <div
        className={`studio-publish-status ${hasUnpublishedChanges || changed ? "unpublished" : "published"}`}
      >
        <strong>
          {hasUnpublishedChanges || changed
            ? "Você tem alterações não publicadas."
            : "Seu site está atualizado."}
        </strong>
        <span className={`studio-save-state ${saveState}`} role="status" aria-live="polite">
          {status || "Tudo salvo."}
        </span>
        {saveState === "error" && !conflict ? (
          <button
            className="studio-retry-save"
            type="button"
            onClick={() => void persistCurrentDraft().catch(() => undefined)}
          >
            Tentar salvar novamente
          </button>
        ) : null}
      </div>

      {conflict ? (
        <div className="studio-conflict" role="alert">
          <p>Este Studio também foi alterado em outra aba. Suas mudanças continuam aqui.</p>
          <button className="button ghost" type="button" onClick={loadLatestSavedVersion}>
            Carregar a versão mais recente
          </button>
        </div>
      ) : null}

      <div className="studio-workspace">
        <div
          className="studio-controls-column"
          aria-busy={busyAction}
          inert={busyAction ? true : undefined}
        >
          <nav className="studio-control-nav" aria-label="Partes do Studio">
            <button
              type="button"
              aria-current={section === "style" ? "page" : undefined}
              onClick={() => setSection("style")}
            >
              <Palette size={18} aria-hidden="true" /> Estilo
            </button>
            <button
              type="button"
              aria-current={section === "texts" ? "page" : undefined}
              onClick={() => setSection("texts")}
            >
              <FileText size={18} aria-hidden="true" /> Textos
            </button>
            <button
              type="button"
              aria-current={section === "page" ? "page" : undefined}
              onClick={() => setSection("page")}
            >
              <LayoutPanelTop size={18} aria-hidden="true" /> Página
            </button>
            <button
              type="button"
              aria-current={section === "photos" ? "page" : undefined}
              onClick={() => setSection("photos")}
            >
              <Images size={18} aria-hidden="true" /> Fotos
            </button>
          </nav>

      {section === "style" ? (
        <StudioStylePanel config={config} onChange={commitConfig} />
      ) : null}

      {section === "texts" ? (
        <section className="studio-panel studio-text-panel" aria-labelledby="studio-text-title">
          <div className="studio-panel-heading">
            <p className="eyebrow">Sua voz</p>
            <h2 id="studio-text-title">Textos do site</h2>
            <p>Abra somente a parte que deseja mudar. As mensagens de erro e segurança continuam protegidas.</p>
          </div>
          <div className="studio-copy-groups">
            {COPY_GROUPS.map((group, index) => (
              <details className="studio-copy-group" key={group.title} open={index === 0}>
                <summary>
                  <span>{group.title}</span>
                  <small>{group.description}</small>
                </summary>
                <div className="studio-copy-fields">
                  {group.fields.map((field) => (
                    <CopyInput
                      key={field.path.join(".")}
                      field={field}
                      value={readEditorialValue(config.editorial, field.path)}
                      onChange={(value) =>
                        commitConfig(
                          writeEditorialValue(config, field.path, value),
                          "Texto atualizado.",
                        )
                      }
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {section === "page" ? (
        <StudioPageComposer
          sections={config.pages.home.sections}
          globalPhotoId={config.theme.background.imageId}
          onReorder={reorderSections}
          onEdit={editSection}
        />
      ) : null}

      {section === "photos" ? (
        <StudioPhotosPanel
          config={config}
          photos={photos}
          loading={photosLoading}
          error={photosError}
          onLoad={loadPhotos}
          onChange={commitConfig}
        />
      ) : null}

          <section className="studio-safety-actions" aria-labelledby="studio-safety-title">
            <div>
              <h2 id="studio-safety-title">Quer recomeçar?</h2>
              <p>Restaure só o estilo ou todo o Studio. Nada vai ao ar sem sua confirmação.</p>
            </div>
            <div>
              <button className="button ghost" type="button" onClick={restoreAppearance}>
                <RotateCcw size={16} aria-hidden="true" /> Restaurar aparência original
              </button>
              <button className="button ghost" type="button" onClick={restoreOriginal}>
                Voltar tudo ao original
              </button>
            </div>
          </section>

          <section className="studio-history" aria-labelledby="studio-history-title">
            <div className="studio-history-heading">
              <div>
                <p className="eyebrow">Sua segurança</p>
                <h2 id="studio-history-title">Versões anteriores</h2>
              </div>
              <p>Restaurar cria uma nova publicação e preserva o histórico.</p>
            </div>
            <ol>
              {history.map((version) => {
                const publishedAt = new Date(version.publishedAt);
                return (
                  <li key={version.id}>
                    <div>
                      <strong>
                        {publishedAt.toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </strong>
                      <span>
                        {publishedAt.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {version.publishedBy ? ` · ${version.publishedBy}` : ""}
                      </span>
                    </div>
                    {version.isCurrent ? (
                      <span className="studio-current-version">No ar agora</span>
                    ) : (
                      <button
                        className="button ghost"
                        type="button"
                        disabled={busyAction}
                        onClick={() => restoreVersion(version.id)}
                      >
                        Restaurar esta versão
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside
          className={`studio-preview-column${previewOpen ? " open" : ""}`}
          aria-label="Prévia do site"
        >
          <div className="studio-preview-toolbar">
            <strong>Como está ficando</strong>
            <div role="group" aria-label="Tamanho da prévia">
              <button
                type="button"
                aria-pressed={previewDevice === "computer"}
                onClick={() => setPreviewDevice("computer")}
              >
                <Monitor size={17} aria-hidden="true" /> Computador
              </button>
              <button
                type="button"
                aria-pressed={previewDevice === "tablet"}
                onClick={() => setPreviewDevice("tablet")}
              >
                <Tablet size={17} aria-hidden="true" /> Tablet
              </button>
              <button
                type="button"
                aria-pressed={previewDevice === "phone"}
                onClick={() => setPreviewDevice("phone")}
              >
                <Smartphone size={17} aria-hidden="true" /> Celular
              </button>
            </div>
            <button
              className="studio-preview-close"
              type="button"
              onClick={() => setPreviewOpen(false)}
            >
              Voltar à edição
            </button>
          </div>
          <div className={`studio-preview-stage ${previewDevice}`}>
            <iframe
              key={previewRevision}
              src={`/admin/studio/preview?revision=${previewRevision}`}
              title="Prévia do site com as alterações ainda não publicadas"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
