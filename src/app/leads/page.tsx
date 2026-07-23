"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Search, MessageSquare, Calendar, UserCheck, Play, Pause, 
  RefreshCw, Save, AlertTriangle, User, Mail, Phone, 
  Clock, MapPin, Activity, ChevronRight, X, Heart, ShieldAlert 
} from "lucide-react";

// Standardize phone number for querying chat history
function formatPhoneE164(phone: string): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  const clean10 = clean.slice(-10);
  return clean10 ? `+1${clean10}` : phone;
}

export default function LeadsDashboard() {
  const [leads, setLeads] = useState<any[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [takeoverFilter, setTakeoverFilter] = useState("ALL"); // ALL, PAUSED, ACTIVE
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [conversation, setConversation] = useState<any[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [topStatuses, setTopStatuses] = useState<any[]>([]);
  const [conversionRate, setConversionRate] = useState(0);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    pendingTakeover: 0,
    booked: 0,
    followingUp: 0,
    win: 0
  });

  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editInsuranceType, setEditInsuranceType] = useState("");
  const [editInsuranceCarrier, setEditInsuranceCarrier] = useState("");
  const [editClaimNumber, setEditClaimNumber] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  const statusOptions = [
    "NEW", "CONTACTED", "BOOKED", "WIN",
    "contacted", "booked", "win", "answered", "no respond", "show up", "no show",
    "following up 1", "following up 2", "following up 3", "following up 4",
    "ongoing"
  ];

  // Load leads
  async function fetchLeads() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Map database 'finished' status to client 'WIN' status
      const loadedLeads = (data || []).map((l: any) => ({
        ...l,
        status: l.status === "finished" ? "WIN" : l.status
      }));
      setLeads(loadedLeads);
      
      // Calculate Stats
      const total = loadedLeads.length;
      const pendingTakeover = loadedLeads.filter(l => l.pause_emma || l.pending_human_reply).length;
      const booked = loadedLeads.filter(l => l.status === "BOOKED" || l.status === "booked").length;
      const followingUp = loadedLeads.filter(l => 
        (l.status || "").toLowerCase().includes("following up") || 
        l.status === "CONTACTED"
      ).length;
      const win = loadedLeads.filter(l => l.status === "WIN" || l.status === "win").length;

      setStats({ total, pendingTakeover, booked, followingUp, win });

      // Calculate conversion rate: win / total
      const rate = total > 0 ? Math.round((win / total) * 100) : 0;
      setConversionRate(rate);

      // Count all statuses
      const statusCounts: Record<string, number> = {};
      loadedLeads.forEach(l => {
        const s = l.status || "NEW";
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });

      // Sort statuses by count descending
      const sortedStatuses = Object.keys(statusCounts)
        .map(status => ({ status, count: statusCounts[status] }))
        .sort((a, b) => b.count - a.count);

      // Filter out the main ones that are already in the first row to avoid redundancy
      const excluded = ["NEW", "CONTACTED", "BOOKED", "WIN", "new", "contacted", "booked", "win"];
      const topOtherStatuses = sortedStatuses
        .filter(item => !excluded.includes(item.status))
        .slice(0, 4);

      setTopStatuses(topOtherStatuses);
      
      // Keep selected lead sync
      if (selectedLead) {
        const updatedSelected = loadedLeads.find(l => l.id === selectedLead.id);
        if (updatedSelected) {
          setSelectedLead(updatedSelected);
        }
      }
    } catch (err: any) {
      console.error("Error fetching leads:", err.message);
      alert("Failed to load leads: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Load chat history for selected lead
  async function fetchChat(phone: string) {
    if (!phone) return;
    setLoadingChat(true);
    try {
      const formatted = formatPhoneE164(phone);
      const { data, error } = await supabase
        .from("sms_conversations")
        .select("*")
        .eq("phone", formatted)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setConversation(data || []);
    } catch (err: any) {
      console.error("Error fetching chat:", err.message);
    } finally {
      setLoadingChat(false);
    }
  }

  // Keep a ref of selectedLead to avoid re-subscribing realtime listener on selectedLead change
  const selectedLeadRef = useRef<any>(null);
  useEffect(() => {
    selectedLeadRef.current = selectedLead;
  }, [selectedLead]);

  // Initial load & Supabase Realtime Subscription + 60s fallback polling
  useEffect(() => {
    fetchLeads();

    // Subscribe to leads table changes in real-time
    const leadsChannel = supabase
      .channel("leads-realtime-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload) => {
          console.log("Realtime leads update received:", payload);
          fetchLeads();
        }
      )
      .subscribe();

    // Subscribe to chat message updates so the open chat window updates in real-time
    const chatChannel = supabase
      .channel("chat-realtime-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_conversations" },
        (payload) => {
          console.log("Realtime message received:", payload);
          fetchLeads();
          const currentLead = selectedLeadRef.current;
          if (currentLead) {
            const formattedSelected = formatPhoneE164(currentLead.phone);
            const formattedIncoming = formatPhoneE164(payload.new.phone);
            if (formattedSelected === formattedIncoming) {
              fetchChat(currentLead.phone);
            }
          }
        }
      )
      .subscribe();

    // Fallback polling interval every 60 seconds
    const fallbackInterval = setInterval(() => {
      fetchLeads();
      const currentLead = selectedLeadRef.current;
      if (currentLead) {
        fetchChat(currentLead.phone);
      }
    }, 60000);

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(chatChannel);
      clearInterval(fallbackInterval);
    };
  }, []);

  // Fetch chat when lead is selected
  useEffect(() => {
    if (selectedLead) {
      fetchChat(selectedLead.phone);
      // Reset editor state
      setIsEditing(false);
      setEditName(selectedLead.name || "");
      setEditEmail(selectedLead.email || "");
      setEditCondition(selectedLead.condition || "");
      setEditLocation(selectedLead.location || "");
      setEditNotes(selectedLead.notes || "");
      setEditDob(selectedLead.dob || "");
      setEditInsuranceType(selectedLead.insurance_type || "");
      setEditInsuranceCarrier(selectedLead.insurance_carrier || "");
      setEditClaimNumber(selectedLead.claim_number || "");
    } else {
      setConversation([]);
    }
  }, [selectedLead]);

  // Apply filters
  useEffect(() => {
    let result = [...leads];

    // Status filter
    if (statusFilter === "ALL") {
      // By default, only keep active leads that need ongoing follow-up/action
      const activeStatuses = [
        "new", "contacted", "booked", "answered", 
        "ongoing", "ongoing_sms", 
        "following up 1", "following up 2", "following up 3", "following up 4", "following up", 
        "no respond", "no response", "no show"
      ];
      result = result.filter(l => {
        const s = (l.status || "new").toLowerCase().trim();
        return activeStatuses.includes(s);
      });
    } else {
      // If a specific status filter is selected, show that status exactly
      result = result.filter(l => (l.status || "").toLowerCase().trim() === statusFilter.toLowerCase().trim());
    }

    // Search term
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(l => 
        (l.name || "").toLowerCase().includes(lower) ||
        (l.phone || "").includes(lower) ||
        (l.condition || "").toLowerCase().includes(lower) ||
        (l.notes || "").toLowerCase().includes(lower)
      );
    }

    // Emma takeover filter
    if (takeoverFilter === "PAUSED") {
      result = result.filter(l => l.pause_emma || l.pending_human_reply);
    } else if (takeoverFilter === "ACTIVE") {
      result = result.filter(l => !l.pause_emma && !l.pending_human_reply);
    }

    setFilteredLeads(result);
  }, [leads, searchTerm, statusFilter, takeoverFilter]);

  // Change lead status
  async function handleStatusChange(leadId: string, newStatus: string) {
    try {
      // If new status is WIN or win, automatically pause Emma and clear pending reply
      // Also map 'WIN'/'win' to 'finished' database status
      const dbStatus = (newStatus === "WIN" || newStatus === "win") ? "finished" : newStatus;
      const updates: any = { status: dbStatus };
      if (newStatus === "WIN" || newStatus === "win") {
        updates.pause_emma = true;
        updates.pending_human_reply = false;
      }

      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", leadId);

      if (error) throw error;
      
      // Update local state quickly (keep status as client-side 'WIN' so filters work)
      const localUpdates = { ...updates, status: newStatus };
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...localUpdates } : l));
      
      // Clear selected lead if it was the one marked as win (since it is filtered out)
      if ((newStatus === "WIN" || newStatus === "win") && selectedLeadRef.current?.id === leadId) {
        setSelectedLead(null);
      }
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  }

  // Toggle Emma Pause/Takeover
  async function handleToggleTakeover(lead: any) {
    const nextPause = !lead.pause_emma;
    try {
      const { error } = await supabase
        .from("leads")
        .update({ 
          pause_emma: nextPause,
          pending_human_reply: nextPause // Clear pending reply flag if resuming AI
        })
        .eq("id", lead.id);

      if (error) throw error;
      
      setLeads(prev => prev.map(l => 
        l.id === lead.id ? { ...l, pause_emma: nextPause, pending_human_reply: nextPause } : l
      ));
    } catch (err: any) {
      alert("Failed to toggle AI override: " + err.message);
    }
  }

  // Save Lead Edits
  async function handleSaveLeadEdits() {
    if (!selectedLead) return;
    setSavingLead(true);
    try {
      const updates = {
        name: editName,
        email: editEmail || null,
        condition: editCondition || null,
        location: editLocation || null,
        notes: editNotes || null,
        dob: editDob || null,
        insurance_type: editInsuranceType || null,
        insurance_carrier: editInsuranceCarrier || null,
        claim_number: editClaimNumber || null,
      };

      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", selectedLead.id)
        .select()
        .single();

      if (error) throw error;
      
      // Refresh list
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? data : l));
      setSelectedLead(data);
      setIsEditing(false);
    } catch (err: any) {
      alert("Failed to save changes: " + err.message);
    } finally {
      setSavingLead(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Upper Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 flex items-center justify-between shadow-sm shadow-slate-100">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-md shadow-emerald-500/20">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">AcuTherapy Clinic Leads Hub</h1>
            <p className="text-xs text-slate-500">Real-time AI SMS Agent Monitoring & Lead Management</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchLeads}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <a 
            href="/"
            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200"
          >
            Go to Lead Form ➔
          </a>
        </div>
      </header>

      {/* Stats Summary Panel */}
      <section className="px-6 pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Leads</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{stats.total}</h3>
          </div>
          <div 
            className="bg-blue-50 text-blue-600 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner"
            title="Conversion Rate (Win / Total Leads)"
          >
            {conversionRate}%
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md">
          <div>
            <p className="text-sm font-medium text-slate-500">Needs Human Attention</p>
            <h3 className="text-3xl font-black text-amber-600 mt-1">{stats.pendingTakeover}</h3>
          </div>
          <div 
            className="bg-amber-50 text-amber-600 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner"
            title="Percentage of leads requiring human attention"
          >
            {stats.total > 0 ? Math.round((stats.pendingTakeover / stats.total) * 100) : 0}%
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md">
          <div>
            <p className="text-sm font-medium text-slate-500">Booked Patients</p>
            <h3 className="text-3xl font-black text-emerald-600 mt-1">{stats.booked}</h3>
          </div>
          <div 
            className="bg-emerald-50 text-emerald-600 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner"
            title="Percentage of booked patients"
          >
            {stats.total > 0 ? Math.round((stats.booked / stats.total) * 100) : 0}%
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md">
          <div>
            <p className="text-sm font-medium text-slate-500">Converted (Win)</p>
            <h3 className="text-3xl font-black text-indigo-600 mt-1">{stats.win}</h3>
          </div>
          <div 
            className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner"
            title="Percentage of converted leads"
          >
            {stats.total > 0 ? Math.round((stats.win / stats.total) * 100) : 0}%
          </div>
        </div>
      </section>

      {/* Second Row: Top 4 Dynamic Status Stats */}
      {topStatuses.length > 0 && (
        <section className="px-6 pt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          {topStatuses.map((item, idx) => {
            const colors = getStatusColor(item.status);
            const percentage = stats.total > 0 ? Math.round((item.count / stats.total) * 100) : 0;
            
            return (
              <div 
                key={idx} 
                className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md cursor-pointer"
                onClick={() => setStatusFilter(item.status)}
                title={`Click to filter by ${item.status}`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-500 capitalize">{item.status}</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">{item.count}</h3>
                </div>
                <div className={`${colors.iconBg} ${colors.text} w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner`}>
                  {percentage}%
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Main Workspace Split Layout */}
      <main className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Section: Leads List Panel */}
        <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-50/50">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div className="flex w-full md:w-auto gap-2 items-center">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">All Statuses</option>
                {statusOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <select
                value={takeoverFilter}
                onChange={(e) => setTakeoverFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">All AI Modes</option>
                <option value="PAUSED">Paused (Needs Human)</option>
                <option value="ACTIVE">Active AI</option>
              </select>
            </div>
          </div>

          {/* Leads Grid/List */}
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400 font-semibold flex items-center justify-center gap-3">
                <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                Loading leads...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No leads found matching current criteria.</div>
            ) : (
              filteredLeads.map((lead) => {
                const needsAttention = lead.pause_emma || lead.pending_human_reply;
                const isSelected = selectedLead?.id === lead.id;
                
                return (
                  <div 
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`p-4 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                      isSelected 
                        ? 'bg-emerald-50/40 border-l-4 border-emerald-500' 
                        : needsAttention 
                          ? 'bg-amber-50/20 hover:bg-slate-50 border-l-4 border-amber-400' 
                          : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-900 truncate">{lead.name}</h4>
                        {needsAttention && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="h-3 w-3" />
                            TAKE OVER
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-1">📞 {lead.phone} | {lead.condition || "No complaint stated"}</p>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(lead.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      {/* Inline Status Dropdown */}
                      <select
                        value={lead.status || "NEW"}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className={`text-[11px] font-bold px-2 py-1 rounded-full border focus:outline-none transition-all ${
                          lead.status === "BOOKED" || lead.status === "booked"
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : lead.status === "OPTED_OUT"
                              ? 'bg-slate-100 text-slate-800 border-slate-200'
                              : lead.status === "answered"
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {statusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>

                      {/* Takeover Control Toggle Button */}
                      <button
                        onClick={() => handleToggleTakeover(lead)}
                        className={`p-2 rounded-xl transition-all ${
                          lead.pause_emma
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={lead.pause_emma ? "Resume AI Outreach" : "Pause AI & Take Over"}
                      >
                        {lead.pause_emma ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </button>

                      <ChevronRight className="h-5 w-5 text-slate-300" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Section: Details drawer + Chat history log */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {selectedLead ? (
            <>
              {/* Lead Information Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                  <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
                    <User className="h-5 w-5 text-emerald-500" />
                    Lead Information
                  </h3>
                  <div className="flex gap-2">
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition-all"
                      >
                        Edit Details
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-xl transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveLeadEdits}
                          disabled={savingLead}
                          className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all"
                        >
                          <Save className="h-3 w-3" />
                          {savingLead ? "Saving..." : "Save"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  /* Editing Mode Form */
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">FULL NAME</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">EMAIL ADDRESS</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">CHIEF COMPLAINT</label>
                      <input
                        type="text"
                        value={editCondition}
                        onChange={(e) => setEditCondition(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">PREFERRED LOCATION</label>
                      <input
                        type="text"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">DATE OF BIRTH (DOB)</label>
                      <input
                        type="text"
                        value={editDob}
                        onChange={(e) => setEditDob(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">INSURANCE TYPE</label>
                        <input
                          type="text"
                          value={editInsuranceType}
                          onChange={(e) => setEditInsuranceType(e.target.value)}
                          placeholder="e.g. Health, Auto PIP"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">CARRIER</label>
                        <input
                          type="text"
                          value={editInsuranceCarrier}
                          onChange={(e) => setEditInsuranceCarrier(e.target.value)}
                          placeholder="e.g. HMSA, Kaiser"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">CLAIM NUMBER</label>
                      <input
                        type="text"
                        value={editClaimNumber}
                        onChange={(e) => setEditClaimNumber(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">INTERNAL NOTES</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                      />
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">NAME</span>
                        <span className="font-bold text-slate-900 block">{selectedLead.name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">PHONE</span>
                        <span className="font-medium text-slate-700 block flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {selectedLead.phone}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">EMAIL</span>
                        <span className="font-medium text-slate-700 block flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 text-slate-400" />
                          {selectedLead.email || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">DOB</span>
                        <span className="font-medium text-slate-700 block">{selectedLead.dob || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">PREFERRED LOCATION</span>
                        <span className="font-medium text-slate-700 block flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {selectedLead.location || "N/A"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">CHIEF COMPLAINT</span>
                        <span className="font-medium text-slate-700 block">{selectedLead.condition || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">INSURANCE</span>
                        <span className="font-medium text-slate-700 block">
                          {selectedLead.insurance_type 
                            ? `${selectedLead.insurance_type} (${selectedLead.insurance_carrier || "Unknown"})` 
                            : "N/A"}
                        </span>
                      </div>
                      {selectedLead.claim_number && (
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block">CLAIM NUMBER</span>
                          <span className="font-medium text-slate-700 block">{selectedLead.claim_number}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">INTERNAL NOTES</span>
                        <span className="font-normal text-slate-600 block text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-24 overflow-y-auto whitespace-pre-line">
                          {selectedLead.notes || "No notes saved."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat conversations display */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[400px]">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <MessageSquare className="h-4.5 w-4.5 text-emerald-500" />
                    SMS Conversation Log
                  </h3>
                  <button 
                    onClick={() => fetchChat(selectedLead.phone)} 
                    disabled={loadingChat}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition-all"
                    title="Refresh Chat Logs"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingChat ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-3 flex flex-col">
                  {loadingChat ? (
                    <div className="text-center text-slate-400 py-8 flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-emerald-500" />
                      Loading chat history...
                    </div>
                  ) : conversation.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 my-auto">No message history found for this phone number.</div>
                  ) : (
                    conversation.map((msg, index) => {
                      const isUser = msg.role === "user";
                      
                      return (
                        <div 
                          key={msg.id || index}
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs relative ${
                            isUser
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-100 self-start rounded-tl-none shadow-sm'
                              : 'bg-slate-900 text-slate-50 self-end rounded-tr-none shadow-md shadow-slate-900/5'
                          }`}
                        >
                          <p className="whitespace-pre-line leading-relaxed font-normal">{msg.message}</p>
                          <span className={`block text-[8px] text-right mt-1.5 ${isUser ? 'text-emerald-500/80' : 'text-slate-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Selected Placeholder Alert */
            <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center text-slate-400 flex flex-col items-center justify-center gap-3 min-h-[300px]">
              <MessageSquare className="h-10 w-10 text-slate-300" />
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm mb-1">No Lead Selected</h4>
                <p className="text-xs">Click on any patient lead from the list to view their full details, internal notes, and SMS conversation history with Emma.</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s.includes("win")) return { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-50" };
  if (s.includes("ongoing")) return { bg: "bg-teal-50", text: "text-teal-600", iconBg: "bg-teal-50" };
  if (s.includes("no respond") || s.includes("no response")) return { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-50" };
  if (s.includes("no coverage")) return { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-50" };
  if (s.includes("canceled") || s.includes("cancel")) return { bg: "bg-slate-100", text: "text-slate-600", iconBg: "bg-slate-100" };
  if (s.includes("show up")) return { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-50" };
  if (s.includes("no show")) return { bg: "bg-red-50", text: "text-red-600", iconBg: "bg-red-50" };
  if (s.includes("finished")) return { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-50" };
  if (s.includes("answered")) return { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-50" };
  return { bg: "bg-slate-50", text: "text-slate-600", iconBg: "bg-slate-50" };
}


