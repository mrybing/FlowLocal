import { Flow } from './flow';
import { SellingPoint, GlobalContext, VisualParams, NarrativeConcept, GlobalAnalysis, MediaAsset } from '../types';
/**
 * Utility: Safe JSON Parsing with basic self-healing
 */
async function safeParseJSON<T>(text: string, context: string): Promise<T> {
  let cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const fixPrompt = `The following text was intended to be JSON but is invalid. Correct it to be a pure, valid JSON object. 
Context: ${context}
Text to fix:
${text}`;
    const { text: fixedText } = await Flow.generate.text(fixPrompt, { systemInstruction: "Output ONLY valid JSON." });
    try {
      return JSON.parse(fixedText.replace(/```json|```/g, '').trim());
    } catch (e2) {
      throw new Error(`Failed to parse ${context} after retry.`);
    }
  }
}
/**
 * Node One: Global Style Analysis
 * 
 * Unchanged — this node is already appropriate.
 * It extracts abstract style DNA from a reference image without over-asserting.
 */
export async function extractGlobalParams(image: { base64: string; mimeType: string }): Promise<GlobalAnalysis> {
  const systemInstruction = `You are a high-end fashion and product photography consultant.
Analyze this style reference image and extract ONLY these 5 dimensions. Keep each field to 10 English words or fewer.
Output ONLY valid JSON:
{
  "image_type": "Type of image: e.g. product photography, 3D render, white-background cutout, lifestyle photo",
  "style_feel": "Overall style: e.g. lifestyle casual, high-tech futuristic, cinematic commercial, editorial fashion",
  "color_tone": "Color tone: e.g. warm earth tones, cool desaturated blues, high-contrast monochrome",
  "lighting": "Lighting approach: e.g. soft wraparound rim light, dramatic side-lit chiaroscuro, flat high-key",
  "negative_space": "White/negative space usage: e.g. large left negative space, tight crop no breathing room, centered subject generous margins"
}`;
  const { text } = await Flow.generate.text("Extract the 5 core visual style dimensions from this reference.", {
    systemInstruction,
    images: [image]
  });
  return safeParseJSON<GlobalAnalysis>(text, "global style analysis");
}
/**
 * Node 二：Visual Extraction (视觉参数提取)
 * 
 * FIXES APPLIED:
 * 1. REMOVED globalContextNote injection — selling point reference analysis must be independent,
 *    not biased by the global style.
 * 2. REMOVED "CRITICAL RULE: Do NOT describe the specific person or product" — this was
 *    stripping the most valuable information from the selling point reference.
 * 3. ADDED new extraction fields: product_presentation, hero_element, mood_atmosphere,
 *    spatial_relationship — these capture the INTENT of the reference, not just technical params.
 * 4. Rewritten prompt to prioritize understanding HOW the selling point is visually communicated.
 */
