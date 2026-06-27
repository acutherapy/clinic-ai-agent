"use client";

import { useState } from "react";

export default function ReferralIntake() {
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  
  const [referralClass, setReferralClass] = useState("Veterans");
  const [treatingPhysician, setTreatingPhysician] = useState("");
  const [referralStatus, setReferralStatus] = useState("Active");
  const [serviceType, setServiceType] = useState("Acupuncture");
  const [referralNumber, setReferralNumber] = useState("");
  
  const [totalVisits, setTotalVisits] = useState("8");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [diagCode, setDiagCode] = useState("");
  const [diagDesc, setDiagDesc] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientName || !phone || !referralNumber || !startDate || !endDate) {
      setStatusMsg({ type: "error", text: "Please fill out all required fields (*)." });
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      const response = await fetch("/api/new-referral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: phone.trim(),
          patient_name: patientName.trim(),
          email: email.trim() || null,
          dob: dob || null,
          referral_class: referralClass,
          treating_physician: treatingPhysician.trim() || null,
          referral_status: referralStatus,
          service_type: serviceType,
          referral_number: referralNumber.trim(),
          total_authorized_visits: parseInt(totalVisits, 10) || 0,
          referral_start_date: startDate,
          referral_end_date: endDate,
          diagnosis_code: diagCode.trim() || null,
          diagnosis_desc: diagDesc.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Submission failed");
      }

      setStatusMsg({
        type: "success",
        text: `Referral registered successfully! Welcome SMS has been sent to ${patientName}.`,
      });

      // Reset form
      setPatientName("");
      setPhone("");
      setEmail("");
      setDob("");
      setTreatingPhysician("");
      setReferralNumber("");
      setStartDate("");
      setEndDate("");
      setDiagCode("");
      setDiagDesc("");
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: "Failed to save referral: " + err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logoBadge}>AcuTherapy</div>
          <h1 style={styles.title}>Patient Referral Intake Form</h1>
          <p style={styles.subtitle}>
            Register VA, Worker's Comp, and Auto Injury authorizations to trigger Emma's automated tracking.
          </p>
        </header>

        {statusMsg && (
          <div style={{
            ...styles.alert,
            backgroundColor: statusMsg.type === "success" ? "#e6f4ea" : "#fce8e6",
            color: statusMsg.type === "success" ? "#137333" : "#c5221f",
            border: `1px solid ${statusMsg.type === "success" ? "#34a853" : "#ea4335"}`
          }}>
            {statusMsg.type === "success" ? "✅" : "❌"} {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          
          {/* section 1 */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>1. Patient Information</h2>
            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Patient Name *</label>
                <input
                  style={styles.input}
                  placeholder="e.g. Gomez, Aleena Yolene"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Phone Number *</label>
                <input
                  style={styles.input}
                  placeholder="e.g. +19547068801"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="e.g. patient@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Date of Birth</label>
                <input
                  style={styles.input}
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          {/* section 2 */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>2. Referral Authorization</h2>
            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Referral Number *</label>
                <input
                  style={styles.input}
                  placeholder="e.g. VA0060339005"
                  value={referralNumber}
                  onChange={(e) => setReferralNumber(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Referral Type / Class</label>
                <select
                  style={styles.select}
                  value={referralClass}
                  onChange={(e) => setReferralClass(e.target.value)}
                  disabled={loading}
                >
                  <option value="Veterans">Veterans</option>
                  <option value="Worker's Comp">Worker's Comp</option>
                  <option value="Auto Injury">Auto Injury</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Service Type</label>
                <select
                  style={styles.select}
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  disabled={loading}
                >
                  <option value="Acupuncture">Acupuncture</option>
                  <option value="Medical Massage">Medical Massage</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Total Authorized Visits</label>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="12"
                  value={totalVisits}
                  onChange={(e) => setTotalVisits(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          {/* section 3 */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>3. Validity & Providers</h2>
            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Start Date *</label>
                <input
                  style={styles.input}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>End Date *</label>
                <input
                  style={styles.input}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Treating Physician</label>
                <input
                  style={styles.input}
                  placeholder="e.g. David Cai"
                  value={treatingPhysician}
                  onChange={(e) => setTreatingPhysician(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Status</label>
                <select
                  style={styles.select}
                  value={referralStatus}
                  onChange={(e) => setReferralStatus(e.target.value)}
                  disabled={loading}
                >
                  <option value="Active">Active</option>
                  <option value="Waiting">Waiting</option>
                  <option value="Closed">Closed</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
            </div>
          </section>

          {/* section 4 */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>4. Clinical Details</h2>
            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Diagnosis Code</label>
                <input
                  style={styles.input}
                  placeholder="e.g. M5450"
                  value={diagCode}
                  onChange={(e) => setDiagCode(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={{ ...styles.formGroup, gridColumn: "span 3" }}>
                <label style={styles.label}>Diagnosis Description</label>
                <input
                  style={styles.input}
                  placeholder="e.g. Low back pain, unspecified"
                  value={diagDesc}
                  onChange={(e) => setDiagDesc(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Registering..." : "Submit Referral & Trigger SMS"}
          </button>

        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    backgroundColor: "#f4f7f6",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: "40px 20px",
    display: "flex",
    justifyContent: "center",
  },
  container: {
    maxWidth: "800px",
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.05)",
    padding: "40px",
    border: "1px solid #eef2f1",
  },
  header: {
    marginBottom: "32px",
    textAlign: "center" as const,
    borderBottom: "1px solid #f0f4f3",
    paddingBottom: "24px",
  },
  logoBadge: {
    display: "inline-block",
    backgroundColor: "#e0f2f1",
    color: "#00796b",
    fontWeight: "bold",
    fontSize: "12px",
    padding: "6px 16px",
    borderRadius: "20px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    marginBottom: "12px",
  },
  title: {
    fontSize: "28px",
    color: "#1c2a38",
    fontWeight: "700",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#5f6c7a",
    margin: 0,
    lineHeight: "1.5",
  },
  alert: {
    padding: "16px",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "24px",
    fontWeight: "500",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "28px",
  },
  section: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#00796b",
    margin: "0 0 4px 0",
    borderLeft: "4px solid #00796b",
    paddingLeft: "10px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    color: "#1f2937",
    outline: "none",
    transition: "border-color 0.2s",
  },
  select: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    color: "#1f2937",
    outline: "none",
    backgroundColor: "#ffffff",
  },
  button: {
    backgroundColor: "#00796b",
    color: "#ffffff",
    padding: "14px",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s",
    marginTop: "16px",
    boxShadow: "0 4px 12px rgba(0, 121, 107, 0.2)",
  },
};
