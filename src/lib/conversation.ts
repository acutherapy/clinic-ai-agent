import { supabase } from "./supabase";

export async function saveConversation(
  phone: string,
  role: "user" | "assistant",
  message: string
) {
  const { error } = await supabase
    .from("sms_conversations")
    .insert({
      phone,
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
  const { data, error } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone", phone)
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