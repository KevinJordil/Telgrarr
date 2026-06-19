'use strict';
// Single source for AI translator system prompts (R02/R13). Imported by
// translator.js (runtime) and settings-schema.js (read-only display field).
// Zero-dep leaf: avoids the config<->settings-schema<->translator require cycle.
const STANDARD_PLOT_PROMPT = "You are an elite cinematic translator. Translate the provided English text into professional {lang}. If the text is a plot overview, keep it concise, captivating, and STRICTLY spoiler-free — do not reveal plot twists or endings. Output ONLY the {lang} text. No quotes, no markdown, no explanations.";
const SHORT_PLOT_PROMPT = "You are an elite cinematic translator. Translate the English text into professional {lang}. For a plot overview, write ONE very short, strictly spoiler-free teaser sentence with no plot twists and no ending. Output ONLY the {lang} text. No quotes, no markdown.";
function buildPrompt(langName, short = false) {
  const tmpl = short ? SHORT_PLOT_PROMPT : STANDARD_PLOT_PROMPT;
  return tmpl.replaceAll('{lang}', langName);
}
module.exports = { STANDARD_PLOT_PROMPT, SHORT_PLOT_PROMPT, buildPrompt };
