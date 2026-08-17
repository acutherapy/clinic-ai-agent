import { supabase } from "./supabase";

/**
 * Standardizes any US phone number format to E.164 (+1XXXXXXXXXX)
 */
export function formatPhoneE164(phone: string): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  const clean10 = clean.slice(-10);
  return clean10 ? `+1${clean10}` : phone;
}

export function getPhoneFilter(phoneInput: string): string {
  if (!phoneInput) return "phone.eq.invalid";
  
  const clean = phoneInput.replace(/\D/g, "");
  const clean10 = clean.slice(-10);
  if (!clean10) {
    return `phone.eq.${phoneInput}`;
  }

  const area = clean10.slice(0, 3);
  const prefix = clean10.slice(3, 6);
  const line = clean10.slice(6);

  const v1 = clean10;                     
  const v2 = `(${area}) ${prefix}-${line}`; 
  const v3 = `(${area})${prefix}-${line}`;  
  const v4 = `${area}-${prefix}-${line}`;   
  const v5 = `${area} ${prefix} ${line}`;   
  const v6 = `+1${clean10}`;                
  const v7 = `1${clean10}`;                 

  return `phone.eq.${v1},phone.eq.${v2},phone.eq.${v3},phone.eq.${v4},phone.eq.${v5},phone.eq.${v6},phone.eq.${v7},phone.ilike.%${clean10}%`;
}

export async function saveConversation(
  phone: string,
  role: "user" | "assistant",
  message: string
) {
  const formattedPhone = formatPhoneE164(phone);
  const { error } = await supabase
    .from("sms_conversations")
    .insert({
      phone: formattedPhone,
      role,
      message,
    });

  if (error) {
    console.error(
      "saveConversation error:",
      error
    );
  }
}

export async function getConversationHistory(
  phone: string,
  limit = 10
) {
  const formattedPhone = formatPhoneE164(phone);
  const { data, error } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone", formattedPhone)
    .order("created_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    console.error(
      "getConversationHistory error:",
      error
    );

    return [];
  }

  return (data || []).reverse();
}