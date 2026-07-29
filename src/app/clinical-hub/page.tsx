"use client";

import React, { useState, useEffect } from "react";
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
  Check, 
  ChevronRight, 
  AlertCircle,
  FileText,
  Briefcase,
  Lock,
  PlusCircle,
  FolderOpen
} from "lucide-react";

export default function ClinicalHub() {
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Injury Cases State
  const [patientCases, setPatientCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [showCreateCaseForm, setShowCreateCaseForm] = useState(false);

  // New Injury Case Form State - Patient Info (Updates Leads)
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newGender, setNewGender] = useState("his");
  const [newSsn, setNewSsn] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");

  // New Injury Case Form State - Insurance Case Details
  const [newCaseType, setNewCaseType] = useState("auto_injury");
  const [newCarrier, setNewCarrier] = useState("");
  const [newClaimNumber, setNewClaimNumber] = useState("");
  const [newPolicyHolder, setNewPolicyHolder] = useState("");
  const [newAdjusterName, setNewAdjusterName] = useState("");
  const [newAdjusterPhone, setNewAdjusterPhone] = useState("");
  const [newAdjusterFax, setNewAdjusterFax] = useState("");
  const [newClaimMailingAddress, setNewClaimMailingAddress] = useState("");
  const [newAttorneyName, setNewAttorneyName] = useState("");
  const [newAttorneyPhone, setNewAttorneyPhone] = useState("");
  const [newReferringDoc, setNewReferringDoc] = useState("");
  const [newReferringDocNpi, setNewReferringDocNpi] = useState("");
  const [newTreatingDoc, setNewTreatingDoc] = useState("");
  const [newDoi, setNewDoi] = useState("");
  const [newIntakeDate, setNewIntakeDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newAuthVisits, setNewAuthVisits] = useState(12);
  const [newFrequency, setNewFrequency] = useState("2 times per week for 6 weeks");
  const [newCaseIcds, setNewCaseIcds] = useState<any[]>([]);
  const [newCaseSearchQuery, setNewCaseSearchQuery] = useState("");
  const [newCaseSearchIcds, setNewCaseSearchIcds] = useState<any[]>([]);
  const [creatingCase, setCreatingCase] = useState(false);

  // Daily SOAP Encounter Form State
  const [encounterDate, setEncounterDate] = useState("");
  const [injuryDate, setInjuryDate] = useState("");
  const [injuryType, setInjuryType] = useState<"auto" | "work" | null>(null);
  const [position, setPosition] = useState("Supine");
  const [principle, setPrinciple] = useState("BL62 - SI03");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([
    "Acupuncture & Heat lamp",
    "Electrical"
  ]);

  // Daily Diagnoses list: Array of { icdCode, complaintText, painLevel }
  const [activeDiagnoses, setActiveDiagnoses] = useState<any[]>([]);

  // Daily ICD-10 Search Autocomplete
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
    const today = new Date().toISOString().split("T")[0];
    setEncounterDate(today);
  }, []);

  async function fetchLeads() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (err: any) {
      console.error("Error fetching patient leads:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch injury cases when patient changes
  async function fetchPatientCases(patientId: string) {
    try {
      const { data, error } = await supabase
        .from("injury_cases")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPatientCases(data);
        if (data.length > 0) {
          // Default to the first active case
          handleSelectCase(data[0]);
        } else {
          setSelectedCase(null);
          // Fallback to manual entry
          setActiveDiagnoses([
            { icdCode: "M54.5", complaintText: "Lower Back Pain", painLevel: 6 }
          ]);
          setInjuryType(null);
          setInjuryDate("");
        }
      } else {
        setPatientCases([]);
        setSelectedCase(null);
      }
    } catch (err) {
      console.error("Error fetching injury cases:", err);
    }
  }

  // Handle patient selection change
  function handleSelectPatient(patient: any) {
    setSelectedLead(patient);
    setSoapOutput(null);
    setShowCreateCaseForm(false);

    // Auto-prefill the case creator patient fields with current profile information
    const nameParts = (patient.name || "").trim().split(/\s+/);
    const fName = patient.first_name || nameParts[0] || "";
    const lName = patient.last_name || nameParts.slice(1).join(" ") || "";
    setNewFirstName(fName);
    setNewLastName(lName);
    setNewDob(patient.dob || "");
    setNewGender(patient.gender || "his");
    setNewSsn(patient.ssn || "");
    setNewAddress(patient.address || "");
    setNewCity(patient.city || "");
    setNewState(patient.state || "");
    setNewZip(patient.zip || "");

    fetchPatientCases(patient.id);
  }

  // Handle case selection
  async function handleSelectCase(injuryCase: any) {
    if (!injuryCase) {
      setSelectedCase(null);
      setInjuryType(null);
      setInjuryDate("");
      setActiveDiagnoses([
        { icdCode: "M54.5", complaintText: "Lower Back Pain", painLevel: 6 }
      ]);
      return;
    }

    setSelectedCase(injuryCase);
    setInjuryType(injuryCase.case_type === "auto_injury" ? "auto" : "work");
    setInjuryDate(injuryCase.injury_date || "");
    
    // Load fixed ICD codes from Case
    if (injuryCase.active_icd_codes && injuryCase.active_icd_codes.length > 0) {
      // Fetch descriptions for these codes
      const { data, error } = await supabase
        .from("icd10_codes")
        .select("code, short_description")
        .in("code", injuryCase.active_icd_codes);

      if (!error && data) {
        // Map codes maintaining database descriptions and default pain scale to 6
        const mapped = injuryCase.active_icd_codes.map((code: string) => {
          const matched = data.find(d => d.code === code);
          return {
            icdCode: code,
            complaintText: matched ? matched.short_description : "Pain, unspecified",
            painLevel: 6
          };
        });
        setActiveDiagnoses(mapped);
      } else {
        // Fallback mapping if fetch failed
        setActiveDiagnoses(injuryCase.active_icd_codes.map((code: string) => ({
          icdCode: code,
          complaintText: "Pain/Injury symptom",
          painLevel: 6
        })));
      }
    } else {
      setActiveDiagnoses([]);
    }
  }

  // Custom handler to parse comma-separated pastes/inputs instantly
  async function handleIcdSearchChange(val: string, isCaseCreator: boolean) {
    if (isCaseCreator) {
      setNewCaseSearchQuery(val);
      if (val.includes(",")) {
        const rawCodes = val.split(",").map(c => c.trim()).filter(Boolean);
        const codesNoDots = rawCodes.map(c => c.replace(/\./g, "").toUpperCase());
        const { data, error } = await supabase
          .from("icd10_codes")
          .select("code, short_description")
          .in("code", codesNoDots);
        
        if (!error && data && data.length > 0) {
          setNewCaseIcds(prev => {
            const existing = new Set(prev.map(x => x.code));
            const newAdded = data.filter(d => !existing.has(d.code));
            return [...prev, ...newAdded];
          });
          setNewCaseSearchQuery("");
          setNewCaseSearchIcds([]);
        }
      }
    } else {
      setSearchQuery(val);
      if (val.includes(",")) {
        const rawCodes = val.split(",").map(c => c.trim()).filter(Boolean);
        const codesNoDots = rawCodes.map(c => c.replace(/\./g, "").toUpperCase());
        const { data, error } = await supabase
          .from("icd10_codes")
          .select("code, short_description")
          .in("code", codesNoDots);
        
        if (!error && data && data.length > 0) {
          setActiveDiagnoses(prev => {
            const existing = new Set(prev.map(x => x.icdCode));
            const newAdded = data.filter(d => !existing.has(d.code)).map(d => ({
              icdCode: d.code,
              complaintText: d.short_description,
              painLevel: 6
            }));
            return [...prev, ...newAdded];
          });
          setSearchQuery("");
          setIcdResults([]);
        }
      }
    }
  }

  // ICD-10 Autocomplete search for SOAP note
  useEffect(() => {
    const rawQuery = searchQuery.trim();
    const cleanQuery = rawQuery.replace(/\./g, "");
    if (cleanQuery.length < 2) {
      setIcdResults([]);
      return;
    }
    setSearchingIcd(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("icd10_codes")
          .select("code, short_description")
          .or(`code.ilike.%${cleanQuery}%,code_with_separator.ilike.%${rawQuery}%,short_description.ilike.%${rawQuery}%`)
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

  // ICD-10 Autocomplete search for Case Creator
  useEffect(() => {
    const rawQuery = newCaseSearchQuery.trim();
    const cleanQuery = rawQuery.replace(/\./g, "");
    if (cleanQuery.length < 2) {
      setNewCaseSearchIcds([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("icd10_codes")
          .select("code, short_description")
          .or(`code.ilike.%${cleanQuery}%,code_with_separator.ilike.%${rawQuery}%,short_description.ilike.%${rawQuery}%`)
          .limit(6);

        if (!error && data) {
          setNewCaseSearchIcds(data);
        }
      } catch (err) {
        console.error("ICD autocomplete error:", err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [newCaseSearchQuery]);

  // Add ICD diagnosis to Daily SOAP Form (only if case is NOT selected/locked)
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

  // Remove diagnosis from Daily SOAP Form
  function handleRemoveDiagnosis(index: number) {
    if (activeDiagnoses.length === 1) return;
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

  // Add ICD to the Case Creator list
  function handleAddIcdToNewCase(item: any) {
    if (newCaseIcds.some(d => d.code === item.code)) {
      setNewCaseSearchQuery("");
      setNewCaseSearchIcds([]);
      return;
    }
    setNewCaseIcds(prev => [...prev, item]);
    setNewCaseSearchQuery("");
    setNewCaseSearchIcds([]);
  }

  // Remove ICD from Case Creator list
  function handleRemoveIcdFromNewCase(code: string) {
    setNewCaseIcds(prev => prev.filter(x => x.code !== code));
  }

  // Submit/Create New Injury Case
  async function handleCreateInjuryCase(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead) return;
    if (newCaseIcds.length === 0) {
      alert("Please add at least 1 fixed ICD-10 diagnosis code for this case!");
      return;
    }

    setCreatingCase(true);
    try {
      // 1. First, save patient info back to leads table
      const { error: leadUpdateErr } = await supabase
        .from("leads")
        .update({
          first_name: newFirstName,
          last_name: newLastName,
          name: `${newFirstName} ${newLastName}`.trim(),
          dob: newDob,
          gender: newGender,
          ssn: newSsn,
          address: newAddress,
          city: newCity,
          state: newState,
          zip: newZip
        })
        .eq("id", selectedLead.id);

      if (leadUpdateErr) throw leadUpdateErr;

      // 2. Next, create the new injury case
      const { data, error } = await supabase
        .from("injury_cases")
        .insert({
          patient_id: selectedLead.id,
          case_type: newCaseType,
          insurance_carrier: newCarrier,
          claim_number: newClaimNumber,
          policy_holder: newPolicyHolder,
          adjuster_name: newAdjusterName,
          adjuster_phone: newAdjusterPhone,
          adjuster_fax: newAdjusterFax,
          claim_mailing_address: newClaimMailingAddress,
          attorney_name: newAttorneyName,
          attorney_phone: newAttorneyPhone,
          referring_doctor: newReferringDoc,
          referring_doctor_npi: newReferringDocNpi,
          treating_doctor: newTreatingDoc,
          injury_date: newDoi || null,
          intake_date: newIntakeDate || null,
          end_date: newEndDate || null,
          authorized_visits: newAuthVisits,
          treatment_frequency: newFrequency,
          active_icd_codes: newCaseIcds.map(x => x.code)
        })
        .select()
        .single();

      if (error) throw error;

      alert("🎉 Patient record updated and Injury Case successfully created!");
      
      // Reset Case Form Details
      setNewCarrier("");
      setNewClaimNumber("");
      setNewPolicyHolder("");
      setNewAdjusterName("");
      setNewAdjusterPhone("");
      setNewAdjusterFax("");
      setNewClaimMailingAddress("");
      setNewAttorneyName("");
      setNewAttorneyPhone("");
      setNewReferringDoc("");
      setNewReferringDocNpi("");
      setNewTreatingDoc("");
      setNewDoi("");
      setNewIntakeDate("");
      setNewEndDate("");
      setNewCaseIcds([]);
      setShowCreateCaseForm(false);

      // Refresh patient list and cases
      await fetchLeads();
      await fetchPatientCases(selectedLead.id);
    } catch (err: any) {
      alert("Failed to create case: " + err.message);
    } finally {
      setCreatingCase(false);
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
          injuryDate: injuryType ? injuryDate : null,
          injuryType,
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

  // Save SOAP note to Supabase
  async function handleSaveSOAP() {
    if (!soapOutput || !selectedLead) return;
    setSaving(true);
    try {
      // 1. Insert soap_notes entry
      const { error: insertErr } = await supabase
        .from("soap_notes")
        .insert({
          patient_id: selectedLead.id,
          case_id: selectedCase?.id || null,
          encounter_date: encounterDate,
          injury_date: injuryType ? injuryDate : null,
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

      if (insertErr) throw insertErr;

      // 2. Increment used_visits count on the injury case if applicable
      if (selectedCase) {
        const currentVisits = selectedCase.used_visits || 0;
        const { error: updateErr } = await supabase
          .from("injury_cases")
          .update({ used_visits: currentVisits + 1 })
          .eq("id", selectedCase.id);

        if (!updateErr) {
          // Sync client-side representation
          setSelectedCase((prev: any) => ({ ...prev, used_visits: currentVisits + 1 }));
        }
      }

      alert("✅ SOAP Note saved & Encounter visit count logged successfully!");
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
            <p className="text-xs text-slate-500">Auto PIP / Workers' Comp Shuffled Point Prescription Scribe</p>
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
              
              {/* Patient Profile & Case Directory */}
              <section className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-4">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider bg-emerald-50 px-2 py-1 rounded-md">Patient Workspace</span>
                    <h2 className="text-xl font-black text-slate-900 mt-1">{selectedLead.name}</h2>
                    <p className="text-xs text-slate-500">Phone: {selectedLead.phone} | Notes: {selectedLead.notes || "None"}</p>
                  </div>
                  
                  {/* Create New Case Action */}
                  <button 
                    onClick={() => {
                      setShowCreateCaseForm(!showCreateCaseForm);
                      setSoapOutput(null);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 self-start sm:self-auto shadow-sm"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {showCreateCaseForm ? "Cancel New Case" : "New Injury Case"}
                  </button>
                </div>

                {/* Case Selector (Only show if not in creation form) */}
                {!showCreateCaseForm && (
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase text-slate-400 flex items-center gap-1.5">
                      <FolderOpen className="h-4 w-4 text-emerald-500" /> Active Injury / Insurance Cases
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleSelectCase(null)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                          !selectedCase 
                            ? "bg-slate-900 border-slate-900 text-white" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Standard Health / Cash (Manual Entry)
                      </button>

                      {patientCases.map((c) => {
                        const isSelected = selectedCase?.id === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => handleSelectCase(c)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                              isSelected 
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" 
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <Briefcase className="h-3.5 w-3.5" />
                            {c.case_type === "auto_injury" ? "🚗 Auto Case" : "💼 WC Case"} - {c.insurance_carrier || "Carrier"} ({c.claim_number || "No Claim#"})
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              Visit {c.used_visits}/{c.authorized_visits}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Create Case Form Panel */}
              {showCreateCaseForm && (
                <section className="bg-white p-6 rounded-3xl border border-rose-200/50 shadow-lg space-y-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-lg font-black text-rose-950 flex items-center gap-2">
                      <Briefcase className="text-rose-500 h-5 w-5" /> Setup Auto/WC Clinical Injury Case
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Configure the insurance claims, referring doctors, and fix the 3-4 active ICD-10 diagnosis codes.
                    </p>
                  </div>

                  <form onSubmit={handleCreateInjuryCase} className="space-y-6">
                    
                    {/* SECTION 1: Patient Personal Demographics (图 1) */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-2">
                        1. Patient Personal Info
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">First Name</label>
                          <input
                            type="text"
                            required
                            placeholder="First Name"
                            value={newFirstName}
                            onChange={(e) => setNewFirstName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Last Name</label>
                          <input
                            type="text"
                            required
                            placeholder="Last Name"
                            value={newLastName}
                            onChange={(e) => setNewLastName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Date of Birth (DOB)</label>
                          <input
                            type="text"
                            placeholder="e.g. 10/24/1988"
                            value={newDob}
                            onChange={(e) => setNewDob(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Sex (Gender)</label>
                          <select
                            value={newGender}
                            onChange={(e) => setNewGender(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="her">female (her)</option>
                            <option value="his">male (his)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">SSN (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. 000-00-0000"
                            value={newSsn}
                            onChange={(e) => setNewSsn(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Street Address</label>
                          <input
                            type="text"
                            placeholder="Street Address"
                            value={newAddress}
                            onChange={(e) => setNewAddress(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">City</label>
                          <input
                            type="text"
                            placeholder="City"
                            value={newCity}
                            onChange={(e) => setNewCity(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">State</label>
                          <input
                            type="text"
                            placeholder="e.g. HI"
                            value={newState}
                            onChange={(e) => setNewState(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Zip Code</label>
                          <input
                            type="text"
                            placeholder="Zip"
                            value={newZip}
                            onChange={(e) => setNewZip(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: Insurance Claim Information (图 2) */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-2">
                        2. Insurance / Claim Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Case Type</label>
                          <select
                            value={newCaseType}
                            onChange={(e) => setNewCaseType(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="auto_injury">🚗 Auto Injury / PIP</option>
                            <option value="workers_comp">💼 Workers' Compensation</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Insurance Carrier</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. State Farm"
                            value={newCarrier}
                            onChange={(e) => setNewCarrier(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Claim Number (Claim #)</label>
                          <input
                            type="text"
                            required
                            placeholder="Claim #"
                            value={newClaimNumber}
                            onChange={(e) => setNewClaimNumber(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Policy Holder</label>
                          <input
                            type="text"
                            placeholder="Self / Other"
                            value={newPolicyHolder}
                            onChange={(e) => setNewPolicyHolder(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Date of Injury (DOI)</label>
                          <input
                            type="date"
                            required
                            value={newDoi}
                            onChange={(e) => setNewDoi(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-3">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Claim Mailing Address</label>
                          <input
                            type="text"
                            placeholder="e.g. 1600 Kapiolani Blvd #1520 Honolulu HI 96814"
                            value={newClaimMailingAddress}
                            onChange={(e) => setNewClaimMailingAddress(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Adjuster Name</label>
                          <input
                            type="text"
                            placeholder="Adjuster Name"
                            value={newAdjusterName}
                            onChange={(e) => setNewAdjusterName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Adjuster Phone</label>
                          <input
                            type="text"
                            placeholder="Adjuster Phone"
                            value={newAdjusterPhone}
                            onChange={(e) => setNewAdjusterPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Adjuster Fax</label>
                          <input
                            type="text"
                            placeholder="Adjuster Fax"
                            value={newAdjusterFax}
                            onChange={(e) => setNewAdjusterFax(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Attorney & Phone</label>
                          <input
                            type="text"
                            placeholder="e.g. Davis Law, 808-999-9999"
                            value={newAttorneyName}
                            onChange={(e) => setNewAttorneyName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: Treating / Referring Doctor & Visit Info (图 3) */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-2">
                        3. Clinical Referrals & Program Schedule
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Treating Doctor</label>
                          <input
                            type="text"
                            placeholder="e.g. Choon Kia Yeo M.D."
                            value={newTreatingDoc}
                            onChange={(e) => setNewTreatingDoc(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Referring MD</label>
                          <input
                            type="text"
                            placeholder="Referring Doctor"
                            value={newReferringDoc}
                            onChange={(e) => setNewReferringDoc(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Referring NPI</label>
                          <input
                            type="text"
                            placeholder="MD NPI#"
                            value={newReferringDocNpi}
                            onChange={(e) => setNewReferringDocNpi(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">First Visit Date</label>
                          <input
                            type="date"
                            required
                            value={newIntakeDate}
                            onChange={(e) => setNewIntakeDate(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Authorized Visits</label>
                          <input
                            type="number"
                            required
                            value={newAuthVisits}
                            onChange={(e) => setNewAuthVisits(parseInt(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Treatment Frequency</label>
                          <input
                            type="text"
                            placeholder="e.g. 3 times per week for 5 weeks"
                            value={newFrequency}
                            onChange={(e) => setNewFrequency(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">End Date (optional)</label>
                          <input
                            type="date"
                            value={newEndDate}
                            onChange={(e) => setNewEndDate(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: Fixed Case ICD-10 Codes (图 4) */}
                    <div className="space-y-3 p-4 bg-emerald-50/20 border border-emerald-200/50 rounded-2xl">
                      <label className="text-xs font-extrabold uppercase text-emerald-800 flex items-center gap-1.5">
                        <Check className="h-4 w-4 text-emerald-600" /> 4. Fix Case ICD-10 Diagnosis Codes (Add 3-4 codes)
                      </label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="Search ICD-10 or paste multiple separated by commas... (e.g. M25.512, M25.522)"
                          value={newCaseSearchQuery}
                          onChange={(e) => handleIcdSearchChange(e.target.value, true)}
                          className="flex-1 px-4 py-2 bg-white border border-emerald-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newCaseSearchQuery.trim()) {
                              const customCode = newCaseSearchQuery.replace(/\./g, "").trim().toUpperCase();
                              setNewCaseIcds(prev => [
                                ...prev,
                                { code: customCode, short_description: "Custom case complaint" }
                              ]);
                              setNewCaseSearchQuery("");
                            }
                          }}
                          className="bg-slate-850 hover:bg-slate-750 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                        >
                          Add Custom
                        </button>
                      </div>

                      {/* Dropdown Results */}
                      {newCaseSearchIcds.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 mt-1 z-10 relative">
                          {newCaseSearchIcds.map(item => (
                            <button
                              type="button"
                              key={item.code}
                              onClick={() => handleAddIcdToNewCase(item)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center"
                            >
                              <span><strong className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] mr-1.5">{item.code}</strong>{item.short_description}</span>
                              <Plus className="h-3.5 w-3.5 text-emerald-600" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Selected Codes List */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {newCaseIcds.map(c => (
                          <div key={c.code} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                            <span>{c.code} - {c.short_description}</span>
                            <button 
                              type="button" 
                              onClick={() => handleRemoveIcdFromNewCase(c.code)}
                              className="hover:bg-emerald-700 p-0.5 rounded-full"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Submit Case Button */}
                    <div className="flex justify-end pt-2 border-t border-slate-100">
                      <button
                        type="submit"
                        disabled={creatingCase}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-3 rounded-xl transition shadow-md shadow-emerald-600/10"
                      >
                        {creatingCase ? "Creating Case..." : "Save and Activate Case"}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* SOAP Form Settings Card */}
              {!showCreateCaseForm && (
                <section className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        Daily SOAP Generator: <span className="text-emerald-600">{selectedLead.name}</span>
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedCase 
                          ? `🔒 Case Linked: ${selectedCase.insurance_carrier} (Claim: ${selectedCase.claim_number}) | Frequency: ${selectedCase.treatment_frequency}`
                          : "Non-insurance encounter. Choose diagnoses manually below."
                        }</p>
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

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Injury Case Type</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="injuryTypeSelect"
                              disabled={!!selectedCase} // Disable if locked to case
                              checked={injuryType === "auto"}
                              onChange={() => {
                                setInjuryType("auto");
                              }}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            🚗 Auto Accident
                          </label>

                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="injuryTypeSelect"
                              disabled={!!selectedCase} // Disable if locked to case
                              checked={injuryType === "work"}
                              onChange={() => {
                                setInjuryType("work");
                              }}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            💼 Work Injury
                          </label>

                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="injuryTypeSelect"
                              disabled={!!selectedCase} // Disable if locked to case
                              checked={injuryType === null}
                              onChange={() => {
                                setInjuryType(null);
                                setInjuryDate("");
                              }}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            None (General)
                          </label>
                        </div>
                      </div>

                      {injuryType && (
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Date of Injury (DOI)</label>
                          <input 
                            type="date"
                            disabled={!!selectedCase} // Locked if case exists
                            value={injuryDate}
                            onChange={(e) => setInjuryDate(e.target.value)}
                            className="mt-1 px-3 py-1.5 bg-slate-50 disabled:opacity-75 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Diagnostics Selection */}
                  <div className="space-y-3">
                    <label className="text-xs font-extrabold uppercase text-slate-500 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-emerald-500" /> Active Diagnoses & Pain Levels
                    </label>

                    {/* Autocomplete Input (Locked if case selected) */}
                    {selectedCase ? (
                      <div className="bg-slate-100/80 border border-slate-200 p-3 rounded-2xl text-xs font-semibold text-slate-500 flex items-center gap-2">
                        <Lock className="h-4 w-4 text-slate-400" />
                        <span>Diagnoses are locked to this Case Profile to maintain insurance billing audit consistency. Use "Manual Entry" above to add dynamic codes.</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="Search ICD-10 or paste multiple separated by commas... (e.g. M25.512, M25.522)"
                            value={searchQuery}
                            onChange={(e) => handleIcdSearchChange(e.target.value, false)}
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (searchQuery.trim()) {
                                const customCode = searchQuery.replace(/\./g, "").trim().toUpperCase();
                                setActiveDiagnoses(prev => [
                                  ...prev,
                                  { icdCode: customCode, complaintText: "Custom clinical complaint", painLevel: 6 }
                                ]);
                                setSearchQuery("");
                              }
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-2xl transition"
                          >
                            Add Custom
                          </button>
                        </div>
                        {searchingIcd && (
                          <span className="absolute right-32 top-3.5 text-xs text-slate-400 animate-pulse">Searching...</span>
                        )}

                        {/* Results dropdown */}
                        {icdResults.length > 0 && (
                          <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg z-20 max-h-60 overflow-y-auto divide-y divide-slate-100 font-sans">
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
                    )}

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

                          {!selectedCase && (
                            <button 
                              onClick={() => handleRemoveDiagnosis(index)}
                              className="text-slate-400 hover:text-rose-500 p-1.5 hover:bg-slate-200/50 rounded-xl transition"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          )}
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
              )}

              {/* SOAP Generation Output Cards */}
              {soapOutput && !showCreateCaseForm && (
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