export async function extractVisualParams(sp: SellingPoint, globalContext: GlobalContext): Promise<VisualParams> {
  if (!sp.referenceImage) throw new Error('Missing reference image');
  const productIdentity = globalContext.product_info
    ? `\nCRITICAL — THE PRODUCT BEING ADVERTISED IS: ${globalContext.product_info}\nWhen analyzing "product presentation" and "hero element", focus on THIS product specifically.\nOther items in the image (clothing, accessories worn by models, furniture, etc.) are NOT the product — they are props or styling.\n`
    : '';
  const systemInstruction = `You are a professional commercial photography analyst.
Analyze this reference image to understand the VISUAL STRATEGY for communicating a selling point.
${productIdentity}
ANALYSIS PRIORITIES (in order):
1. PRODUCT PRESENTATION — How is the advertised product${globalContext.product_info ? ` (${globalContext.product_info})` : ''} showcased? Describe the presentation strategy.
2. HERO ELEMENT — What is the single most dominant visual element?
3. MOOD & ATMOSPHERE — What emotion does this image convey? (keep concise, 2-3 emotion words)
4. SPATIAL RELATIONSHIP — How are elements arranged? Foreground/background/layering. Include model positions if models are present.
5. TECHNICAL EXECUTION — Lighting, camera angle, lens, composition.
You MAY and SHOULD describe the product and how it appears in the image.
Do NOT describe specific human faces in detail (but body position, gesture, and styling are fine).
WORD LIMITS — follow strictly:
- subject: ≤20 words
- product_presentation: ≤30 words
- hero_element: ≤15 words
- mood_atmosphere: ≤8 words (concise emotion descriptors only)
- spatial_relationship: ≤30 words (include model positions and depth layers)
- environment: ≤25 words (setting/background only, no product or model info)
- lighting: ≤12 words
- composition: ≤15 words
- camera_angle: ≤6 words
- shot_scale: ≤6 words
- visual_signature_prompt: ≤25 words (concise visual+mood essence — lighting, composition, camera, and 1-2 emotion words)
- color_palette: ≤12 words
- material_focus: ≤12 words
IMAGE TYPE CLASSIFICATION (decide this first, using the reference image AND the selling point text):
- CGI_Abstract: 3D render / abstract / surreal / product-only CGI visuals. Usually NO human model.
- Studio_Minimal: clean studio product shot, product-only. Usually NO human model.
- Lifestyle_Commercial: real-life scene photography where people wear/use the product.
- requires_model = true ONLY if the finished advertising image should contain a human (the selling point needs a person wearing/using/interacting with the product). Product-only, CGI, macro, or exploded/feature-diagram visuals => false.
Output ONLY valid JSON with these fields:
{
  "subject": "main subject and visual treatment",
  "product_presentation": "how the advertised product is staged, positioned, emphasized",
  "hero_element": "the single most dominant visual element",
  "mood_atmosphere": "2-3 concise emotion descriptors",
  "spatial_relationship": "arrangement of elements including model positions and depth",
  "lighting": "lighting setup and quality",
  "environment": "setting/background description only",
  "composition": "composition framework and visual flow",
  "camera_angle": "camera angle",
  "shot_scale": "shot scale",
  "image_type": "one of: CGI_Abstract, Studio_Minimal, Lifestyle_Commercial, Unknown",
  "requires_model": true or false (boolean, see classification rules),
  "visual_signature_prompt": "concise visual+mood essence for this image approach",
  "color_palette": "dominant and accent colors",
  "material_focus": "key material/texture qualities"
}`;
  const { text } = await Flow.generate.text(
    `Analyze the visual strategy in this reference image for selling point: "${sp.name}" — "${sp.description}".${globalContext.product_info ? ` The product being advertised is: ${globalContext.product_info}.` : ''}`,
    {
      systemInstruction,
      images: [{ base64: sp.referenceImage.base64, mimeType: sp.referenceImage.mimeType }]
    }
  );
  return safeParseJSON<VisualParams>(text, "visual extraction");
}
// --- Narrative Helpers ---
/**
 * Whether this selling point's image should use human models.
 * Priority: user override (modelMode) > LLM classification (requires_model) > default true.
 * Always false when no model/outfit image has been uploaded.
 */
export function spUsesModels(sp: SellingPoint, globalContext: GlobalContext): boolean {
  const hasModels = globalContext.modelReferences.some(m => m.model || m.suit);
  if (!hasModels) return false;
  if (sp.modelMode === 'with_model') return true;
  if (sp.modelMode === 'no_model') return false;
  const v = sp.enrichment.visual_params;
  if (!v) return true;
  if (typeof v.requires_model === 'boolean') return v.requires_model;
  return v.image_type === 'Lifestyle_Commercial' || v.image_type === 'Unknown';
}
/**
 * SINGLE SOURCE OF TRUTH for the image-generation reference list.
 * Nano Banana maps input order -> "image 1, image 2...", so numbering is contiguous over
 * ONLY the images actually uploaded (empty slots are skipped, no gaps).
 * The selling-point reference image is NOT included (analysis only).
 * Order: product -> models/outfits -> environment (product first so it is never truncated).
 */
