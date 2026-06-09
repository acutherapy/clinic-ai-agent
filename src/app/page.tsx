"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {

  const [patientName, setPatientName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [complaint, setComplaint] =
    useState("");

  async function submitForm() {

    const { error } =
      await supabase
        .from("appointments")
        .insert([
          {
            patient_name: patientName,
            phone: phone,
            email: email,
            chief_complaint: complaint,
            status: "new",
          },
        ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Appointment Request Submitted");

    setPatientName("");
    setPhone("");
    setEmail("");
    setComplaint("");
  }

  return (
    <main
      style={{
        maxWidth: 500,
        margin: "50px auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h1>
        AcuTherapy AI Appointment Agent
      </h1>

      <input
        placeholder="Name"
        value={patientName}
        onChange={(e) =>
          setPatientName(e.target.value)
        }
      />

      <input
        placeholder="Phone"
        value={phone}
        onChange={(e) =>
          setPhone(e.target.value)
        }
      />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
      />

      <textarea
        placeholder="Chief Complaint"
        value={complaint}
        onChange={(e) =>
          setComplaint(e.target.value)
        }
      />

      <button onClick={submitForm}>
        Submit
      </button>
    </main>
  );
}