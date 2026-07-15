"use client";

import { useState } from "react";

export default function Home() {
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [complaint, setComplaint] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitForm() {
    if (!patientName || !phone) {
      alert("Please provide at least a name and phone number.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/new-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: patientName,
          phone: phone,
          email: email || null,
          condition: complaint || null,
          location: "Honolulu", // Default location
          preferred_contact: "Text",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Submission failed");
      }

      if (result.success) {
        alert("Appointment Request Submitted and SMS sent successfully!");
      } else {
        alert(
          `Appointment request recorded in database.\n\nNote: SMS invitation could not be sent: ${
            result.smsError || "Unknown SMS error"
          }`
        );
      }

      setPatientName("");
      setPhone("");
      setEmail("");
      setComplaint("");
    } catch (err: any) {
      console.error(err);
      alert("Error submitting request: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 500,
        margin: "50px auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "0 20px",
      }}
    >
      <h1>AcuTherapy AI Appointment Agent</h1>
      
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 15 }}>
        <a href="/anatomy" style={{ fontSize: 13, color: "#10b981", textDecoration: "none", fontWeight: "bold" }}>
          AI Anatomy ➔
        </a>
        <a href="/leads" style={{ fontSize: 13, color: "#0070f3", textDecoration: "none", fontWeight: "bold" }}>
          Leads Dashboard ➔
        </a>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          placeholder="Name"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          disabled={loading}
          style={{ padding: "8px 12px", borderRadius: 4, border: "1px solid #ccc" }}
        />

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
          style={{ padding: "8px 12px", borderRadius: 4, border: "1px solid #ccc" }}
        />

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          style={{ padding: "8px 12px", borderRadius: 4, border: "1px solid #ccc" }}
        />

        <textarea
          placeholder="Chief Complaint / Condition"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #ccc",
            minHeight: 100,
          }}
        />

        <button
          onClick={submitForm}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 4,
            border: "none",
            backgroundColor: loading ? "#999" : "#0070f3",
            color: "white",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </div>
    </main>
  );
}