export interface GenRef {
  index: number;        // 1-based, = "image N" in the prompt
  token: string;        // e.g. {{PRODUCT}}
  noun: string;         // phrase used inside prompt text
  caption: string;      // phrase used in the reference header
  asset: MediaAsset;
}
/**
 * Resolve the effective environment image for a selling point.
 * envMode: 'global' (default) -> campaign env image; 'custom' -> this SP's own image; 'none' -> no env image.
 */
export function withSpEnv(sp: SellingPoint, globalContext: GlobalContext): GlobalContext {
  const mode = sp.envMode || 'global';
  if (mode === 'global') return globalContext;
  return { ...globalContext, environmentImage: mode === 'custom' ? sp.environmentImage : undefined };
}
export function buildGenerationRefs(sp: SellingPoint, globalContext: GlobalContext): GenRef[] {
  globalContext = withSpEnv(sp, globalContext);
  const refs: GenRef[] = [];
  const push = (token: string, noun: string, caption: string, asset?: MediaAsset) => {
    if (asset) refs.push({ index: refs.length + 1, token, noun, caption, asset });
  };
  push('{{PRODUCT}}', 'the product', 'the advertised product (keep exact shape, logo, proportions)', globalContext.productImage);
  if (spUsesModels(sp, globalContext)) {
    globalContext.modelReferences.forEach((m, i) => {
      const L = String.fromCharCode(65 + i);
      push(`{{MODEL_${L}}}`, 'the person', `Model ${L} face and body (keep identity)`, m.model);
      push(`{{OUTFIT_${L}}}`, `the outfit`, `Model ${L} outfit (clothing, not the product)`, m.suit);
    });
  }
  push('{{ENV}}', 'the environment', 'environment/scene reference', globalContext.environmentImage);
  return refs.slice(0, 14);
}
/** Replace asset tokens with "… from image N" and prepend a reference header. */
function resolveTokensToImageRefs(text: string, refs: GenRef[]): string {
  let out = text;
  refs.forEach(r => { out = out.split(r.token).join(`${r.noun} from image ${r.index}`); });
  out = out.replace(/\{\{[A-Z0-9_]+\}\}/g, '').replace(/[ \t]{2,}/g, ' ');
  if (refs.length === 0) return out;
  const header = 'Reference images: ' + refs.map(r => `image ${r.index} = ${r.caption}`).join('; ') + '.';
  return `${header}\n\n${out}`;
}
function buildInventory(sp: SellingPoint, globalContext: GlobalContext): string[] {
  return buildGenerationRefs(sp, globalContext).map(r => r.token);
}
function extractTokens(n: NarrativeConcept): string[] {
  const text = [n.scene_setting, n.subject_setup, n.props, n.model_choreography || ''].join(' ');
  const matches = text.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  return Array.from(new Set(matches));
}
function validateTokens(used: string[], inventory: string[]) {
  const invalid = used.filter(t => !inventory.includes(t));
  const missingRequired = (inventory.includes('{{PRODUCT}}') && !used.includes('{{PRODUCT}}'))
    ? ['{{PRODUCT}}'] : [];
  return { invalid, missingRequired };
}
function stripInvalidTokens(text: string, invalid: string[]): string {
  let out = text;
  invalid.forEach(tag => { out = out.split(tag).join(''); });
  return out.replace(/\s{2,}/g, ' ').trim();
}
/**
 * Build a description of model references for the LLM to understand.
 * This tells the LLM what each model image looks like.
 */
function buildModelImageDescriptions(globalContext: GlobalContext): string {
  const modelRefs = globalContext.modelReferences.filter(m => m.model || m.suit);
  if (modelRefs.length === 0) return '';
  const lines = modelRefs.map((m, i) => {
    const letter = String.fromCharCode(65 + i);
    const parts: string[] = [];
    if (m.model) parts.push(`{{MODEL_${letter}}}: See attached image (model face/body reference — MUST maintain this person's appearance)`);
    if (m.suit) parts.push(`{{OUTFIT_${letter}}}: See attached image (outfit/styling reference — MUST maintain this clothing's appearance)`);
    return parts.join('\n');
  });
  return lines.join('\n');
}
/**
 * Collect all images that should be passed to generateNarrative for the LLM to see.
 * This includes: product image, selling point reference, model images, outfit images.
 * The LLM needs to SEE these to direct the scene properly.
 */
