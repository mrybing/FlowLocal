export type ImageType = 'CGI_Abstract' | 'Studio_Minimal' | 'Lifestyle_Commercial' | 'Unknown';
export interface VisualParams {
  subject: string;
  lighting: string;
  environment: string;
  composition: string;
  camera_angle: string;
  shot_scale: string;
  image_type: ImageType;
  requires_model: boolean;        // Whether this selling point's image should feature human models
  visual_signature_prompt: string;
  color_palette?: string;
  material_focus?: string;
  // --- New: fields to better capture selling point visual intent ---
  product_presentation: string;   // How the product is showcased/positioned/emphasized
  hero_element: string;           // The visual focal point of the image
  mood_atmosphere: string;        // Emotional tone and atmosphere
  spatial_relationship: string;   // Spatial arrangement between elements
}
export interface GlobalAnalysis {
  image_type: string;     // 类型: 渲染图 / 摄影图 / 白底图 etc.
  style_feel: string;     // 风格: 生活照 / 科技感 / 商业大片 etc.
  color_tone: string;     // 色调
  lighting: string;       // 光影
  negative_space: string; // 留白空间
}
export interface NarrativeConcept {
  scene_setting: string;
  subject_setup: string;
  props: string;
  // copywriting removed — pure image generation, no text overlay
  emotion_keywords: string[];
  model_choreography?: string;    // New: multi-model staging directions when models are present
  _autoCorrected?: boolean;       // Tracking if invalid tokens were stripped
}
export interface MediaAsset {
  mediaId: string;
  base64: string;
  mimeType: string;
  name?: string;
}
export interface ModelSuitPair {
  id: string;
  model?: MediaAsset;
  suit?: MediaAsset;
}
export interface SellingPoint {
  sp_id: string;
  name: string;
  description: string;
  referenceImage?: MediaAsset;
  modelMode?: 'auto' | 'with_model' | 'no_model'; // User override of model usage (default auto = from image_type analysis)
  envMode?: 'global' | 'custom' | 'none';        // Environment override: global env image (default) / this SP's own / none
  environmentImage?: MediaAsset;                  // SP-specific env image, used when envMode === 'custom'
  enrichment: {
    visual_params: VisualParams | null;
    narrative_concept: NarrativeConcept | null;
    final_prompt: string | null;
    generatedImage?: MediaAsset;
  };
  status: 'idle' | 'analyzing' | 'narrating' | 'compiling' | 'awaiting_review' | 'generating' | 'completed' | 'error';
  error?: string;
}
export interface ModelReference {
  model?: { base64: string; mimeType: string };
  suit?: { base64: string; mimeType: string };
}
export interface GlobalContext {
  product_info: string;
  brand_tone: string;
  output_spec: string;
  globalStyleImage?: MediaAsset;
  productImage?: MediaAsset;
  environmentImage?: MediaAsset;
  modelReferences: ModelSuitPair[];
  global_analysis?: GlobalAnalysis | null;
}
export interface ProductCampaignState {
  global_context: GlobalContext;
  selling_points: SellingPoint[];
}
