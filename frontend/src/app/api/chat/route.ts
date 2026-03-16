import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert sports betting advisor for Never In Doubt — a premium sports intelligence platform. You help users with:

- Match analysis and predictions across soccer, basketball, baseball, hockey, tennis, and esports
- Betting strategy and advice (value bets, edge identification, bankroll management)
- Team and player form, stats, head-to-head records
- Odds interpretation and market analysis
- Understanding ELO ratings and model predictions shown on the platform
- Live match insights and in-play betting considerations

IMPORTANT RULES:
1. Only answer questions related to sports, sport betting, sport statistics, teams, players, matches, odds, and betting strategy
2. If asked anything unrelated to sports or betting (politics, cooking, tech, general chat, etc.) politely decline and redirect: "I'm your sports advisor — I can only help with sports and betting questions. What match or market can I help you with?"
3. Always remind users that betting carries risk and to gamble responsibly
4. Be confident, sharp, and data-driven in your analysis
5. When recommending bets, frame them as value opportunities based on analysis, not guaranteed wins
6. Use UK English spelling
7. Keep responses concise and actionable — users want quick, clear insights`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid messages", { status: 400 });
  }

  // Stream the response back
  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