function collectNarrativeImages(sp: SellingPoint, globalContext: GlobalContext): Array<{ base64: string; mimeType: string }> {
  globalContext = withSpEnv(sp, globalContext);
  const useModels = spUsesModels(sp, globalContext);
  const images: Array<{ base64: string; mimeType: string }> = [];
  // 1. Product image — if available
  if (globalContext.productImage) {
    images.push({ base64: globalContext.productImage.base64, mimeType: globalContext.productImage.mimeType });
  }
  // 2. Environment reference — placed BEFORE selling point ref for higher priority
  if (globalContext.environmentImage) {
    images.push({ base64: globalContext.environmentImage.base64, mimeType: globalContext.environmentImage.mimeType });
  }
  // 3. Selling point reference — LLM should SEE this for visual approach
  if (sp.referenceImage) {
    images.push({ base64: sp.referenceImage.base64, mimeType: sp.referenceImage.mimeType });
  }
  // 4. Model reference images (only when this selling point uses models)
  if (useModels) globalContext.modelReferences.forEach(m => {
    if (m.model) images.push({ base64: m.model.base64, mimeType: m.model.mimeType });
    if (m.suit) images.push({ base64: m.suit.base64, mimeType: m.suit.mimeType });
  });
  return images;
}
/**
 * Build an image legend for the LLM, describing what each attached image represents.
 */
function buildImageLegend(sp: SellingPoint, globalContext: GlobalContext): string {
  globalContext = withSpEnv(sp, globalContext);
  const useModels = spUsesModels(sp, globalContext);
  const legend: string[] = [];
  let idx = 1;
  if (globalContext.productImage) {
    const productName = globalContext.product_info ? ` (${globalContext.product_info})` : '';
    legend.push(`Image ${idx}: {{PRODUCT}}${productName} — THE PRODUCT BEING ADVERTISED. Must be the visual hero.`);
    idx++;
  }
  // Environment reference comes before SP reference — higher priority for scene/setting
  if (globalContext.environmentImage) {
    legend.push(`Image ${idx}: {{ENV}} — ENVIRONMENT/SCENE REFERENCE [HIGH PRIORITY]. Use this as the PRIMARY source for all environment and setting descriptions. This OVERRIDES any environment details from the selling point reference.`);
    idx++;
  }
  if (sp.referenceImage) {
    const envOverrideNote = globalContext.environmentImage
      ? ' NOTE: An environment reference image has been provided separately — use THAT for environment/setting. From this image, extract ONLY composition strategy, product staging, and mood — IGNORE its background/environment.'
      : '';
    legend.push(`Image ${idx}: SELLING POINT REFERENCE — Shows the desired VISUAL APPROACH for composition and product presentation.${envOverrideNote}`);
    idx++;
  }
  if (useModels) globalContext.modelReferences.forEach((m, i) => {
    const letter = String.fromCharCode(65 + i);
    if (m.model) {
      legend.push(`Image ${idx}: {{MODEL_${letter}}} — Character reference. Maintain this person's appearance exactly.`);
      idx++;
    }
    if (m.suit) {
      legend.push(`Image ${idx}: {{OUTFIT_${letter}}} — WARDROBE for Model ${letter}. NOT the advertised product.`);
      idx++;
    }
  });
  return legend.join('\n');
}
/**
 * Node 三：Asset-Aware Narrative Concept Node (叙事构思)
 * 
 * v2 改造:
 * - 模特姿态强化：要求具体的肢体、表情、视线、互动描述
 * - subject_setup 覆盖模特姿态 + 空间关系 + 产品交互
 * - scene_setting 纯环境/背景
 * - 场景参考图覆盖：environmentImage 存在时覆盖卖点参考图的环境描述
 * - visual_params 作为参考输入，narrative 输出优先级更高
 */
