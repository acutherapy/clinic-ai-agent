import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question) {
      return NextResponse.json(
        {
          success: false,
          error: "Question required",
        },
        { status: 400 }
      );
    }

    const searchText = question.toLowerCase().trim();

    const normalizedText = searchText
      .replace(/[.,?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const bookingWords = [
      "appointment",
      "schedule",
      "book",
      "booking",
      "availability",
      "available",
      "reschedule",
      "cancel",
    ];

    if (bookingWords.some((word) => normalizedText.includes(word))) {
      return NextResponse.json({
        success: true,
        found: false,
        answer: null,
      });
    }

    // Step 1: Fetch all active knowledge base records, ordering by intent_priority descending if available
    let { data, error } = await supabase
      .from("clinic_knowledge_base")
      .select("*")
      .eq("active", true)
      .order("intent_priority", { ascending: false });

    // Fallback if the intent_priority column does not exist yet in the database
    if (error && error.message.includes("intent_priority") && error.message.includes("does not exist")) {
      console.log("intent_priority column does not exist yet. Falling back to weight_boost query.");
      const fallbackResult = await supabase
        .from("clinic_knowledge_base")
        .select("*")
        .eq("active", true)
        .order("weight_boost", { ascending: false });
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    // Fallback if the weight_boost column does not exist yet in the database
    if (error && error.message.includes("weight_boost") && error.message.includes("does not exist")) {
      console.log("weight_boost column does not exist yet. Falling back to unordered query.");
      const fallbackResult = await supabase
        .from("clinic_knowledge_base")
        .select("*")
        .eq("active", true);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error("KB Search Error:", error);

      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const kbRecords = data || [];

    // Step 2: Bi-directional Question Match
    // Matches if the user query is a substring of the database question, or vice versa (ignoring basic punctuation)
    const questionMatch = kbRecords.find((item) => {
      const dbQ = (item.question || "").toLowerCase();
      const dbQClean = dbQ.replace(/[.,?!]/g, "").trim();
      return dbQ.includes(searchText) || searchText.includes(dbQClean);
    });

    if (questionMatch) {
      console.log(`Matched question directly: "${questionMatch.question}"`);
      
      // Increment hit count if column exists
      if (questionMatch.hasOwnProperty("hit_count")) {
        supabase
          .from("clinic_knowledge_base")
          .update({ hit_count: (questionMatch.hit_count || 0) + 1 })
          .eq("id", questionMatch.id)
          .then();
      }

      return NextResponse.json({
        success: true,
        found: true,
        answer: questionMatch.answer,
        url: questionMatch.webpage_url,
        match: questionMatch.question,
        source: "question",
      });
    }

    // Step 3: Keyword Match
    for (const item of kbRecords) {
      const keywords = Array.isArray(item.keywords) ? item.keywords : [];

      const matched = keywords.some((keyword: string) => {
        const cleanKw = keyword.toLowerCase().trim();
        if (!cleanKw) return false;

        // If keyword contains Chinese characters, use simple substring inclusion
        const hasChinese = /[\u4e00-\u9fa5]/.test(cleanKw);
        if (hasChinese) {
          return normalizedText.includes(cleanKw);
        }

        // Otherwise, use word boundary regex to prevent partial matches (e.g. "late" matching "chocolate")
        const escapedKw = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escapedKw}\\b`, "i");
        return regex.test(normalizedText);
      });

      if (matched) {
        console.log(`Matched keywords for: "${item.question}"`);
        
        // Increment hit count if column exists
        if (item.hasOwnProperty("hit_count")) {
          supabase
            .from("clinic_knowledge_base")
            .update({ hit_count: (item.hit_count || 0) + 1 })
            .eq("id", item.id)
            .then();
        }

        return NextResponse.json({
          success: true,
          found: true,
          answer: item.answer,
          url: item.webpage_url,
          match: item.question,
          source: "keyword",
        });
      }
    }

    // Step 4: GPT Semantic Fallback Match
    try {
      console.log("KB String/Keyword match failed. Running GPT Semantic Fallback...");

      // Build a simplified list of questions with their DB IDs and categories
      const kbList = kbRecords.map((item) => ({
        id: item.id,
        question: item.question,
        category: item.category,
      }));

      const fallbackPrompt = `
You are an AI assistant designed to route user questions to the most relevant clinic knowledge base question.
Analyze the User Question and find the most relevant question from the list.

If there is a clear match or a very similar topic (e.g. "shoulder blade knots" matches "Can acupuncture help shoulder pain?"), return a JSON object with the matching ID, a confidence score between 0 and 1, and the closest category name.
If NO questions in the list are relevant to the user's question, return a JSON object with id null, the closest category name, and a low confidence score.

Return ONLY the JSON object. Do not include markdown codeblocks or conversational filler.

### User Question:
"${question}"

### Knowledge Base Questions List:
${JSON.stringify(kbList, null, 2)}

### Output JSON Format:
{
  "id": 123, // or null
  "closest_category": "Services", // closest matching category name (e.g. Services, Insurance, Booking, Safety, Efficacy, Troubleshooting)
  "confidence": 0.85 // float between 0 and 1
}
`;

      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: fallbackPrompt,
      });

      let text = (response.output_text || "").trim();
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      const result = JSON.parse(text);
      if (result.id) {
        const bestMatch = kbRecords.find((item) => item.id === result.id);
        if (bestMatch) {
          console.log(`GPT Fallback matched User Question to KB ID: ${bestMatch.id} (${bestMatch.question})`);
          
          // Increment hit count if column exists
          if (bestMatch.hasOwnProperty("hit_count")) {
            supabase
              .from("clinic_knowledge_base")
              .update({ hit_count: (bestMatch.hit_count || 0) + 1 })
              .eq("id", bestMatch.id)
              .then();
          }

          return NextResponse.json({
            success: true,
            found: true,
            answer: bestMatch.answer,
            url: bestMatch.webpage_url,
            match: bestMatch.question,
            source: "gpt_fallback",
          });
        }
      }

      // If GPT fallback returned null or matched nothing, log as unmatched query for AI evolution
      console.log(`Logging unmatched query to database: "${question}" (Closest category: ${result.closest_category || "UNKNOWN"}, Confidence: ${result.confidence || 0.0})`);
      supabase
        .from("unmatched_user_queries")
        .insert({
          raw_message: question,
          top_intent_guessed: result.closest_category || "UNKNOWN",
          confidence_score: result.confidence || 0.0
        })
        .then(({ error }) => {
          if (error) {
            console.log("Could not write to unmatched_user_queries table (it may not be created yet):", error.message);
          }
        });

    } catch (fallbackErr) {
      console.error("GPT KB Fallback failed:", fallbackErr);
    }

    // No Match
    return NextResponse.json({
      success: true,
      found: false,
      answer: null,
    });
  } catch (error) {
    console.error("KB Search Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Search failed",
      },
      { status: 500 }
    );
  }
}