/**
 * Shared.gs — helpers for the automations that run without Claude (third file in the "Job Feed" project).
 * Gemini key: Project Settings → Script Properties → GEMINI_KEY (a key used only by this script, free tier).
 * Without the key every AI step is skipped quietly; nothing else breaks.
 */
const AI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];   // first the light one; the second only if the first is unavailable
const AI_DAILY_MAX = 40;                                            // stays far below the free daily quota

// a short profile for prompts; the "קורות חיים" tab (key/value) wins when it has a "summary" row
// a short profile for prompts; the "קורות חיים" tab (key/value) wins when it has a "summary" row
// CHANGE: 4-6 lines in English, only facts from the CV (name and city, studies, experience, projects, tools, target roles, areas)
const OWNER_PROFILE_DEFAULT = [
  '{{NAME_EN}}, {{CITY}}. {{STUDIES_LINE}}',
  '{{EXPERIENCE_LINE}}',
  'Projects: {{PROJECTS_LINE}}',
  'Tools: {{TOOLS_LINE}}',
  'Target roles, in order: {{TARGET_ROLES}}.',
  'Areas: {{AREAS}}. {{WORK_PREFERENCES}}',
].join('\n');

function ownerProfile_() {
  try {
    const rows = readTab_('קורות חיים');
    const s = rows.find((r) => String(r.key).trim() === 'summary');
    if (s && String(s.value).trim().length > 200) return String(s.value).slice(0, 4000);
  } catch (e) {}
  return OWNER_PROFILE_DEFAULT;
}

/** Ask Gemini. Returns the text (or the parsed object with {json:true}), or null when there is no key, no budget or an error. */
function askGemini_(prompt, opts) {
  opts = opts || {};
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_KEY');
  if (!key) return null;
  const day = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const used = props.getProperty('ai_used_' + day);
  if (Number(used || 0) >= AI_DAILY_MAX) { console.warn('Gemini: daily budget used'); return null; }
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(prompt).slice(0, 30000) }] }],
    generationConfig: Object.assign({ temperature: 0.3, maxOutputTokens: opts.maxTokens || 1200 }, opts.json ? { responseMimeType: 'application/json' } : {}),
  };
  for (const model of AI_MODELS) {
    let r;
    try {
      r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
      });
    } catch (e) { console.warn('Gemini fetch failed', e); return null; }
    const code = r.getResponseCode();
    if (code === 404 || code === 400 && /model/i.test(r.getContentText())) continue;   // model not available for this key: try the next one
    props.setProperty('ai_used_' + day, String(Number(props.getProperty('ai_used_' + day) || 0) + 1));
    if (code === 503 || code === 429 || code === 500) { console.warn('Gemini ' + model + ' ' + code + ', trying the next model'); continue; }   // busy or over quota: the next model has its own
    if (code !== 200) { console.warn('Gemini ' + model + ' ' + code + ': ' + r.getContentText().slice(0, 300)); return null; }
    const j = JSON.parse(r.getContentText());
    const text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join('').trim();
    if (!text) return null;
    if (!opts.json) return text;
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { console.warn('Gemini: not JSON'); return null; }
  }
  return null;
}

/** A phone notification without Claude: a short Google Calendar event with a popup at its start. once = a key so it never repeats. */
function notify_(title, notes, once) {
  const props = PropertiesService.getScriptProperties();
  if (once && props.getProperty('notified_' + once)) return false;
  const soon = new Date(Date.now() + 2 * 60000);
  const e = CalendarApp.getDefaultCalendar().createEvent(title, soon, new Date(soon.getTime() + 15 * 60000), { description: notes || '' });
  e.removeAllReminders(); e.addPopupReminder(0);
  if (once) props.setProperty('notified_' + once, String(Date.now()));
  return true;
}