export async function generateNarrative(
  sp: SellingPoint, 
  globalContext: GlobalContext,
  allSPs: SellingPoint[] = [],
  maxRetries = 2
): Promise<NarrativeConcept> {
  const visual = sp.enrichment.visual_params!;
  const aspectRatio = parseAspectRatio(globalContext.output_spec);
  const inventory = buildInventory(sp, globalContext);
  const images = collectNarrativeImages(sp, globalContext);
  const imageLegend = buildImageLegend(sp, globalContext);
  
  const useModels = spUsesModels(sp, globalContext);
  const modelCount = useModels ? globalContext.modelReferences.filter(m => m.model).length : 0;
  const noModelSection = !useModels ? `
NO HUMAN MODEL: This selling point's image type (${visual.image_type}) is product-focused. Do NOT include any person, hands, or body parts. Focus entirely on the product and its staging.
` : '';
  const hasEnvImage = !!withSpEnv(sp, globalContext).environmentImage;
  
  const otherSPContext = allSPs
    .filter(s => s.sp_id !== sp.sp_id && s.enrichment.narrative_concept)
    .map(s => `- "${s.name}": ${s.enrichment.narrative_concept!.scene_setting}`)
    .join('\n');
  const buildSystemInstruction = (correction?: string) => {
    // --- Scene override instruction when environment reference image is provided ---
    const envOverrideSection = hasEnvImage ? `
═══════════════════════════════════════════
ENVIRONMENT OVERRIDE [CRITICAL]:
A dedicated ENVIRONMENT REFERENCE IMAGE ({{ENV}}) has been provided.
Use {{ENV}} as the PRIMARY and ONLY source for all environment/setting/background descriptions in scene_setting.
IGNORE any environment or background details from the selling point reference image.
The selling point reference image should ONLY inform: composition strategy, product staging approach, and mood.
═══════════════════════════════════════════
` : '';
    // --- Model direction section with concrete pose examples ---
    const modelDirectionSection = modelCount > 1 ? `
MODEL DIRECTION [CRITICAL — this drives image quality]:
You have ${modelCount} models. For EACH model, you MUST describe in subject_setup:
1. BODY POSE: Weight distribution, limb positions, torso angle (e.g. "leaning forward, weight on front foot, left hand reaching up to adjust earbuds")
2. GAZE & EXPRESSION: Where they look, facial expression (e.g. "looking down at phone with relaxed half-smile" or "eyes closed, chin slightly lifted, serene expression")
3. PRODUCT INTERACTION: How they physically relate to the product (e.g. "right hand gently touching the earbud on left ear")
4. SPATIAL POSITION: Where in the frame, distance from camera, relationship to other models (e.g. "foreground left third, 2m from camera, facing toward MODEL_B in center")
Example of GOOD model direction:
"{{MODEL_A}} stands in the left third of the frame, weight shifted to her right hip, left hand casually holding a coffee cup at waist level, head tilted slightly right with a warm, candid smile, the {{PRODUCT}} visible on her right ear catching the rim light. {{MODEL_B}} sits on the concrete ledge in the right third, one knee drawn up, scrolling through phone with earbuds in, relaxed posture, looking down at screen with a focused but calm expression."
Example of BAD model direction (too vague):
"{{MODEL_A}} is on the left side looking stylish. {{MODEL_B}} is on the right using the product."
Each model MUST serve a distinct narrative role. The PRIMARY model interacts with the product.
Output a "model_choreography" field with the full multi-model staging plan.
` : modelCount === 1 ? `
MODEL DIRECTION [CRITICAL — this drives image quality]:
For the model, you MUST describe in subject_setup:
1. BODY POSE: Weight distribution, limb positions, torso angle (be specific — not just "standing" or "walking")
2. GAZE & EXPRESSION: Where they look, what expression (be specific — not just "happy" or "focused")
3. PRODUCT INTERACTION: How they physically relate to the product (e.g. "right hand lightly touching earbud, fingers curved around ear")
4. SPATIAL POSITION: Where in the frame relative to camera and environment
Example of GOOD: "{{MODEL_A}} mid-stride on a rain-slicked sidewalk, weight on left foot pushing off, right arm swinging naturally, head turned slightly right with a determined grin, the {{PRODUCT}} snug on both ears with the matte casing catching street-lamp glow."
Example of BAD: "{{MODEL_A}} is walking and wearing the product, looking confident."
` : '';
    const crossSPSection = otherSPContext ? `
OTHER SCENES IN THIS CAMPAIGN (for visual consistency reference):
${otherSPContext}
Maintain visual consistency while keeping this selling point's focus distinct.
` : '';
    return `You are a Creative Director designing a scene for premium product photography.
Study the attached reference images carefully before writing.
ATTACHED IMAGES:
${imageLegend}
${envOverrideSection}
PRODUCT IDENTITY:
${globalContext.product_info || 'See {{PRODUCT}} image'}
This is the ONLY product being promoted. All other items are props/styling.
PRIMARY DIRECTIVE — SELLING POINT:
Name: "${sp.name}"
Description: "${sp.description}"
VISUAL APPROACH REFERENCE (from selling point analysis — use as guidance, your narrative takes priority):
- Product Presentation: ${visual.product_presentation}
- Hero Element: ${visual.hero_element}
- Mood: ${visual.mood_atmosphere}
- Spatial Arrangement: ${visual.spatial_relationship}
- Subject: ${visual.subject}
- Lighting: ${visual.lighting}
- Environment: ${visual.environment}${hasEnvImage ? ' [OVERRIDDEN by {{ENV}} image — ignore this]' : ''}
- Composition: ${visual.composition}
- Camera: ${visual.camera_angle}, ${visual.shot_scale}
${visual.color_palette ? `- Color Palette: ${visual.color_palette}` : ''}
${visual.material_focus ? `- Material Focus: ${visual.material_focus}` : ''}
Target Aspect Ratio: ${aspectRatio}
Image Mode: ${visual.image_type}${visual.image_type === 'CGI_Abstract' ? ' — use abstract/surreal staging' : ''}
AVAILABLE VISUAL ASSETS (Use ONLY these exact tokens):
${inventory.join(', ')}
TOKEN SEMANTICS:
- {{PRODUCT}} = the advertised product${globalContext.product_info ? ` (${globalContext.product_info})` : ''}.
- {{MODEL_X}} = a human model (character consistency).
- {{OUTFIT_X}} = the model's WARDROBE (NOT the advertised product).
- {{ENV}} = environment/location reference.
${modelDirectionSection}${noModelSection}
BRAND CONTEXT (reference only):
Tone: ${globalContext.brand_tone || 'Premium'}
${crossSPSection}
RULES:
1. Only use tags from AVAILABLE VISUAL ASSETS. Copy tags EXACTLY.
2. {{PRODUCT}} MUST appear prominently in subject_setup. Product is ${globalContext.product_info || '{{PRODUCT}}'}, NOT model clothing.
3. Do not alter product shape, logo, or proportions.
4. For ${aspectRatio}: ${aspectRatio === '16:9' ? 'use horizontal sweep and background depth' : aspectRatio === '9:16' ? 'use vertical focus and headroom' : 'balanced framing'}.
5. Scene MUST serve the selling point "${sp.name}".
6. scene_setting = ONLY environment/background/setting description. NO product or model info here.
7. subject_setup = product placement + model poses (with specific body/gaze/expression/interaction details) + spatial relationships between elements.
8. {{OUTFIT_X}} is clothing, NOT the product.${hasEnvImage ? '\n9. Use {{ENV}} image for ALL environment descriptions. IGNORE environment from selling point reference.' : ''}
${correction ? `\nCORRECTION NEEDED: ${correction}\nRewrite strictly following rule 1.` : ''}
Output ONLY valid JSON:
- scene_setting (string): Environment and background ONLY (≤80 words). ${hasEnvImage ? 'Must be based on the {{ENV}} reference image.' : ''}
- subject_setup (string): Product placement + each model's detailed pose/gaze/expression/interaction + spatial relationships (≤150 words). This is the MOST IMPORTANT field.
- props (string): Supporting elements, brief (≤30 words)
- emotion_keywords (string[]): 3 concise emotion words${modelCount > 1 ? '\n- model_choreography (string): Full multi-model staging plan with each model\'s exact position, pose, gaze, expression, and product interaction' : ''}`;
  };
  
  const prompt = `Design a scene that powerfully communicates this selling point: "${sp.name}" — ${sp.description}`;
  
  let correction: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { text } = await Flow.generate.text(prompt, { 
      systemInstruction: buildSystemInstruction(correction),
      images: images.length > 0 ? images : undefined
    });
    const narrative = await safeParseJSON<NarrativeConcept>(text, "narrative concept");
    const used = extractTokens(narrative);
    const { invalid, missingRequired } = validateTokens(used, inventory);
    if (invalid.length === 0 && missingRequired.length === 0) {
      return narrative;
    }
    if (attempt === maxRetries) {
      narrative.subject_setup = stripInvalidTokens(narrative.subject_setup, invalid);
      narrative.scene_setting = stripInvalidTokens(narrative.scene_setting, invalid);
      narrative.props = stripInvalidTokens(narrative.props, invalid);
      if (narrative.model_choreography) {
        narrative.model_choreography = stripInvalidTokens(narrative.model_choreography, invalid);
      }
      narrative._autoCorrected = invalid.length > 0;
      return narrative;
    }
    correction = [
      invalid.length ? `You used undeclared tags: ${invalid.join(', ')}.` : '',
      missingRequired.length ? `You forgot required tag(s): ${missingRequired.join(', ')}.` : ''
    ].filter(Boolean).join(' ');
  }
  throw new Error('Unreachable: Narrative loop failed');
}
/**
 * Node 四：Prompt Assembly Compiler
 * 
 * v2 重写 — 新 4-block 结构:
 * [PRODUCT]            ≤200 chars  — 产品身份 + 卖点
 * [MODEL & COMPOSITION] ≤1200 chars — 模特姿态 + 构图 + 空间关系（核心块）
 * [SCENE]              ≤800 chars  — 环境 + 道具 + 氛围
 * [STYLE]              ≤400 chars  — 类型|风格|色调|光影|留白（一行化）
 * 
 * 去重策略：每个信息只在一个 block 出现
 * - visual_params.product_presentation → [PRODUCT]
 * - visual_params.composition/camera/shot/spatial → [MODEL & COMPOSITION]
 * - visual_params.environment → 不出现（被 narrative.scene_setting 覆盖）
 * - narrative.scene_setting → [SCENE]
 * - narrative.subject_setup + model_choreography → [MODEL & COMPOSITION]
 * - global_analysis 5维度 → [STYLE]
 * 
 * 3600 字符硬守卫：超限时从 [STYLE] → [SCENE].props 逐步削减
 */
