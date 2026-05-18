/**
 * Best-effort partial JSON parser for streaming /api/ask responses.
 *
 * The model emits a JSON object like { "text": "...", "cards": [ {...}, {...} ] }
 * As bytes stream in we want to:
 *   - Show the text field as soon as it starts arriving (typewriter effect)
 *   - Render each card as soon as that card object is complete
 *
 * We don't need to handle every JSON edge case — the model output is
 * well-formed, we just need to find boundaries inside an in-flight stream.
 */

export interface PartialAskResult {
  text: string;
  cards: unknown[];
  textComplete: boolean;
}

export function parsePartialAsk(input: string): PartialAskResult {
  let text = "";
  let textComplete = false;
  const cards: unknown[] = [];

  // ---- Extract "text" field ----
  const textKey = input.indexOf('"text"');
  if (textKey !== -1) {
    const colon = input.indexOf(":", textKey);
    if (colon !== -1) {
      // Find opening quote of value
      let i = colon + 1;
      while (i < input.length && input[i] !== '"') i++;
      if (i < input.length && input[i] === '"') {
        // Walk through string characters until unescaped closing quote
        let value = "";
        i++;
        while (i < input.length) {
          const ch = input[i];
          if (ch === "\\") {
            const next = input[i + 1];
            if (!next) break; // incomplete escape, wait for more
            if (next === "n") value += "\n";
            else if (next === "t") value += "\t";
            else if (next === "r") value += "\r";
            else if (next === '"') value += '"';
            else if (next === "\\") value += "\\";
            else if (next === "/") value += "/";
            else value += next;
            i += 2;
            continue;
          }
          if (ch === '"') {
            textComplete = true;
            break;
          }
          value += ch;
          i++;
        }
        text = value;
      }
    }
  }

  // ---- Extract complete card objects from "cards" array ----
  const cardsKey = input.indexOf('"cards"');
  if (cardsKey !== -1) {
    const bracket = input.indexOf("[", cardsKey);
    if (bracket !== -1) {
      let depth = 0;
      let objStart = -1;
      let inString = false;
      let escaped = false;
      for (let i = bracket + 1; i < input.length; i++) {
        const ch = input[i];
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") {
          if (depth === 0) objStart = i;
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0 && objStart !== -1) {
            const slice = input.slice(objStart, i + 1);
            try {
              cards.push(JSON.parse(slice));
            } catch {
              // ignore — malformed object (shouldn't happen with valid JSON)
            }
            objStart = -1;
          }
        }
      }
    }
  }

  return { text, cards, textComplete };
}
