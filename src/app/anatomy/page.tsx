"use client";

import { useState } from "react";
import { 
  Activity, ShieldAlert, Heart, RefreshCw, Layers, MapPin, 
  Sparkles, Stethoscope, ChevronRight, HelpCircle, Send, MessageSquare 
} from "lucide-react";
import AnatomyCanvas from "@/features/anatomy/components/AnatomyCanvas";

// Mock Conditions data
const conditionsData: Record<string, {
  name: string;
  definition: string;
  muscles: string[];
  layers: string[];
  focusPart: string;
  acupuncture: string[];
  massage: string[];
  shockwave: string;
  homecare: string[];
}> = {
  "Frozen Shoulder": {
    name: "Frozen Shoulder (肩周炎 / 五十肩)",
    definition: "Adhesive capsulitis characterized by stiffness and pain in the shoulder joint, restricting voluntary movements.",
    muscles: ["Left Shoulder", "Right Shoulder", "Left Upper Arm", "Right Upper Arm"],
    layers: ["skeletal", "muscular"],
    focusPart: "Right Shoulder",
    acupuncture: ["GB21 (Jianjing)", "LI15 (Jianyu)", "TE14 (Jianliao)"],
    massage: ["Trigger point release on supraspinatus & subscapularis", "Passive stretching of joint capsule"],
    shockwave: "1.8 Bar | 10Hz - 12Hz | 2000 pulses over supraspinatus tendon & joint capsule",
    homecare: ["Pendulum exercises (2 mins, 3x daily)", "Wall crawler stretch", "Warm compress before stretching"]
  },
  "Sciatica": {
    name: "Sciatica (坐骨神经痛)",
    definition: "Pain radiating along the sciatic nerve pathway, extending from the lower back through the hip and down the legs.",
    muscles: ["Abdomen", "Right Hip", "Right Thigh", "Right Calf"],
    layers: ["skeletal", "nervous"],
    focusPart: "Right Thigh",
    acupuncture: ["GB30 (Huantiao)", "BL40 (Weizhong)", "BL23 (Shenshu)"],
    massage: ["Deep tissue release on Piriformis muscle", "Myofascial release along hamstring pathway"],
    shockwave: "2.0 Bar | 8Hz | 1500 pulses on piriformis trigger point & gluteal insertion",
    homecare: ["Piriformis stretch (hold 30s, 3x)", "Knee-to-chest stretch", "Avoid prolonged sitting"]
  },
  "Tennis Elbow": {
    name: "Tennis Elbow (网球肘 / 肱骨外上髁炎)",
    definition: "Overuse injury causing inflammation of the extensor tendons of the forearm, leading to outer elbow pain.",
    muscles: ["Right Upper Arm", "Right Forearm", "Right Hand"],
    layers: ["muscular"],
    focusPart: "Right Forearm",
    acupuncture: ["LI11 (Quchi)", "LI10 (Shousanli)", "LI4 (Hegu)"],
    massage: ["Cross-fiber friction massage on wrist extensor tendon insertion", "Forearm myofascial release"],
    shockwave: "1.6 Bar | 12Hz - 15Hz | 2000 pulses over common extensor tendon origin",
    homecare: ["Eccentric wrist extension exercises", "Forearm extensor stretch", "Ice compress after loading"]
  }
};

// Mock AI Chat Responses based on clicked part/condition
const aiResponses: Record<string, string> = {
  "Head": "头部疼痛通常与颈椎张力、紧张性头痛或足太阳膀胱经（BL）气血不通有关。针灸常用百会穴（GV20）和太阳穴来调理气血、舒缓神经。",
  "Neck": "颈部酸痛常见于胸锁乳突肌（SCM）或斜方肌受损，伴随C3-C5神经根压迫。在中医中，颈部属于足少阳胆经巡行路线，针灸风池穴和肩井穴（GB21）可有效缓解。",
  "Right Shoulder": "右肩疼痛可能源于肩袖肌群（如冈上肌）劳损或肩关节粘连（五十肩）。建议采用针灸肩井穴（GB21）结合冲击波治疗（1.8 Bar，冈上肌肌腱压痛点），促进局部微循环和腱骨愈合。",
  "Right Forearm": "前臂外侧疼痛多为网球肘（肱骨外上髁炎），是伸腕肌腱劳损。针灸常用曲池穴（LI11）和手三里（LI10），配合深层肌肉按摩以释放肌筋膜张力。",
  "Right Thigh": "大腿后侧放射痛通常是坐骨神经受压的典型症状，多由梨状肌紧张压迫坐骨神经引起。可以通过针灸环跳穴（GB30）和委中穴（BL40）配合冲击波（2.0 Bar）释放梨状肌张力。",
  "default": "选择人体部位或常见痛症，AI 智能助手将为您分析其解剖结构特点、中医经络走向，并提供针对性的针灸、按摩和冲击波联合治疗方案。"
};

