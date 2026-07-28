"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Activity, 
  RefreshCw, 
  User, 
  Copy, 
  Plus, 
  Trash, 
  Save, 
  BookOpen, 
  HeartPulse, 
  Calendar, 
  Check, 
  ChevronRight, 
  AlertCircle,
  FileText
} from "lucide-react";

export default function ClinicalHub() {
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [encounterDate, setEncounterDate] = useState("");
  const [injuryDate, setInjuryDate] = useState("");
  const [hasInjury, setHasInjury] = useState(false);
  const [position, setPosition] = useState("Supine");
  const [principle, setPrinciple] = useState("BL62 - SI03");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([
    "Acupuncture & Heat lamp",
    "Electrical"
  ]);

  // Selected Diagnoses list: Array of { icdCode, complaintText, painLevel }
  const [activeDiagnoses, setActiveDiagnoses] = useState<any[]>([
    { icdCode: "M54.2", complaintText: "Cervicalgia", painLevel: 6 }
  ]);

  // ICD-10 Search Autocomplete
  const [searchQuery, setSearchQuery] = useState("");
  const [icdResults, setIcdResults] = useState<any[]>([]);
  const [searchingIcd, setSearchingIcd] = useState(false);

  // SOAP Generation Output
  const [soapOutput, setSoapOutput] = useState<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  } | null>(null);

  // Copy Feedback state
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Fetch leads on mount
  useEffect(() => {
    fetchLeads();
    // Default encounter date to today (local time)
    const today = new Date().toISOString().split("T")[0];
    setEncounterDate(today);
  }, []);

  async function fetchLeads() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, status, condition, notes, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (err: any) {
      console.error("Error fetching patient leads:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // Handle patient selection change
  function handleSelectPatient(patient: any) {
    setSelectedLead(patient);
    // Auto populate first diagnosis from patient's registered condition
    if (patient.condition) {
      // Find matching formulas from database if possible, or default to general pain
      setActiveDiagnoses([
        { icdCode: "M54.5", complaintText: patient.condition, painLevel: 6 }
      ]);
    } else {
      setActiveDiagnoses([
        { icdCode: "M54.5", complaintText: "Pain, unspecified", painLevel: 6 }
      ]);
    }
    setSoapOutput(null);
  }

  // ICD-10 Autocomplete search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setIcdResults([]);
      return;
    }
    setSearchingIcd(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("icd10_codes")
          .select("code, short_description")
          .or(`code.ilike.%${searchQuery}%,short_description.ilike.%${searchQuery}%`)
          .limit(8);

        if (!error && data) {
          setIcdResults(data);
        }
      } catch (err) {
        console.error("ICD autocomplete error:", err);
      } finally {
        setSearchingIcd(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Add ICD diagnosis to the form
  function handleAddDiagnosis(item: any) {
    if (activeDiagnoses.some(d => d.icdCode === item.code)) {
      setSearchQuery("");
      setIcdResults([]);
      return;
    }
    setActiveDiagnoses(prev => [
      ...prev,
      { icdCode: item.code, complaintText: item.short_description, painLevel: 5 }
    ]);
    setSearchQuery("");
    setIcdResults([]);
  }

  // Remove diagnosis
  function handleRemoveDiagnosis(index: number) {
    if (activeDiagnoses.length === 1) return; // Keep at least one
    setActiveDiagnoses(prev => prev.filter((_, i) => i !== index));
  }

  // Update pain level
  function handlePainChange(index: number, val: number) {
    setActiveDiagnoses(prev => prev.map((d, i) => i === index ? { ...d, painLevel: val } : d));
  }

  // Toggle treatment options
  function handleToggleTreatment(tName: string) {
    if (selectedTreatments.includes(tName)) {
      setSelectedTreatments(prev => prev.filter(x => x !== tName));
    } else {
      setSelectedTreatments(prev => [...prev, tName]);
    }
  }

  // Generate SOAP Note
  async function handleGenerateSOAP() {
    if (!selectedLead) {
      alert("Please select a patient first!");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-soap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedLead.id,
          encounterDate,
          injuryDate: hasInjury ? injuryDate : null,
          activeDiagnoses,
          position,
          principle,
          additionalTreatments: selectedTreatments
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSoapOutput(data);
      } else {
        alert("Failed to generate SOAP: " + data.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Save generated SOAP note to Supabase
  async function handleSaveSOAP() {
    if (!soapOutput || !selectedLead) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("soap_notes")
        .insert({
          patient_id: selectedLead.id,
          encounter_date: encounterDate,
          injury_date: hasInjury ? injuryDate : null,
          pain_levels: activeDiagnoses.reduce((acc, d) => {
            acc[d.icdCode] = d.painLevel;
            return acc;
          }, {} as any),
          icd_codes: activeDiagnoses.map(d => d.icdCode),
          subjective: soapOutput.subjective,
          objective: soapOutput.objective,
          assessment: soapOutput.assessment,
          plan: soapOutput.plan
        });

      if (error) throw error;
      alert("✅ SOAP Note successfully saved to database!");
    } catch (err: any) {
      alert("Failed to save SOAP note: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // Copy to clipboard helper
  function handleCopy(text: string, sectionName: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionName);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  // Copy ALL sections combined
  function handleCopyAll() {
    if (!soapOutput) return;
    const combined = `SUBJECTIVE:\n${soapOutput.subjective}\n\nOBJECTIVE:\n${soapOutput.objective}\n\nASSESSMENT:\n${soapOutput.assessment}\n\nPLAN:\n${soapOutput.plan}`;
    handleCopy(combined, "ALL");
  }

  const positions = ["Supine", "Prone", "Right Side", "Left Side", "On Chair"];
  const principles = [
    "BL62 - SI03", "SI03 - BL62", "KI06 - LU07", "LU07 - KI06",
    "SJ05 - GB41", "GB41 - SJ05", "SP04 - PC06", "PC06 - SP04"
  ];
  const coTreatments = [
    "Acupuncture & Heat lamp", "Special needling technique", "Electrical",
    "Massage", "Correction", "Tui Na", "Energy Test",
    "Fire Cupping", "Pump cupping", "Herbs", "Health guidance", "Introduce TAZ Meditation"
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 flex items-center justify-between shadow-sm shadow-slate-100">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-md shadow-emerald-500/20">
            <HeartPulse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">AcuTherapy Clinical SOAP Portal</h1>
            <p className="text-xs text-slate-500">Automated CPT-Shuffled Point Prescription Scribe</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a 
            href="/leads"
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200"
          >
            Leads Hub Dashboard
          </a>
          <button 
            onClick={fetchLeads}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-73px)]">
        
        {/* Left Sidebar: Patients List */}
        <aside className="w-full lg:w-80 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-500" /> Active Patients / Leads
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-none divide-y divide-slate-100">
            {leads.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No patients found.</div>
            ) : (
              leads.map((p) => {
                const isSelected = selectedLead?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPatient(p)}
                    className={`w-full text-left p-4 transition-all duration-200 hover:bg-slate-50 flex items-center justify-between ${
                      isSelected ? "bg-emerald-50/70 border-l-4 border-emerald-500" : ""
                    }`}
                  >
                    <div>
                      <h3 className={`text-sm font-bold ${isSelected ? "text-emerald-800" : "text-slate-800"}`}>
                        {p.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">{p.phone}</p>
                      {p.condition && (
                        <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          {p.condition}
                        </span>
                      )}
                    </div>
                    <ChevronRight className={`h-4 w-4 text-slate-400 ${isSelected ? "text-emerald-600" : ""}`} />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto">
          {!selectedLead ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-slate-200/60 shadow-sm">
              <div className="bg-emerald-50 p-4 rounded-full text-emerald-500 mb-4 animate-bounce">
                <BookOpen className="h-12 w-12" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Select a Patient</h2>
              <p className="text-sm text-slate-500 mt-2 max-w-sm">
                Choose an active patient or lead from the left sidebar to prepare their clinical SOAP note treatments.
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-5xl mx-auto">
              
              {/* Form Settings Card */}
              <section className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                      SOAP Form: <span className="text-emerald-600">{selectedLead.name}</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Configure encounter parameters, diagnostics, and procedures.</p>
                  </div>
                  
                  {/* Dates */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold uppercase text-slate-400">Encounter Date</label>
                      <input 
                        type="date"
                        value={encounterDate}
                        onChange={(e) => setEncounterDate(e.target.value)}
                        className="mt-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="injuryCheck"
                          checked={hasInjury}
                          onChange={(e) => setHasInjury(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor="injuryCheck" className="text-[10px] font-bold uppercase text-slate-400 cursor-pointer">Work / Auto Injury</label>
                      </div>
                      <input 
                        type="date"
                        disabled={!hasInjury}
                        value={injuryDate}
                        onChange={(e) => setInjuryDate(e.target.value)}
                        className="mt-1 px-3 py-1.5 bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Diagnostics Selection */}
                <div className="space-y-3">
                  <label className="text-xs font-extrabold uppercase text-slate-500 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-emerald-500" /> Active Diagnoses & Pain Levels (Select 3-4 for shuffler)
                  </label>

                  {/* Autocomplete Input */}
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Search ICD-10 codes or descriptions... (e.g. Cervicalgia, M54)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    {searchingIcd && (
                      <span className="absolute right-4 top-3 text-xs text-slate-400 animate-pulse">Searching...</span>
                    )}

                    {/* Results dropdown */}
                    {icdResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg z-20 max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {icdResults.map((item) => (
                          <button
                            key={item.code}
                            onClick={() => handleAddDiagnosis(item)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex justify-between items-center"
                          >
                            <div>
                              <span className="font-extrabold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md mr-2">
                                {item.code}
                              </span>
                              <span className="text-xs font-semibold text-slate-800">{item.short_description}</span>
                            </div>
                            <Plus className="h-4 w-4 text-emerald-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Active diagnosis list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {activeDiagnoses.map((d, index) => (
                      <div 
                        key={d.icdCode} 
                        className="bg-slate-50/70 border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between gap-4"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                              {d.icdCode}
                            </span>
                            <h4 className="text-xs font-bold text-slate-700 truncate max-w-[200px]">
                              {d.complaintText}
                            </h4>
                          </div>
                          
                          {/* Pain slider */}
                          <div className="flex items-center gap-3">
                            <input 
                              type="range"
                              min="0"
                              max="10"
                              value={d.painLevel}
                              onChange={(e) => handlePainChange(index, parseInt(e.target.value))}
                              className="flex-1 accent-emerald-500 h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-200"
                            />
                            <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg min-w-[32px] text-center">
                              {d.painLevel}/10
                            </span>
                          </div>
                        </div>

                        <button 
                          onClick={() => handleRemoveDiagnosis(index)}
                          className="text-slate-400 hover:text-rose-500 p-1.5 hover:bg-slate-200/50 rounded-xl transition"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grid for Position, Principle, Modalities */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
                  {/* Position */}
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase text-slate-500">Patient Position</label>
                    <select
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    >
                      {positions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* Coupled Principle */}
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase text-slate-500">8 Extra Meridian Principle</label>
                    <select
                      value={principle}
                      onChange={(e) => setPrinciple(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    >
                      {principles.map(pr => (
                        <option key={pr} value={pr}>{pr}</option>
                      ))}
                    </select>
                  </div>

                  {/* Co-treatments Checklist */}
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase text-slate-500">Co-Treatments / Modalities</label>
                    <div className="h-28 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                      {coTreatments.map(t => {
                        const isChecked = selectedTreatments.includes(t);
                        return (
                          <div key={t} className="flex items-center gap-2">
                            <input 
                              type="checkbox"
                              id={`t-${t}`}
                              checked={isChecked}
                              onChange={() => handleToggleTreatment(t)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                            />
                            <label htmlFor={`t-${t}`} className="text-xs font-semibold text-slate-700 cursor-pointer">{t}</label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Generate Button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleGenerateSOAP}
                    disabled={generating}
                    className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-sm px-6 py-3 rounded-2xl transition-all duration-300 shadow-md shadow-slate-900/10 flex items-center justify-center gap-2"
                  >
                    {generating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Generating SOAP Notes...
                      </>
                    ) : (
                      <>
                        Generate SOAP Notes ⚡
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* SOAP Generation Output Cards */}
              {soapOutput && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/50 p-4 rounded-2xl">
                    <div className="flex items-center gap-2.5 text-emerald-950">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      <span className="text-sm font-bold">SOAP note generated successfully. Ready for copying or saving!</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyAll}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                      >
                        {copiedSection === "ALL" ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy Entire SOAP
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleSaveSOAP}
                        disabled={saving}
                        className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Saving..." : "Save to Database"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Subjective */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Subjective (S)</h3>
                        <button 
                          onClick={() => handleCopy(soapOutput.subjective, "subjective")}
                          className="text-slate-400 hover:text-emerald-500 p-1 hover:bg-slate-100 rounded-lg transition"
                        >
                          {copiedSection === "subjective" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <textarea
                        value={soapOutput.subjective}
                        onChange={(e) => setSoapOutput({ ...soapOutput, subjective: e.target.value })}
                        className="w-full h-32 bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white resize-none"
                      />
                    </div>

                    {/* Objective */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Objective (O)</h3>
                        <button 
                          onClick={() => handleCopy(soapOutput.objective, "objective")}
                          className="text-slate-400 hover:text-emerald-500 p-1 hover:bg-slate-100 rounded-lg transition"
                        >
                          {copiedSection === "objective" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <textarea
                        value={soapOutput.objective}
                        onChange={(e) => setSoapOutput({ ...soapOutput, objective: e.target.value })}
                        className="w-full h-32 bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white resize-none"
                      />
                    </div>

                    {/* Assessment */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Assessment (A)</h3>
                        <button 
                          onClick={() => handleCopy(soapOutput.assessment, "assessment")}
                          className="text-slate-400 hover:text-emerald-500 p-1 hover:bg-slate-100 rounded-lg transition"
                        >
                          {copiedSection === "assessment" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <textarea
                        value={soapOutput.assessment}
                        onChange={(e) => setSoapOutput({ ...soapOutput, assessment: e.target.value })}
                        className="w-full h-32 bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white resize-none"
                      />
                    </div>

                    {/* Plan */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Plan (P)</h3>
                        <button 
                          onClick={() => handleCopy(soapOutput.plan, "plan")}
                          className="text-slate-400 hover:text-emerald-500 p-1 hover:bg-slate-100 rounded-lg transition"
                        >
                          {copiedSection === "plan" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <textarea
                        value={soapOutput.plan}
                        onChange={(e) => setSoapOutput({ ...soapOutput, plan: e.target.value })}
                        className="w-full h-32 bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white resize-none"
                      />
                    </div>
                  </div>
                </section>
              )}

            </div>
          )}
        </main>

      </div>
    </div>
  );
}
