/**
 * Local replacement for the Flow SDK.
 * Same call shape as before (Flow.generate.text / generate.image / media.select / download),
 * but backed by the Gemini API called directly from the browser.
 */
import { GoogleGenAI } from '@google/genai';
import type { MediaAsset } from '../types';

// ---------- Settings (stored in localStorage) ----------
export const TEXT_MODELS: Record<string, string> = {
  'Gemini 3.8 Flash (推荐)': 'gemini-3.8-flash',
  'Gemini 2.5 Flash': 'gemini-2.5-flash',
  'Gemini 2.0 Flash': 'gemini-2.0-flash',
  'Gemini 1.5 Pro': 'gemini-1.5-pro',
};
export const TEXT_MODEL = 'gemini-3.8-flash';

export const IMAGE_MODELS: Record<string, string> = {
  'Nano Banana 2': 'gemini-3.1-flash-image-preview',
  'Nano Banana Pro': 'gemini-3-pro-image-preview',
};
const KEY_STORAGE = 'flowlocal.apiKey';
const TEXT_MODEL_STORAGE = 'flowlocal.textModel';
const IMAGE_MODEL_STORAGE = 'flowlocal.imageModel';

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) || '';
}
export function setApiKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}
export function getTextModelName(): string {
  const saved = localStorage.getItem(TEXT_MODEL_STORAGE);
  return saved || 'Gemini 3.8 Flash (推荐)';
}
export function setTextModelName(name: string) {
  localStorage.setItem(TEXT_MODEL_STORAGE, name);
}
export function getImageModelName(): string {
  const saved = localStorage.getItem(IMAGE_MODEL_STORAGE);
  return saved || 'Nano Banana 2';
}
export function setImageModelName(name: string) {
  localStorage.setItem(IMAGE_MODEL_STORAGE, name);
}

function client() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('请先在左侧 Settings 中填写 Gemini API Key');
  return new GoogleGenAI({ apiKey });
}

/**
 * 自动从 Google API 拉取当前 API Key 可用的所有模型
 */
export async function fetchAvailableModels(): Promise<{
  textModels: Record<string, string>;
  imageModels: Record<string, string>;
}> {
  const apiKey = getApiKey();
  if (!apiKey) return { textModels: { ...TEXT_MODELS }, imageModels: { ...IMAGE_MODELS } };

  try {
    const pager = await client().models.list();
    const dynamicText: Record<string, string> = {};
    const dynamicImage: Record<string, string> = { ...IMAGE_MODELS };

    for await (const m of pager) {
      const item = m as any;
      const id = item.name?.replace(/^models\//, '') || '';
      if (!id) continue;
      const methods: string[] = item.supportedGenerationMethods || [];
      if (methods.length > 0 && !methods.includes('generateContent')) continue;

      const label = item.displayName ? `${item.displayName} (${id})` : id;

      if (id.includes('image')) {
        dynamicImage[label] = id;
      } else if (!id.includes('embedding') && !id.includes('aqa') && !id.includes('imagen')) {
        dynamicText[label] = id;
      }
    }

    // 确保默认推荐置顶
    const mergedText: Record<string, string> = {
      'Gemini 3.8 Flash (推荐)': 'gemini-3.8-flash',
      ...dynamicText,
      ...TEXT_MODELS,
    };

    return {
      textModels: mergedText,
      imageModels: dynamicImage,
    };
  } catch (err) {
    console.warn('自动拉取可用模型失败，使用预设模型列表:', err);
    return { textModels: { ...TEXT_MODELS }, imageModels: { ...IMAGE_MODELS } };
  }
}

type Img = { base64: string; mimeType: string };

function toParts(text: string, images: Img[] = []) {
  return [
    { text },
    ...images.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } })),
  ];
}

// ---------- Flow-compatible API ----------
export const Flow = {
  generate: {
    async text(
      prompt: string,
      options: { systemInstruction?: string; images?: Img[] } = {}
    ): Promise<{ text: string }> {
      const selected = getTextModelName();
      const modelId = TEXT_MODELS[selected] || selected || TEXT_MODEL;
      const res = await client().models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: toParts(prompt, options.images) }],
        config: { systemInstruction: options.systemInstruction },
      });
      return { text: res.text || '' };
    },

    /**
     * Reference images are passed in order: the Nth input image == "image N" in the prompt.
     * Prompt text goes LAST-after-images is also fine, but we put images first so
     * the numbering is unambiguous.
     */
    async image(opts: {
      prompt: string;
      aspectRatio: string;
      referenceImages?: Img[];
    }): Promise<MediaAsset> {
      const selected = getImageModelName();
      const modelId = IMAGE_MODELS[selected] || selected || 'gemini-3.1-flash-image-preview';
      const parts = [
        ...(opts.referenceImages || []).map(i => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } })),
        { text: opts.prompt },
      ];
      const res = await client().models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: opts.aspectRatio },
        },
      });
      const outParts = res.candidates?.[0]?.content?.parts || [];
      const imgPart = outParts.find(p => p.inlineData?.data);
      if (!imgPart?.inlineData?.data) {
        const textOut = outParts.map(p => p.text).filter(Boolean).join(' ');
        throw new Error(`模型没有返回图片。${textOut ? '模型回复：' + textOut : ''}`);
      }
      return {
        mediaId: crypto.randomUUID(),
        base64: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType || 'image/png',
      };
    },
  },

  media: {
    /** Browser file picker -> base64 MediaAsset. Returns null if cancelled. */
    select(_opts?: { filter?: 'image' }): Promise<MediaAsset | null> {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result);
            const base64 = dataUrl.split(',')[1] || '';
            resolve({ mediaId: crypto.randomUUID(), base64, mimeType: file.type || 'image/png', name: file.name });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };
        input.oncancel = () => resolve(null);
        input.click();
      });
    },
  },

  async download(opts: { base64: string; mimeType: string; filename: string }) {
    const a = document.createElement('a');
    a.href = `data:${opts.mimeType};base64,${opts.base64}`;
    a.download = opts.filename;
    a.click();
  },
};