export default function Home() {
  // Layer states
  const [activeLayers, setActiveLayers] = useState({
    skeletal: true,
    muscular: true,
    nervous: false,
    vascular: false,
    lymphatic: false,
    acupuncture: true,
  });

  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: aiResponses.default }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Toggle Layer Helper
  const toggleLayer = (layer: keyof typeof activeLayers) => {
    setActiveLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Select Condition Helper
  const handleSelectCondition = (conditionName: string) => {
    if (selectedCondition === conditionName) {
      // Deselect
      setSelectedCondition(null);
      setSelectedPart(null);
      return;
    }

    const cond = conditionsData[conditionName];
    if (cond) {
      setSelectedCondition(conditionName);
      setSelectedPart(cond.focusPart);
      
      // Auto toggle layers
      const newLayers = { ...activeLayers };
      Object.keys(newLayers).forEach(key => {
        // @ts-ignore
        newLayers[key] = cond.layers.includes(key);
      });
      // Always keep acupuncture meridian visible for clinical TCM context
      newLayers.acupuncture = true;
      setActiveLayers(newLayers);

      // Reset chat message
      setChatMessages([
        { role: "assistant", text: `已定位到：${cond.name}。此痛症涉及 ${cond.focusPart} 的解剖学改变（高亮显示）。为您推荐联合治疗方案，您也可以在此输入有关此病症的具体提问。` }
      ]);
    }
  };

  // Select Body Part Helper
  const handleSelectPart = (partName: string) => {
    setSelectedPart(partName);
    setSelectedCondition(null); // Clear condition if selecting a specific part manually

    const answer = aiResponses[partName] || `已为您锁定 ${partName}。该区域包含多条肌肉纤维与神经束，可通过针灸或医疗推拿改善经络微循环。`;
    setChatMessages([
      { role: "assistant", text: answer }
    ]);
  };

  // Handle AI Chat Input Submission
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatMessages(prev => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setChatLoading(true);

    // Simulate AI thinking and streaming response
    setTimeout(() => {
      let reply = `针对您关于“${userText}”的提问，分析如下：此区域的肌肉起止点张力异常，在中医理论中属于气滞血瘀。建议通过针灸强刺激阿是穴以得气，同时辅以中低频冲击波疗法以软化痉挛结节。`;
      
      // Customize reply if a part is selected
      if (selectedPart) {
        reply = `针对您提问的 ${selectedPart} 区域：“${userText}”。解剖学显示其深部神经可能受到压迫，建议首先行推拿松解以解除痉挛，再以针灸行远端配穴（如合谷穴）疏导经气。`;
      }

      setChatMessages(prev => [...prev, { role: "assistant", text: reply }]);
      setChatLoading(false);
    }, 1000);
  };

  const activeCondData = selectedCondition ? conditionsData[selectedCondition] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 px-6 py-4 flex items-center justify-between shadow-lg shadow-slate-950/20">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white p-2 rounded-2xl shadow-lg shadow-emerald-500/20">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              AcuTherapy AI Anatomy
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full">
                Clinical V1.0
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Interactive 3D Anatomy & AI Patient Education Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Clinic TV Mode</span>
          <span className="text-slate-700">|</span>
          <button 
            onClick={() => {
              setSelectedPart(null);
              setSelectedCondition(null);
              setChatMessages([{ role: "assistant", text: aiResponses.default }]);
            }}
            className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset Canvas
          </button>
        </div>
      </header>

      {/* Main Workspace Split Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 items-stretch">
        {/* Left Section: 3D Viewport Panel (lg:col-span-8) */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex-1 min-h-[500px]">
            <AnatomyCanvas
              activeLayers={activeLayers}
              selectedPart={selectedPart}
              onSelectPart={handleSelectPart}
            />
          </div>

          {/* Interactive Layer Switcher Bar */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-wrap gap-2.5 items-center justify-between backdrop-blur-md">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-emerald-400" />
              Anatomical Layer Toggles:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "skeletal", label: "💀 Skeletal" },
                { key: "muscular", label: "💪 Muscular" },
                { key: "nervous", label: "⚡ Nervous" },
                { key: "vascular", label: "🩸 Vascular" },
                { key: "lymphatic", label: "🟢 Lymphatic" },
                { key: "acupuncture", label: "☯️ TCM Meridians" }
              ].map(layer => (
                <button
                  key={layer.key}
                  onClick={() => toggleLayer(layer.key as keyof typeof activeLayers)}
                  className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all duration-200 ${
                    // @ts-ignore
                    activeLayers[layer.key]
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-md shadow-emerald-500/5'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {layer.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right Section: Sidebar controls, AI Explanation, Treatment Recommendations (lg:col-span-4) */}
        <section className="lg:col-span-4 flex flex-col gap-6 max-h-[780px] overflow-y-auto pr-1">
          {/* Section 1: Navigation Control Hub */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 backdrop-blur-md">
            <h3 className="font-extrabold text-sm text-slate-200 flex items-center gap-2 mb-4">
              <MapPin className="h-4.5 w-4.5 text-emerald-400" />
              Interactive Navigator Hub
            </h3>

            {/* Pain Navigator Quick Select */}
            <div className="mb-4">
              <span className="text-[10px] font-black text-slate-500 block mb-2 uppercase tracking-widest">AI Pain Navigator (Quick Presets)</span>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(conditionsData).map(name => (
                  <button
                    key={name}
                    onClick={() => handleSelectCondition(name)}
                    className={`text-[10px] font-bold py-2 px-2.5 rounded-xl border text-center transition-all ${
                      selectedCondition === name
                        ? 'bg-red-500/10 border-red-500/40 text-red-400 shadow-md shadow-red-500/5'
                        : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Body Regions Quick Select */}
            <div>
              <span className="text-[10px] font-black text-slate-500 block mb-2 uppercase tracking-widest">Body Regions</span>
              <div className="grid grid-cols-4 gap-1.5">
                {["Head", "Neck", "Chest", "Abdomen"].map(region => (
                  <button
                    key={region}
                    onClick={() => handleSelectPart(region)}
                    className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border text-center transition-all ${
                      selectedPart === region
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : 'bg-slate-950/60 border-slate-900 text-slate-400 hover:border-slate-800'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Clinical Treatment Recommendations */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 backdrop-blur-md">
            <h3 className="font-extrabold text-sm text-slate-200 flex items-center gap-2 mb-4">
              <Activity className="h-4.5 w-4.5 text-emerald-400" />
              Multi-Modality Treatment Recommendations
            </h3>

            {activeCondData ? (
              <div className="space-y-4">
                <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3">
                  <span className="text-[9px] font-black text-red-400 block uppercase tracking-wider mb-1">Target Condition</span>
                  <span className="font-black text-slate-100 text-xs block">{activeCondData.name}</span>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-1">{activeCondData.definition}</p>
                </div>

                <div className="space-y-2.5">
                  {/* Acupuncture */}
                  <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 flex gap-3 items-start">
                    <div className="bg-emerald-500/10 text-emerald-400 p-1.5 rounded-lg text-xs font-bold">针</div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Acupuncture Point Prescription</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {activeCondData.acupuncture.map((pt, i) => (
                          <span key={i} className="bg-slate-900 text-slate-200 border border-slate-800 text-[9px] font-medium px-2 py-0.5 rounded-md">{pt}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Medical Massage */}
                  <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 flex gap-3 items-start">
                    <div className="bg-sky-500/10 text-sky-400 p-1.5 rounded-lg text-xs font-bold">推</div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Medical Massage Protocol</span>
                      <p className="text-[10px] text-slate-300 leading-relaxed mt-1">{activeCondData.massage[0]}</p>
                    </div>
                  </div>

                  {/* Shockwave */}
                  <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 flex gap-3 items-start">
                    <div className="bg-amber-500/10 text-amber-400 p-1.5 rounded-lg text-xs font-bold">波</div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Shockwave Therapy parameters</span>
                      <p className="text-[10px] text-slate-300 leading-relaxed mt-1">{activeCondData.shockwave}</p>
                    </div>
                  </div>

                  {/* Homecare */}
                  <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 flex gap-3 items-start">
                    <div className="bg-purple-500/10 text-purple-400 p-1.5 rounded-lg text-xs font-bold">练</div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Home Care & Stretches</span>
                      <ul className="list-disc pl-3 text-[10px] text-slate-300 mt-1 space-y-0.5">
                        {activeCondData.homecare.map((ex, i) => <li key={i}>{ex}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedPart ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                <p>已高亮选中解剖结构：<span className="font-bold text-emerald-400">{selectedPart}</span></p>
                <p className="mt-2 text-[10px]">请从上方选择一种常见痛症（例如 Frozen Shoulder、Sciatica）以展示多模态联合治疗处方建议。</p>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
                <HelpCircle className="h-6 w-6 text-slate-600" />
                <p>请点击 3D 模型的身体部位或右侧痛症，以调取针灸配穴、医疗推拿及冲击波的治疗方案处方。</p>
              </div>
            )}
          </div>

          {/* Section 3: AI Clinic Explainer Chat (Pain Assistant) */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 backdrop-blur-md flex flex-col h-[320px]">
            <h3 className="font-extrabold text-sm text-slate-200 flex items-center gap-2 mb-3 flex-shrink-0">
              <Sparkles className="h-4.5 w-4.5 text-emerald-400" />
              AI Pain Explainer & Clinical Education
            </h3>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto mb-3 space-y-3 pr-1 text-xs">
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx}
                  className={`p-3 rounded-2xl leading-relaxed ${
                    msg.role === "assistant"
                      ? 'bg-slate-900 text-slate-200 border border-slate-800/80 rounded-tl-none'
                      : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 self-end rounded-tr-none'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
              {chatLoading && (
                <div className="bg-slate-900 text-slate-400 border border-slate-800/80 rounded-2xl rounded-tl-none p-3 flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  AI Clinical Assistant is thinking...
                </div>
              )}
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleSendChat} className="flex gap-2 flex-shrink-0">
              <input
                type="text"
                placeholder={selectedPart ? `Ask about ${selectedPart}...` : "Ask a pain or anatomy question..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all text-slate-200"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white p-2 rounded-xl transition-all duration-200"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
