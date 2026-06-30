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