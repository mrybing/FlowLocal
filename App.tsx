import React, { useState, useEffect, useRef } from 'react';
import { Flow, getApiKey, setApiKey, getImageModelName, setImageModelName, IMAGE_MODELS, getTextModelName, setTextModelName, TEXT_MODELS, fetchAvailableModels } from './services/flow';
import { SellingPoint, GlobalContext } from './types';
import { extractVisualParams, generateNarrative, compilePrompt, extractGlobalParams, parseAspectRatio, buildGenerationRefs, spUsesModels } from './services/workflow';
// --- Hooks ---
function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: (e: MouseEvent | TouchEvent) => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => { 
      document.removeEventListener('mousedown', listener); 
      document.removeEventListener('touchstart', listener); 
    };
  }, [ref, handler]);
}
// --- UI Primitives ---
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center px-2">
    <span className="text-[11px] font-medium text-[rgba(218,220,224,0.9)] tracking-[0.1px] normal-case">
      {children}
    </span>
  </div>
);
const PillButton: React.FC<{
  icon?: React.ReactNode; children: React.ReactNode;
  variant?: 'filled' | 'outline' | 'solid'; onClick?: () => void;
  disabled?: boolean; className?: string;
}> = ({ icon, children, variant = 'filled', onClick, disabled, className = '' }) => {
  const base = 'flex items-center gap-[2px] justify-center h-[34px] rounded-xl font-medium tracking-[0.1px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    filled: 'bg-[#969696] hover:bg-[#a6a6a6] active:bg-[#868686] text-black text-[11px] pl-[8px] pr-[24px] py-1 select-none',
    outline: 'border border-[#595959] hover:bg-white/5 active:bg-white/10 backdrop-blur-[40px] text-[12px] pl-[8px] pr-[16px] py-2 text-white select-none',
    solid: 'bg-white hover:bg-gray-200 active:bg-gray-300 text-black text-[12px] pl-[8px] pr-[16px] py-2 select-none',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="flex items-center justify-center w-6 h-6">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
const TextInput: React.FC<{
  value: string; onChange: (val: string) => void; placeholder?: string; rows?: number;
  className?: string;
}> = ({ value, onChange, placeholder, rows = 3, className = '' }) => (
  <textarea 
    value={value} 
    onChange={(e) => onChange(e.target.value)} 
    placeholder={placeholder}
    className={`border border-[#595959] hover:border-[#7a7a7a] focus:border-[#969696] rounded-xl w-full px-3 py-2.5 resize-none bg-transparent text-[11px] font-medium text-white placeholder-[rgba(218,220,224,0.75)] tracking-[0.1px] focus:outline-none transition-colors ${className}`}
    style={{ height: `${rows * 20}px` }}
  />
);
const FieldDropdown: React.FC<{
  label: string; value: string; options: string[];
  onChange: (val: string) => void; className?: string;
}> = ({ label, value, options, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setIsOpen(false));
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left border border-[#595959] hover:border-[#7a7a7a] transition-colors rounded-xl flex flex-col gap-0.5 justify-center pb-2 pl-2.5 pr-1 pt-[5px] select-none focus:outline-none">
        <p className="text-[11px] font-medium text-[rgba(255,255,255,0.35)] tracking-[0.1px]">{label}</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-white tracking-[0.1px]">{value}</span>
          <span className={`material-symbols-outlined text-[16px] text-[rgba(218,220,224,0.5)] mr-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}>keyboard_arrow_down</span>
        </div>
      </button>
      {isOpen && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-full bg-[#0e0e0e] border border-[#595959] rounded-xl overflow-hidden shadow-xl backdrop-blur-md animate-dropdown origin-top">
          <div className="max-h-40 overflow-y-auto dark-scrollbar">
            {options.map((opt) => (
              <button key={opt} type="button"
                className={`w-full text-left px-2.5 py-2 text-[11px] font-medium tracking-[0.1px] hover:bg-[#1a1a1a] transition-colors ${value === opt ? 'bg-[#1a1a1a] text-white' : 'text-[rgba(218,220,224,0.9)]'}`}
                onClick={() => { onChange(opt); setIsOpen(false); }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
const MediaPreview: React.FC<{ 
  item?: { base64: string; mimeType: string }; 
  label: string; 
  onSelect: () => void;
  onClear: () => void;
  className?: string;
}> = ({ item, label, onSelect, onClear, className = '' }) => (
  <div className={`group relative aspect-square bg-[#1a1a1a] rounded-xl border border-[#595959] overflow-hidden flex flex-col items-center justify-center cursor-pointer ${className}`} onClick={onSelect}>
    {item ? (
      <>
        <img src={`data:${item.mimeType};base64,${item.base64}`} className="w-full h-full object-cover" />
        <button 
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-black rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-[14px] text-white">close</span>
        </button>
      </>
    ) : (
      <div className="flex flex-col items-center gap-1 opacity-40">
        <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
        <span className="text-[9px] uppercase tracking-wider text-center px-1">{label}</span>
      </div>
    )}
  </div>
);
// --- Main App ---
export default function VisualPromptApp() {
  const [globalContext, setGlobalContext] = useState<GlobalContext>({
    product_info: '',
    brand_tone: '',
    output_spec: '16:9',
    modelReferences: [{ id: 'm1' }],
    global_analysis: null,
  });
  
  const [sellingPoints, setSellingPoints] = useState<SellingPoint[]>([
    {
      sp_id: 'sp_01',
      name: '',
      description: '',
      status: 'idle',
      enrichment: { visual_params: null, narrative_concept: null, final_prompt: null }
    }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [textModel, setTextModelState] = useState(getTextModelName());
  const [imageModel, setImageModelState] = useState(getImageModelName());
  const [textModelOptions, setTextModelOptions] = useState<string[]>(Object.keys(TEXT_MODELS));
  const [imageModelOptions, setImageModelOptions] = useState<string[]>(Object.keys(IMAGE_MODELS));
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const loadModels = async (keyOverride?: string) => {
    const k = keyOverride ?? apiKey;
    if (!k || !k.trim()) return;
    setIsLoadingModels(true);
    try {
      const res = await fetchAvailableModels();
      const textKeys = Object.keys(res.textModels);
      const imageKeys = Object.keys(res.imageModels);
      if (textKeys.length > 0) setTextModelOptions(textKeys);
      if (imageKeys.length > 0) setImageModelOptions(imageKeys);
    } catch (err) {
      console.warn('获取可用模型失败:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (apiKey.trim()) {
      loadModels(apiKey);
    }
  }, []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const exportInputs = () => {
    const data = { app: 'FlowLocal', version: 1, globalContext, sellingPoints };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    Flow.download({ base64: b64, mimeType: 'application/json', filename: `flowlocal_inputs_${Date.now()}.json` });
  };
  const importInputs = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!data.globalContext || !data.sellingPoints) throw new Error('Not a FlowLocal export');
      const busy = ['analyzing', 'narrating', 'compiling', 'generating'];
      setGlobalContext(data.globalContext);
      setSellingPoints(data.sellingPoints.map((s: SellingPoint) => busy.includes(s.status) ? { ...s, status: 'idle' } : s));
    } catch (e) {
      alert('Import failed: ' + String(e));
    }
  };
  const clearModelAsset = (id: string, type: 'model' | 'suit') => {
    setGlobalContext(prev => ({
      ...prev,
      modelReferences: prev.modelReferences.map(m => m.id === id ? { ...m, [type]: undefined } : m)
    }));
  };
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      html, body, #root { background: #0e0e0e; color: white; height: 100%; font-family: 'Google Sans Text', sans-serif; }
      .dark-scrollbar::-webkit-scrollbar { width: 6px; }
      .dark-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .dark-scrollbar::-webkit-scrollbar-thumb { background: #595959; border-radius: 9999px; }
      @keyframes dropdown-enter { from { opacity: 0; transform: scale(0.95) translateY(-5px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      .animate-dropdown { animation: dropdown-enter 0.15s ease-out forwards; }
    `;
    document.head.appendChild(style);
  }, []);
  const selectMedia = async (type: 'global' | 'product' | 'environment' | 'model' | 'suit' | 'sp' | 'spEnv', id?: string | number) => {
    const media = await Flow.media.select({ filter: 'image' });
    if (!media) return;
    if (type === 'spEnv') {
      updateSP(id as number, { environmentImage: media, envMode: 'custom' });
    } else if (type === 'sp') {
      updateSP(id as number, { referenceImage: media });
    } else if (type === 'global') {
      setGlobalContext(prev => ({ ...prev, globalStyleImage: media, global_analysis: null }));
    } else if (type === 'product') {
      setGlobalContext(prev => ({ ...prev, productImage: media }));
    } else if (type === 'environment') {
      setGlobalContext(prev => ({ ...prev, environmentImage: media }));
    } else if (id) {
      setGlobalContext(prev => ({
        ...prev,
        modelReferences: prev.modelReferences.map(m => m.id === id ? { ...m, [type]: media } : m)
      }));
    }
  };
  const updateSP = (index: number, updates: Partial<SellingPoint>) => {
    setSellingPoints(prev => {
      const newSPs = [...prev];
      newSPs[index] = { ...newSPs[index], ...updates };
      return newSPs;
    });
  };
  const runPreparation = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      let currentGlobal = { ...globalContext };
      
      if (currentGlobal.globalStyleImage && !currentGlobal.global_analysis) {
        const analysis = await extractGlobalParams(currentGlobal.globalStyleImage);
        currentGlobal = { ...currentGlobal, global_analysis: analysis };
        setGlobalContext(currentGlobal);
      }
      let currentIdx = -1;
      try {
      for (let i = 0; i < sellingPoints.length; i++) {
        currentIdx = i;
        const sp = sellingPoints[i];
        if (!sp.name.trim() || sp.status === 'completed' || sp.status === 'generating') continue;
        updateSP(i, { status: 'analyzing' });
        const visual = await extractVisualParams(sp, currentGlobal);
        
        updateSP(i, { status: 'narrating', enrichment: { ...sp.enrichment, visual_params: visual } });
        const narrative = await generateNarrative({ ...sp, enrichment: { ...sp.enrichment, visual_params: visual } }, currentGlobal, sellingPoints);
        
        updateSP(i, { status: 'compiling', enrichment: { ...sp.enrichment, visual_params: visual, narrative_concept: narrative } });
        const prompt = compilePrompt({ ...sp, enrichment: { ...sp.enrichment, visual_params: visual, narrative_concept: narrative } }, currentGlobal);
        
        updateSP(i, { 
          status: 'awaiting_review', 
          enrichment: { ...sp.enrichment, visual_params: visual, narrative_concept: narrative, final_prompt: prompt } 
        });
      }
      } catch (err) {
        if (currentIdx >= 0) updateSP(currentIdx, { status: 'error', error: String(err) });
        throw err;
      }
    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setIsProcessing(false);
    }
  };
  const confirmAndGenerate = async (index: number) => {
    const sp = sellingPoints[index];
    if (sp.status !== 'awaiting_review' || !sp.enrichment.final_prompt) return;
    try {
      updateSP(index, { status: 'generating' });
      const prompt = sp.enrichment.final_prompt;
      
      // 参考图列表与编译 prompt 中的 "image N" 使用同一个函数生成，
      // 保证编号一一对应（空槽位跳过、卖点参考图不传入、不需要模特的卖点不传模特图）
      const refs = buildGenerationRefs(sp, globalContext);
      const result = await Flow.generate.image({
        prompt,
        aspectRatio: parseAspectRatio(globalContext.output_spec),
        referenceImages: refs.map(r => r.asset)
      });
      updateSP(index, { status: 'completed', enrichment: { ...sp.enrichment, generatedImage: result } });
    } catch (err) {
      console.error(err);
      updateSP(index, { status: 'error', error: String(err) });
    }
  };
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0e0e0e]">
      {/* Sidebar */}
      <div className="w-[320px] border-r border-white/15 flex flex-col p-[12px] gap-[20px] overflow-y-auto dark-scrollbar">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-[11px] font-medium text-[rgba(218,220,224,0.9)] tracking-[0.1px]">Settings</span>
            <button
              type="button"
              onClick={() => loadModels()}
              disabled={isLoadingModels || !apiKey.trim()}
              className="text-[10px] text-white/50 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-30 cursor-pointer"
              title="根据当前 API Key 自动拉取 Google 官方可用模型列表"
            >
              <span className={`material-symbols-outlined text-[13px] ${isLoadingModels ? 'animate-spin' : ''}`}>sync</span>
              <span>{isLoadingModels ? '拉取中...' : '拉取可用模型'}</span>
            </button>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKeyState(e.target.value); setApiKey(e.target.value); }}
            onBlur={() => { if (apiKey.trim()) loadModels(apiKey); }}
            placeholder="Gemini API Key"
            className="border border-[#595959] focus:border-[#969696] rounded-xl w-full px-3 py-2.5 bg-transparent text-[11px] font-medium text-white placeholder-[rgba(218,220,224,0.75)] focus:outline-none"
          />
          <FieldDropdown
            label="Text Model (推理模型)"
            value={textModel}
            options={textModelOptions}
            onChange={(v) => { setTextModelState(v); setTextModelName(v); }}
            className="w-full"
          />
          <FieldDropdown
            label="Image Model (生图模型)"
            value={imageModel}
            options={imageModelOptions}
            onChange={(v) => { setImageModelState(v); setImageModelName(v); }}
            className="w-full"
          />
          <div className="flex gap-2">
            <PillButton variant="outline" className="flex-1" onClick={exportInputs}>Export Inputs</PillButton>
            <PillButton variant="outline" className="flex-1" onClick={() => importInputRef.current?.click()}>Import Inputs</PillButton>
            <input ref={importInputRef} type="file" accept="application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importInputs(f); e.target.value = ''; }} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel>Campaign Context</SectionLabel>
          <div className="flex flex-col gap-1.5">
            <TextInput 
              value={globalContext.product_info} 
              onChange={(v) => setGlobalContext({ ...globalContext, product_info: v })}
              placeholder="Product specs & key features..."
              rows={2}
            />
            <TextInput 
              value={globalContext.brand_tone} 
              onChange={(v) => setGlobalContext({ ...globalContext, brand_tone: v })}
              placeholder="Brand Tone (e.g. Minimalist Luxury, Tech-futuristic...)"
              rows={2}
            />
            <FieldDropdown 
              label="Output Format (Aspect Ratio)"
              value={globalContext.output_spec}
              options={['1:1', '16:9', '9:16', '4:3', '3:4']}
              onChange={(v) => setGlobalContext({ ...globalContext, output_spec: v })}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel>Universal Assets</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <MediaPreview label="Style" item={globalContext.globalStyleImage} onSelect={() => selectMedia('global')} onClear={() => setGlobalContext({ ...globalContext, globalStyleImage: undefined, global_analysis: null })} />
            <MediaPreview label="Product" item={globalContext.productImage} onSelect={() => selectMedia('product')} onClear={() => setGlobalContext({ ...globalContext, productImage: undefined })} />
            <MediaPreview label="Env" item={globalContext.environmentImage} onSelect={() => selectMedia('environment')} onClear={() => setGlobalContext({ ...globalContext, environmentImage: undefined })} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel>Character Inventory</SectionLabel>
          {globalContext.modelReferences.map((m, idx) => (
            <div key={m.id} className="p-2 bg-white/5 rounded-xl border border-white/10 flex flex-col gap-2">
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Model {String.fromCharCode(65 + idx)}</span>
              <div className="grid grid-cols-2 gap-2">
                <MediaPreview label="Model" item={m.model} onSelect={() => selectMedia('model', m.id)} onClear={() => clearModelAsset(m.id, 'model')} />
                <MediaPreview label="Suit" item={m.suit} onSelect={() => selectMedia('suit', m.id)} onClear={() => clearModelAsset(m.id, 'suit')} />
              </div>
            </div>
          ))}
          <PillButton variant="outline" onClick={() => setGlobalContext({ ...globalContext, modelReferences: [...globalContext.modelReferences, { id: `m${globalContext.modelReferences.length + 1}` }] })} icon={<span className="material-symbols-outlined text-[16px]">add</span>}>Add Person</PillButton>
        </div>
        <div className="mt-auto pt-4">
          <PillButton variant="solid" onClick={runPreparation} disabled={isProcessing} className="w-full !bg-blue-600 !text-white" icon={<span className="material-symbols-outlined text-[18px]">auto_fix_high</span>}>
            {isProcessing ? 'Thinking...' : 'Process Campaign'}
          </PillButton>
        </div>
      </div>
      {/* Main Panel */}
      <div className="flex-1 overflow-y-auto p-8 dark-scrollbar">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
           <div className="flex justify-between items-center">
              <h1 className="text-xl font-medium">Selling Points</h1>
              <PillButton variant="outline" onClick={() => setSellingPoints([...sellingPoints, { sp_id: `sp_${sellingPoints.length + 1}`, name: '', description: '', status: 'idle', enrichment: { visual_params: null, narrative_concept: null, final_prompt: null } }])} icon={<span className="material-symbols-outlined text-[18px]">add</span>}>New Point</PillButton>
           </div>
           {sellingPoints.map((sp, idx) => (
             <div key={sp.sp_id} className="bg-[#141414] border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
               <div className="flex gap-6">
                 <div className="w-32 shrink-0">
                    <MediaPreview label="Reference" item={sp.referenceImage} onSelect={() => selectMedia('sp', idx)} onClear={() => updateSP(idx, { referenceImage: undefined })} />
                 </div>
                 <div className="flex-1 flex flex-col gap-3">
                    <input className="bg-transparent border-b border-white/10 text-lg outline-none font-medium py-1" placeholder="Selling Point Title" value={sp.name} onChange={e => updateSP(idx, { name: e.target.value })} />
                    <textarea className="bg-transparent text-sm text-white/50 outline-none resize-none h-24" placeholder="Briefly describe what this selling point visualizes..." value={sp.description} onChange={e => updateSP(idx, { description: e.target.value })} />
                 </div>
               </div>
               <div className="flex items-center gap-3">
                  <FieldDropdown
                    label="Model usage"
                    value={sp.modelMode === 'with_model' ? 'Use models' : sp.modelMode === 'no_model' ? 'No models (product only)' : 'Auto (by image type)'}
                    options={['Auto (by image type)', 'Use models', 'No models (product only)']}
                    onChange={(v) => updateSP(idx, { modelMode: v === 'Use models' ? 'with_model' : v === 'No models (product only)' ? 'no_model' : 'auto' })}
                    className="w-56"
                  />
                  {sp.enrichment.visual_params && (
                    <span className="text-[10px] text-white/40">
                      Type: {sp.enrichment.visual_params.image_type} · {spUsesModels(sp, globalContext) ? 'with models' : 'no models'} (re-run Process after changing)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <FieldDropdown
                    label="Environment"
                    value={sp.envMode === 'custom' ? 'Custom for this point' : sp.envMode === 'none' ? 'No environment image' : 'Use global Env'}
                    options={['Use global Env', 'Custom for this point', 'No environment image']}
                    onChange={(v) => updateSP(idx, { envMode: v === 'Custom for this point' ? 'custom' : v === 'No environment image' ? 'none' : 'global' })}
                    className="w-56"
                  />
                  {sp.envMode === 'custom' && (
                    <MediaPreview label="Env" item={sp.environmentImage} onSelect={() => selectMedia('spEnv', idx)} onClear={() => updateSP(idx, { environmentImage: undefined })} className="w-16" />
                  )}
                  {sp.envMode === 'custom' && !sp.environmentImage && (
                    <span className="text-[10px] text-yellow-500/80">Upload an env image, otherwise no environment reference is used (re-run Process after changing)</span>
                  )}
                </div>
                {sp.status === 'awaiting_review' && (
                 <div className="mt-4 pt-6 border-t border-white/10 flex flex-col gap-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex flex-col gap-1">
                       <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-blue-400 text-[18px]">info</span>
                          <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">Prompt Ready</span>
                       </div>
                       {sp.enrichment.narrative_concept?._autoCorrected && (
                         <span className="text-[9px] text-yellow-500/80 italic">Note: Some invalid tokens were automatically removed for compatibility.</span>
                       )}
                    </div>
                    <TextInput value={sp.enrichment.final_prompt || ''} onChange={v => updateSP(idx, { enrichment: { ...sp.enrichment, final_prompt: v } })} rows={6} className="!bg-black/40 !text-[12px] leading-relaxed" />
                    <div className="flex items-center justify-between px-1">
                      <span className={`text-[10px] font-mono ${(sp.enrichment.final_prompt?.length || 0) > 3600 ? 'text-red-400 font-bold' : 'text-white/30'}`}>
                        {sp.enrichment.final_prompt?.length || 0}/3600
                        {(sp.enrichment.final_prompt?.length || 0) > 3600 && ' ⚠ Exceeds limit — generation will fail'}
                      </span>
                    </div>
                    <PillButton variant="solid" className="w-full !bg-white !text-black" onClick={() => confirmAndGenerate(idx)} disabled={(sp.enrichment.final_prompt?.length || 0) > 3600} icon={<span className="material-symbols-outlined text-[18px]">bolt</span>}>Generate Campaign Visual</PillButton>
                 </div>
               )}
               {sp.status === 'completed' && sp.enrichment.generatedImage && (
                 <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/5 flex flex-col gap-4">
                    <div className="flex gap-4">
                      <img src={`data:${sp.enrichment.generatedImage.mimeType};base64,${sp.enrichment.generatedImage.base64}`} className="w-48 h-48 object-cover rounded-lg border border-white/10" />
                      <div className="flex-1 flex flex-col justify-between">
                         <div>
                            <span className="text-[9px] uppercase text-white/30 font-bold">Selling Point</span>
                            <p className="text-sm font-medium text-white/90">{sp.name}</p>
                            {sp.enrichment.narrative_concept?.emotion_keywords && (
                              <p className="text-xs text-white/50 mt-1">{sp.enrichment.narrative_concept.emotion_keywords.join(' · ')}</p>
                            )}
                         </div>
                         <div className="flex gap-2 mt-4">
                            <PillButton variant="outline" className="flex-1" onClick={() => updateSP(idx, { status: 'awaiting_review' })}>Tweak Prompt</PillButton>
                            <PillButton variant="outline" className="px-4" onClick={async () => {
                               if (sp.enrichment.generatedImage) {
                                 await Flow.download({ 
                                   base64: sp.enrichment.generatedImage.base64, 
                                   mimeType: sp.enrichment.generatedImage.mimeType, 
                                   filename: `${sp.name.replace(/\s+/g, '_')}_final.png` 
                                 });
                               }
                            }} icon={<span className="material-symbols-outlined text-[18px]">download</span>}>Export</PillButton>
                         </div>
                      </div>
                    </div>
                 </div>
               )}
               {sp.status !== 'idle' && sp.status !== 'completed' && sp.status !== 'awaiting_review' && sp.status !== 'error' && (
                 <div className="flex items-center gap-3 text-blue-400 text-xs py-4">
                   <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
                   <span className="uppercase tracking-widest font-bold">Orchestrating {sp.status}...</span>
                 </div>
               )}
               {sp.status === 'error' && (
                 <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px]">
                   Error: {sp.error}
                   <PillButton variant="outline" className="mt-2" onClick={() => updateSP(idx, { status: 'idle' })}>Retry</PillButton>
                 </div>
               )}
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
