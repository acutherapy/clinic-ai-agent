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

    // Step 1: Fetch all active knowledge base records
    const { data, error } = await supabase
      .from("clinic_knowledge_base")
      .select("*")
      .eq("active", true);

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

    // Step 2: Bi-directional Question Match
    // Matches if the user query is a substring of the database question, or vice versa (ignoring basic punctuation)
    const questionMatch = data.find((item) => {
      const dbQ = (item.question || "").toLowerCase();
      const dbQClean = dbQ.replace(/[.,?!]/g, "").trim();
      return dbQ.includes(searchText) || searchText.includes(dbQClean);
    });

    if (questionMatch) {
      console.log(`Matched question directly: "${questionMatch.question}"`);
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
    for (const item of data) {
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

      // Build a simplified list of questions with their DB IDs
      const kbList = data.map((item) => ({
        id: item.id,
        question: item.question,
      }));

      const fallbackPrompt = `
You are an AI assistant designed to route user questions to the most relevant clinic knowledge base question.
Analyze the User Question and find the most relevant question from the list.

If there is a clear match or a very similar topic (e.g. "shoulder blade knots" matches "Can acupuncture help shoulder pain?"), return a JSON object with the matching ID.
If NO questions in the list are relevant to the user's question, return a JSON object with id null.

Return ONLY the JSON object. Do not include markdown codeblocks or conversational filler.

### User Question:
"${question}"

### Knowledge Base Questions List:
${JSON.stringify(kbList, null, 2)}

### Output JSON Format:
{
  "id": 123 // or null if no relevant match
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
        const bestMatch = data.find((item) => item.id === result.id);
        if (bestMatch) {
          console.log(`GPT Fallback matched User Question to KB ID: ${bestMatch.id} (${bestMatch.question})`);
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