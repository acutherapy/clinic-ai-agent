import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

    // Step 1: Direct Question Match
    const { data, error } = await supabase
      .from("clinic_knowledge_base")
      .select("*");

      console.log(
  "KEYWORDS DEBUG:",
  data?.[0]?.keywords,
  typeof data?.[0]?.keywords
);

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

    // Step 2: Exact / Partial Question Match
    const questionMatch = data.find((item) =>
      item.question?.toLowerCase().includes(searchText)
    );

    if (questionMatch) {
      return NextResponse.json({
        success: true,
        found: true,
        answer: questionMatch.answer,
        match: questionMatch.question,
        source: "question",
      });
    }

    // Step 3: Keyword Match
for (const item of data) {

  const keywords = Array.isArray(item.keywords)
    ? item.keywords
    : [];

  const matched = keywords.some(
    (keyword: string) =>
      keyword.toLowerCase().includes(searchText)
  );

  if (matched) {
    return NextResponse.json({
      success: true,
      found: true,
      answer: item.answer,
      match: item.question,
      source: "keyword",
    });
  }
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