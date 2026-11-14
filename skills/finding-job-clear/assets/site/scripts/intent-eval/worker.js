// POST { text: [...] } → [{ text, change, margin }] with the real model and the real examples (src/intent.js)
import { intentOf } from '../../src/intent.js';
export default {
  async fetch(req, env) {
    const { text } = await req.json();
    const out = [];
    for (const t of text) out.push({ text: t, ...(await intentOf(env, null, t)) });
    return Response.json(out);
  },
};
