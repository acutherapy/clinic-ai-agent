"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Briefcase, Search, RefreshCw, ChevronRight, User, 
  ExternalLink, Car, Shield, Calendar, Award, AlertTriangle, 
  HeartPulse, FileText, CheckCircle2, XCircle
} from "lucide-react";

export default function CasesDashboard() {
  const [cases, setCases] = useState<any[]>([]);
  const [filteredCases, setFilteredCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("active"); // default to active cases
  const [limitFilter, setLimitFilter] = useState("ALL"); // ALL, NEAR_LIMIT, EXCEEDED

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    auto: 0,
    wc: 0,
    nearLimit: 0,
    exceeded: 0
  });

  useEffect(() => {
    fetchCases();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [cases, searchTerm, typeFilter, statusFilter, limitFilter]);

  async function fetchCases() {
    setLoading(true);
    try {
      // Fetch cases with patient (leads) relationship info
      const { data, error } = await supabase
        .from("injury_cases")
        .select(`
          *,
          patient:leads(id, name, dob, ssn, phone)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCases(data || []);
    } catch (err: any) {
      console.error("Error loading clinical cases:", err.message);
      alert("Failed to load cases: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let result = [...cases];

    // Search query filter (matches patient name, claim number, insurer, doctor)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(c => 
        (c.patient?.name || "").toLowerCase().includes(q) ||
        (c.claim_number || "").toLowerCase().includes(q) ||
        (c.insurance_carrier || "").toLowerCase().includes(q) ||
        (c.referring_doctor || "").toLowerCase().includes(q) ||
        (c.treating_doctor || "").toLowerCase().includes(q)
      );
    }

    // Case Type filter
    if (typeFilter !== "ALL") {
      result = result.filter(c => c.case_type === typeFilter);
    }

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter(c => c.status === statusFilter);
    }

    // Limit warning filter (Near limit is defined as >= 80% used)
    if (limitFilter === "NEAR_LIMIT") {
      result = result.filter(c => {
        const auth = c.authorized_visits || 12;
        const used = c.used_visits || 0;
        return used >= auth * 0.8 && used < auth;
      });
    } else if (limitFilter === "EXCEEDED") {
      result = result.filter(c => {
        const auth = c.authorized_visits || 12;
        const used = c.used_visits || 0;
        return used >= auth;
      });
    }

    setFilteredCases(result);

    // Calculate Stats
    const total = cases.length;
    const active = cases.filter(c => c.status === "active").length;
    const auto = cases.filter(c => c.case_type === "auto_injury").length;
    const wc = cases.filter(c => c.case_type === "workers_comp").length;
    
    let nearLimit = 0;
    let exceeded = 0;
    
    cases.forEach(c => {
      const auth = c.authorized_visits || 12;
      const used = c.used_visits || 0;
      if (used >= auth) exceeded++;
      else if (used >= auth * 0.8) nearLimit++;
    });

    setStats({ total, active, auto, wc, nearLimit, exceeded });
  }

  // Helper to format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm shadow-slate-100">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-md shadow-emerald-500/20">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Patient Case Profiles Dashboard</h1>
            <p className="text-xs text-slate-500">Master Insurance & PIP Case Registry for PIP/SOAP Compliance</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a 
            href="/clinical-hub"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition shadow-sm"
          >
            <HeartPulse className="h-4 w-4 text-emerald-500" />
            SOAP Portal
          </a>
          <a 
            href="/leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition shadow-sm"
          >
            <User className="h-4 w-4 text-slate-400" />
            Leads / CRM
          </a>
          <button 
            onClick={fetchCases}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 transition shadow-sm"
            title="Refresh List"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Cases</span>
            <span className="text-2xl font-black text-slate-950 mt-1">{stats.total}</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Active Cases</span>
            <span className="text-2xl font-black text-emerald-600 mt-1">{stats.active}</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Auto / PIP</span>
            <span className="text-2xl font-black text-blue-600 mt-1">{stats.auto}</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Workers' Comp</span>
            <span className="text-2xl font-black text-purple-600 mt-1">{stats.wc}</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between border-l-4 border-l-amber-500">
            <span className="text-[10px] font-bold text-amber-500 uppercase">Near Limit</span>
            <span className="text-2xl font-black text-amber-600 mt-1">{stats.nearLimit}</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between border-l-4 border-l-rose-500">
            <span className="text-[10px] font-bold text-rose-500 uppercase">Exceeded</span>
            <span className="text-2xl font-black text-rose-600 mt-1">{stats.exceeded}</span>
          </div>
        </section>

        {/* Filter Toolbar */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search patient, insurer, claim, doctor..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {/* Case Type Filter */}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase ml-1">Case Type</span>
              <select 
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Types</option>
                <option value="auto_injury">🚗 Auto Cases</option>
                <option value="workers_comp">🛠️ Workers' Comp</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase ml-1">Status</span>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">🟢 Active Case</option>
                <option value="closed">🔴 Closed Case</option>
              </select>
            </div>

            {/* Limit Warning Filter */}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase ml-1">Usage Limit</span>
              <select 
                value={limitFilter}
                onChange={(e) => setLimitFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Usage</option>
                <option value="NEAR_LIMIT">⚠️ Near Limit (≥80%)</option>
                <option value="EXCEEDED">🚨 Exceeded (≥100%)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Master Table Card */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin" />
              <p className="text-xs font-bold text-slate-500">Loading cases registry...</p>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <Briefcase className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No cases match your filters.</p>
              <p className="text-xs text-slate-400">Try widening your search or changing active filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Patient</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Case Type</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Insurer & Claim #</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Treating / Referring MD</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Visit Capacity Progress</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-center">Dates (DOI / Intake)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-center">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredCases.map((c) => {
                    const auth = c.authorized_visits || 12;
                    const used = c.used_visits || 0;
                    const pct = Math.min(Math.round((used / auth) * 100), 100);
                    
                    let progressColor = "bg-emerald-500";
                    let progressBg = "bg-emerald-50 text-emerald-700";
                    if (used >= auth) {
                      progressColor = "bg-rose-500 animate-pulse";
                      progressBg = "bg-rose-50 text-rose-700 border border-rose-100";
                    } else if (used >= auth * 0.8) {
                      progressColor = "bg-amber-500";
                      progressBg = "bg-amber-50 text-amber-700 border border-amber-100";
                    }

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition">
                        {/* Patient info */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-slate-900 text-sm hover:underline hover:text-emerald-600">
                              <a href={`/clinical-hub?patientId=${c.patient?.id}&caseId=${c.id}`}>
                                {c.patient?.name || "Unknown Patient"}
                              </a>
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold mt-0.5">
                              DOB: {c.patient?.dob ? formatDate(c.patient.dob) : "N/A"} 
                              {c.patient?.ssn && ` | SSN: ${c.patient.ssn}`}
                            </span>
                          </div>
                        </td>

                        {/* Case Type badge */}
                        <td className="px-6 py-4">
                          {c.case_type === "auto_injury" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black border border-blue-100">
                              <Car className="h-3 w-3" />
                              🚗 AUTO/PIP
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-[10px] font-black border border-purple-100">
                              <Shield className="h-3 w-3" />
                              🛠️ WORKERS COMP
                            </span>
                          )}
                        </td>

                        {/* Claim Number and Carrier */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-black text-slate-800">{c.insurance_carrier || "N/A"}</span>
                            <span className="text-[10px] font-extrabold text-slate-500 mt-0.5">Claim: {c.claim_number || "N/A"}</span>
                          </div>
                        </td>

                        {/* Doctors details */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-800">Treating: {c.treating_doctor || "David Cai"}</span>
                            <span className="text-[10px] font-medium text-slate-400 mt-0.5">Ref: {c.referring_doctor || "None"}</span>
                          </div>
                        </td>

                        {/* Progress meter */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col w-44">
                            <div className="flex justify-between items-center mb-1 text-[10px] font-bold">
                              <span className={`px-1.5 py-0.5 rounded-md ${progressBg} font-black`}>
                                {used} / {auth} Visits ({pct}%)
                              </span>
                              {used >= auth && (
                                <span className="inline-flex items-center text-[9px] font-bold text-rose-600 animate-pulse">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" /> EXCEEDED
                                </span>
                              )}
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                              <div 
                                className={`h-full rounded-full ${progressColor}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Dates */}
                        <td className="px-6 py-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="text-[10px] text-slate-400 font-bold">DOI (受伤): {formatDate(c.injury_date)}</span>
                            <span className="text-[10px] text-slate-600 font-extrabold mt-0.5">Intake: {formatDate(c.intake_date)}</span>
                          </div>
                        </td>

                        {/* Status badge */}
                        <td className="px-6 py-4 text-center">
                          {c.status === "active" ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-100">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-extrabold border border-slate-200">
                              <XCircle className="h-3 w-3 text-slate-400" />
                              Closed
                            </span>
                          )}
                        </td>

                        {/* Action buttons */}
                        <td className="px-6 py-4 text-right">
                          <a 
                            href={`/clinical-hub?patientId=${c.patient?.id}&caseId=${c.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-100 transition shadow-sm"
                          >
                            <span>Open SOAP</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
