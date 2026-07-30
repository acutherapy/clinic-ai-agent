"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function RfsPrintContent() {
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");
  const caseId = searchParams.get("caseId");
  
  // URL override params (fallbacks)
  const paramAuthNum = searchParams.get("authNum") || "";
  const paramFacility = searchParams.get("facility") || "Sparks M Matsunaga Department of Veterans Affairs Medical Center";
  const paramCptCodes = searchParams.get("cptCodes") || "97813x1 & 97814x3";
  const paramCptDesc = searchParams.get("cptDesc") || "Acupuncture";
  const paramReason = searchParams.get("reason") || "";
  const paramDate = searchParams.get("date") || "";

  const [patient, setPatient] = useState<any>(null);
  const [activeCase, setActiveCase] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!patientId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch patient
        const { data: pData } = await supabase
          .from("leads")
          .select("*")
          .eq("id", patientId)
          .single();
        setPatient(pData);

        // Fetch case
        if (caseId) {
          const { data: cData } = await supabase
            .from("injury_cases")
            .select("*")
            .eq("id", caseId)
            .single();
          setActiveCase(cData);
        }
      } catch (err) {
        console.error("Error loading print data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [patientId, caseId]);

  // Format today's date or custom date
  const todayStr = paramDate || new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });

  // Calculate DOB formatting
  const formattedDob = patient?.dob
    ? new Date(patient.dob).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
      })
    : "";

  const icdCode = activeCase?.active_icd_codes?.[0] || "M25.512";
  const icdDesc = icdCode.replace(/\./g, "").startsWith("M25512")
    ? "Chronic Joint Pain"
    : icdCode.replace(/\./g, "").startsWith("M545")
    ? "Lower back pain"
    : icdCode.replace(/\./g, "").startsWith("M542")
    ? "Cervicalgia"
    : "Chronic Pain";

  if (loading) {
    return <div className="p-8 text-center text-sm font-semibold text-slate-500">Loading form template...</div>;
  }

  // Custom checkbox component for 100% PDF replica look
  const CheckBox = ({ checked, label }: { checked: boolean; label: string }) => (
    <div className="flex items-center gap-1.5 select-none">
      <div className="border-[1.5px] border-black w-4.5 h-4.5 flex items-center justify-center bg-white shrink-0 rounded-sm">
        {checked && (
          <svg className="w-3.5 h-3.5 text-black stroke-[3.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="text-[8px] font-black text-slate-900 tracking-tight">{label}</span>
    </div>
  );

  return (
    <div className="bg-white text-black font-sans leading-tight min-h-screen p-2 flex flex-col justify-between" style={{ width: "8.5in", minHeight: "11in", margin: "0 auto" }}>
      {/* Google Fonts link for authentic handwritten signature */}
      <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet" />
      
      <style jsx global>{`
        @media print {
          body {
            background: white;
            color: black;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: letter;
            margin: 0.25in;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Main Form container */}
      <div className="flex-1 flex flex-col justify-between">
        
        {/* Header Title Area */}
        <div className="border-[1.5px] border-black p-1.5 mb-1.5">
          <div className="flex justify-between items-center">
            {/* Logo on the left */}
            <div className="flex items-center gap-2 border-[1.5px] border-black p-1 bg-white select-none">
              <div className="border-[1.5px] border-black font-black text-[11px] px-1.5 py-0.5 tracking-tighter flex items-center justify-center">VA</div>
              <div className="text-[7.5px] font-black leading-none tracking-tight uppercase text-left">
                DEPARTMENT OF<br />VETERANS AFFAIRS
              </div>
            </div>
            
            <div className="text-center flex-1">
              <h1 className="text-[13px] font-black tracking-tight leading-none uppercase">COMMUNITY CARE PROVIDER - MEDICAL</h1>
              <h2 className="text-[13px] font-black tracking-tight leading-none uppercase mt-0.5">REQUEST FOR SERVICE</h2>
              <p className="text-[8px] font-bold italic mt-0.5 text-slate-800">(Separate Form Required for Each Service Requested)</p>
            </div>
            
            <div className="w-[1.4in]"></div>
          </div>

          <div className="border border-black p-1.5 mt-2 bg-slate-50 text-[7.5px] leading-tight font-medium text-slate-800">
            <span className="font-extrabold text-black">Request for Service (RFS) Submission Requirements:</span> Complete the Medical or DME RFS form for services not on the original authorization or to request a new authorization for services. Only one request per form. (1) Complete RFS form 10-10172. (2) Attach appropriate medical records and care plan to support the request. (3) Have the ordering provider sign and date the form. (4) Submit request via HSRM, Fax, or Secure E-mail.
          </div>

          <div className="bg-slate-50 text-slate-500 border border-t-0 border-black text-center text-[7.5px] font-bold py-0.5 tracking-wide uppercase">
            NOTE: Requests are approved/denied at the VA facility's discretion and supporting documentation must accompany each request.
          </div>
        </div>

        {/* SECTION I: VETERAN & ORDERING PROVIDER INFORMATION */}
        <div className="border-[1.5px] border-black mb-1.5">
          <div className="bg-slate-900 text-white text-center text-[8.5px] font-black uppercase tracking-wider py-0.5 border-b border-black">
            SECTION I: VETERAN & ORDERING PROVIDER INFORMATION
          </div>
          
          {/* Row 1 */}
          <div className="grid grid-cols-12 border-b border-black text-[7.5px]">
            <div className="col-span-8 border-r border-black p-1.5 min-h-[38px] flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">1. VETERAN'S LEGAL FULL NAME (FIRST, MI, LAST):</div>
              <div className="text-[10px] font-black uppercase tracking-wide mt-0.5">{patient?.name || "N/A"}</div>
            </div>
            <div className="col-span-4 p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">2. DATE OF BIRTH (MM/DD/YYYY):</div>
              <div className="text-[10px] font-black tracking-wide mt-0.5">{formattedDob || "N/A"}</div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-12 border-b border-black text-[7.5px]">
            <div className="col-span-8 border-r border-black p-1.5 min-h-[38px] flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">3. VA FACILITY & ADDRESS:</div>
              <div className="text-[9px] font-black uppercase mt-0.5">{paramFacility}</div>
            </div>
            <div className="col-span-4 p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">4. VA AUTHORIZATION NUMBER:</div>
              <div className="text-[10px] font-black uppercase tracking-wide mt-0.5">{paramAuthNum || activeCase?.claim_number || "N/A"}</div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-12 border-b border-black text-[7.5px]">
            <div className="col-span-8 border-r border-black p-1.5 min-h-[46px] flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">5. ORDERING PROVIDER OFFICE NAME & ADDRESS:</div>
              <div className="text-[9px] font-bold mt-0.5 leading-tight text-slate-900">
                AcuTherapy Clinics<br />
                1650 Liliha St Suite 208, Honolulu, HI 96817
              </div>
            </div>
            <div className="col-span-4 p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight leading-tight">6. INDIAN HEALTH SERVICES (IHS) PROVIDER/ TRIBAL HEALTH PROGRAM (THP)?</div>
              <div className="flex gap-6 mt-1 pb-0.5">
                <CheckBox checked={true} label="NO" />
                <CheckBox checked={false} label="YES" />
              </div>
            </div>
          </div>

          {/* Row 4 */}
          <div className="grid grid-cols-12 text-[7.5px]">
            <div className="col-span-4 border-r border-black p-1.5 min-h-[36px] flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">7. ORDERING PROVIDER PHONE NUMBER:</div>
              <div className="text-[9.5px] font-black mt-0.5">(808) 528-7177</div>
            </div>
            <div className="col-span-4 border-r border-black p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">8. ORDERING PROVIDER FAX NUMBER:</div>
              <div className="text-[9.5px] font-black mt-0.5">(808) 212-9459</div>
            </div>
            <div className="col-span-4 p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">9. ORDERING PROVIDER SECURE EMAIL ADDRESS:</div>
              <div className="text-[9.5px] font-bold mt-0.5 lowercase text-blue-900 underline">acuherb@yahoo.com</div>
            </div>
          </div>
        </div>

        {/* SECTION II: TYPE OF CARE REQUEST */}
        <div className="border-[1.5px] border-black mb-1.5 flex-1 flex flex-col justify-between">
          <div className="flex flex-col">
            <div className="bg-slate-900 text-white text-center text-[8.5px] font-black uppercase tracking-wider py-0.5 border-b border-black">
              SECTION II: TYPE OF CARE REQUEST
            </div>

            {/* Row 1 */}
            <div className="grid grid-cols-12 border-b border-black text-[7.5px]">
              <div className="col-span-6 border-r border-black p-1.5 min-h-[36px] flex flex-col justify-between">
                <div className="font-bold text-black uppercase tracking-tight">10. IS CARE NEEDED WITHIN 48 HOURS? <span className="normal-case font-normal">(Based on clinical need)</span></div>
                <div className="flex gap-6 mt-1">
                  <CheckBox checked={true} label="NO" />
                  <CheckBox checked={false} label="YES (Note: Contact VA facility directly)" />
                </div>
              </div>
              <div className="col-span-6 p-1.5 flex flex-col justify-between">
                <div className="font-bold text-black uppercase tracking-tight">11. IS THIS A CONTINUATION OF CARE?</div>
                <div className="flex gap-6 mt-1">
                  <CheckBox checked={false} label="NO" />
                  <CheckBox checked={true} label="YES" />
                </div>
              </div>
            </div>

            {/* Row 2 */}
            <div className="border-b border-black p-1.5 text-[7.5px] min-h-[30px] flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">12. IS THIS A REFERRAL TO ANOTHER SPECIALTY?</div>
              <div className="flex gap-6 mt-1">
                <CheckBox checked={true} label="NO" />
                <div className="flex items-center gap-1.5">
                  <CheckBox checked={false} label="YES, SPECIALTY:" />
                  <span className="text-[8px] font-bold text-slate-400">__________________________________________________</span>
                </div>
              </div>
            </div>

            {/* Table headers */}
            <div className="grid grid-cols-12 border-b border-black bg-slate-50 text-[7.5px] font-bold text-center">
              <div className="col-span-2 border-r border-black py-1 px-1">13. DIAGNOSIS CODES (ICD-10):</div>
              <div className="col-span-4 border-r border-black py-1 px-1">14. DIAGNOSIS DESCRIPTION:</div>
              <div className="col-span-3 border-r border-black py-1 px-1">15. REQUESTED CPT/HCPCS CODE:</div>
              <div className="col-span-3 py-1 px-1">16. DESCRIPTION CPT/HCPCS CODE</div>
            </div>

            {/* Table content */}
            <div className="grid grid-cols-12 border-b border-black text-[9.5px] font-black text-center min-h-[32px] items-center">
              <div className="col-span-2 border-r border-black py-1.5">{icdCode}</div>
              <div className="col-span-4 border-r border-black py-1.5 text-left px-3 capitalize">{icdDesc}</div>
              <div className="col-span-3 border-r border-black py-1.5 uppercase">{paramCptCodes}</div>
              <div className="col-span-3 py-1.5 text-left px-3 capitalize">{paramCptDesc}</div>
            </div>

            {/* Section 17 */}
            <div className="border-b border-black p-1.5 text-[7px] bg-slate-50/50">
              <div className="font-bold text-black uppercase tracking-tight mb-1">17. GERIATRIC AND EXTENDED CARE <span className="normal-case font-normal">(Note: Add needed details to justification section):</span></div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-1">
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> COMMUNITY NURSING HOME</label>
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> HOME INFUSION</label>
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> HOSPICE/PALLIATIVE CARE</label>
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> SKILLED HOME HEALTH CARE</label>
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> COMMUNITY ADULT DAY HEALTH CARE</label>
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> HOME HOMEMAKER/HOME HEALTH AIDE</label>
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" disabled className="h-2.5 w-2.5 border-black rounded-sm" /> RESPITE</label>
              </div>
            </div>
          </div>

          {/* Section 18 Reason for Request */}
          <div className="p-3 flex-1 flex flex-col justify-between min-h-[140px]">
            <div>
              <div className="text-[7.5px] font-bold text-black uppercase tracking-tight">
                18. REASON FOR REQUEST <span className="normal-case font-normal">(To avoid delays in care, include clinical history details to support medical necessity):</span>
              </div>
              <div className="text-[11px] leading-relaxed font-semibold mt-2.5 text-slate-900 border border-slate-200/50 p-3 rounded bg-slate-50/30 italic">
                {paramReason || `Requesting more acupuncture visits, as patient's condition shows slow signs of improvement with care.`}
              </div>
            </div>

            {/* Attestation Text */}
            <div className="border-t border-black pt-2 mt-4 text-[7px] leading-snug font-medium text-slate-600">
              <span className="font-bold text-black">ATTESTATION:</span> I do hereby attest that the forgoing information is true, accurate, & complete to the best of my knowledge & I understand that any falsification, omission, or concealment of material fact may subject me to administrative, civil, or criminal liability. I do hereby acknowledge that VA reserves the right to perform the requested service(s) if the following criteria are met: (1) The patient agrees to receive services from VA (2) Service(s) are available at VA facility & are able to be provided by the clinically indicated date (3) It is determined to be within the patient's best interest. Upon completion of the requested service(s), VA will provide all resulting medical documentation to the ordering provider. If all criteria listed are not true & VA agrees the service(s) are clinically indicated, VA will provide a referral for services to be performed in the community. I do hereby attest that upon receipt of order/consult results, I will assume responsibility for reviewing said results, addressing significant findings, & providing continued care.
            </div>
          </div>
        </div>

        {/* SIGNATURE SECTION */}
        <div className="border-[1.5px] border-black">
          <div className="grid grid-cols-12 border-b border-black text-[7.5px]">
            <div className="col-span-6 border-r border-black p-1.5 min-h-[36px] flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">19. ORDERING PROVIDER NAME (PRINTED):</div>
              <div className="text-[10px] font-black uppercase mt-0.5">DR. DAVID CAI</div>
            </div>
            <div className="col-span-6 p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">20. ORDERING PROVIDER NPI#:</div>
              <div className="text-[10px] font-black mt-0.5">1013102243</div>
            </div>
          </div>

          <div className="grid grid-cols-12 text-[7.5px]">
            <div className="col-span-6 border-r border-black p-1.5 min-h-[48px] relative flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">21. ORDERING PROVIDER SIGNATURE (REQUIRED):</div>
              <div className="font-['Dancing_Script'] text-2xl text-blue-800 font-semibold px-4 select-none transform -rotate-[2deg] my-auto">
                David Cai
              </div>
            </div>
            <div className="col-span-6 p-1.5 flex flex-col justify-between">
              <div className="font-bold text-black uppercase tracking-tight">22. TODAY'S DATE (MM/DD/YYYY):</div>
              <div className="text-[10px] font-black mt-0.5">{todayStr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Details */}
      <div className="text-[7.5px] leading-tight text-slate-500 mt-2.5 flex justify-between items-end">
        <div className="space-y-0.5">
          <div>For more information please visit: <span className="underline text-blue-700">https://www.va.gov/COMMUNITYCARE/providers/Care-Coordination.asp</span></div>
          <div>For additional contact information, please visit: <span className="underline text-blue-700">https://www.va.gov/COMMUNITYCARE/providers/Care-Coordination-Facilities.asp</span></div>
          <div className="max-w-[7.2in] leading-snug">
            <span className="font-bold">Additional Resource:</span> Clinical Determinations and Indications. VA Clinical Determinations and Indications (medical policies) describe standard VA health care benefits for services and procedures that community providers may recommend as necessary for a Veteran. Prior to providing care, providers should use Clinical Determinations and Indications (CDIs) as a reference when determining if a Veteran meets VA clinical criteria.
          </div>
        </div>
        <div className="text-right font-bold text-black min-w-[1.2in] leading-tight">
          VA FORM<br />
          MAR 2025 <span className="text-[9.5px]">10-10172</span> <span className="font-normal text-slate-500 ml-1">Page 1</span>
        </div>
      </div>

      {/* FLOATING ACTION BAR FOR SCREEN PREVIEW ONLY */}
      <div className="no-print fixed bottom-4 right-4 bg-slate-900/90 text-white p-3 rounded-2xl shadow-xl border border-slate-700 flex gap-3 items-center z-50 animate-in slide-in-from-bottom-4 duration-300">
        <div className="text-xs font-semibold">VA Form 10-10172 Scribe Preview</div>
        <button
          onClick={() => window.print()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow"
        >
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition"
        >
          Close Preview
        </button>
      </div>
    </div>
  );
}

export default function RfsPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-semibold text-slate-500">Loading form template...</div>}>
      <RfsPrintContent />
    </Suspense>
  );
}