const MAX_PROMPT_LENGTH = 3600;
/**
 * Truncate prompt to fit within MAX_PROMPT_LENGTH.
 * Strategy: progressively trim lower-priority content.
 */
function truncateToLimit(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_LENGTH) return prompt;
  
  // Strategy 1: Remove [STYLE] block content (keep header)
  let result = prompt.replace(
    /\[STYLE\]\n.+/s,
    '[STYLE]\n(trimmed for length)'
  );
  if (result.length <= MAX_PROMPT_LENGTH) return result;
  
  // Strategy 2: Remove Props line from [SCENE]
  result = result.replace(/\nProps: .+\./m, '');
  if (result.length <= MAX_PROMPT_LENGTH) return result;
  
  // Strategy 3: Hard truncate from the end, preserving [PRODUCT] and [MODEL & COMPOSITION]
  return result.substring(0, MAX_PROMPT_LENGTH - 3) + '...';
}
export function compilePrompt(sp: SellingPoint, globalContext: GlobalContext): string {
  const v = sp.enrichment.visual_params!;
  const n = sp.enrichment.narrative_concept!;
  const g = globalContext.global_analysis;
  
  // --- BLOCK 1: PRODUCT (concise identity + selling point) ---
  const productBlock = `[PRODUCT]
${globalContext.product_info || 'Product'}, Selling point: "${sp.name}"
${sp.description}
Product presentation: ${v.product_presentation}`;
  // --- BLOCK 2: MODEL & COMPOSITION (the core block — detailed poses + spatial) ---
  const modelParts: string[] = [];
  
  // Subject setup from narrative (contains model poses + product interaction + spatial relationships)
  modelParts.push(n.subject_setup);
  
  // Model choreography for multi-model (detailed per-model staging)
  if (n.model_choreography) {
    modelParts.push(n.model_choreography);
  }
  
  // Composition + camera (from visual_params — only appears here, not in other blocks)
  const compositionLine = [
    v.composition,
    `${v.camera_angle}`,
    `${v.shot_scale}`
  ].filter(Boolean).join(', ');
  modelParts.push(`Composition: ${compositionLine}.`);
  
  // Hero element — the visual focal point
  modelParts.push(`Hero element: ${v.hero_element}.`);
  
  // Mood from visual_params (concise emotion words — only here, not in [SCENE])
  modelParts.push(`Mood: ${v.mood_atmosphere}.`);
  const modelBlock = `[${spUsesModels(sp, globalContext) ? 'MODEL & COMPOSITION' : 'SUBJECT & COMPOSITION'}]\n${modelParts.join('\n')}`;
  // --- BLOCK 3: SCENE (environment + props + emotion keywords — no model/product info) ---
  const sceneParts: string[] = [];
  sceneParts.push(n.scene_setting);
  if (n.props && n.props.trim()) {
    sceneParts.push(`Props: ${n.props}.`);
  }
  sceneParts.push(`Emotion: ${n.emotion_keywords.slice(0, 3).join(', ')}.`);
  // Material focus from visual_params — placed in scene context
  if (v.material_focus) {
    sceneParts.push(`Material: ${v.material_focus}.`);
  }
  const sceneBlock = `[SCENE]\n${sceneParts.join('\n')}`;
  // --- BLOCK 4: STYLE (5 dimensions — one-line-ish, from global_analysis) ---
  // Style block only contains: type, feel, color tone, lighting, negative space
  // Falls back to visual_params if no global style image was provided
  const styleDimensions: string[] = [];
  if (g) {
    styleDimensions.push(`Type: ${g.image_type}`);
    styleDimensions.push(`Style: ${g.style_feel}`);
    styleDimensions.push(`Tone: ${g.color_tone}`);
    styleDimensions.push(`Light: ${g.lighting}`);
    styleDimensions.push(`Space: ${g.negative_space}`);
  } else {
    // Fallback: derive from visual_params + image_type
    let typeLabel = "Commercial photography";
    if (v.image_type === 'CGI_Abstract') typeLabel = "3D render, CGI";
    else if (v.image_type === 'Studio_Minimal') typeLabel = "Studio product photography";
    else if (v.image_type === 'Lifestyle_Commercial') typeLabel = "Lifestyle commercial photography";
    styleDimensions.push(`Type: ${typeLabel}`);
    styleDimensions.push(`Light: ${v.lighting}`);
    if (v.color_palette) styleDimensions.push(`Tone: ${v.color_palette}`);
  }
  // Brand tone as a compact addition
  if (globalContext.brand_tone) {
    styleDimensions.push(`Brand: ${globalContext.brand_tone}`);
  }
  const styleBlock = `[STYLE]\n${styleDimensions.join(' | ')}`;
  // --- ASSEMBLE: Product → Model & Composition → Scene → Style → Aspect ---
  const aspectNote = `Aspect ratio ${parseAspectRatio(globalContext.output_spec)}.`;
  const blocks = [productBlock, modelBlock, sceneBlock, styleBlock, aspectNote]
    .filter(b => b.length > 0);
  const raw = blocks.join('\n\n');
  
  // Resolve {{TOKENS}} -> "image N" using the SAME ordered list used for generation
  const refs = buildGenerationRefs(sp, globalContext);
  return truncateToLimit(resolveTokensToImageRefs(raw, refs));
}
export function parseAspectRatio(spec: string): '1:1' | '16:9' | '9:16' | '4:3' | '3:4' {
  const ratios: (['1:1', '16:9', '9:16', '4:3', '3:4']) = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  for (const r of ratios) {
    if (spec.includes(r)) return r as any;
  }
  return '16:9';
}
