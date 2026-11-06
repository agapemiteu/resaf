import { generateGroq } from './groq.mjs';

// Inference alone can fail over. Executed reservation/payment tools are never replayed here.
export async function generateAction({ contents, instructions, declarations, preferGroq=false, onProvider=async()=>{} }, {
  fetchImpl=fetch, groq=generateGroq, env=process.env, primaryTimeoutMs=12000,
}={}) {
  const model=env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const fallback=async reason=>{
    if(!env.GROQ_API_KEY)throw new Error(reason);
    await onProvider({phase:'MODEL_INFERENCE',provider:'groq',model:env.GROQ_MODEL||'openai/gpt-oss-20b',reason});
    return groq(instructions,contents,declarations);
  };
  if(preferGroq || !env.GEMINI_API_KEY)return fallback('Using available model');
  await onProvider({phase:'MODEL_INFERENCE',provider:'gemini',model});
  try {
    const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'content-type':'application/json'},
      body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents,tools:[{functionDeclarations:declarations}],generationConfig:{maxOutputTokens:600,thinkingConfig:{thinkingBudget:0}}}),
      signal:AbortSignal.timeout(primaryTimeoutMs),
    });
    if(!response.ok){
      if([429,500,502,503,504].includes(response.status))return fallback(`Gemini HTTP ${response.status}`);
      throw new Error(`Gemini HTTP ${response.status}: model request rejected`);
    }
    const data=await response.json();
    if(!data.candidates?.[0]?.content?.parts?.length)throw new Error('Gemini returned no action');
    return {content:data.candidates[0].content,model,provider:'gemini'};
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError'||error instanceof TypeError)return fallback('Primary model timed out or disconnected');
    throw error;
  }
}
