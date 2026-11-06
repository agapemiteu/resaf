import { generateGroq } from './groq.mjs';
import { nextCommitment } from '../core/policies/automation.mjs';

// The model selects an action; it never supplies an executable monetary amount.
export function applyRecommendation(policy, paidHolds, action) {
  const eligible = nextCommitment(policy, paidHolds);
  const direction = Number(eligible) > Number(policy.commitment_amount) ? 'raise' : Number(eligible) < Number(policy.commitment_amount) ? 'lower' : 'keep';
  if (!['raise','lower','keep'].includes(action) || (action !== 'keep' && action !== direction)) throw new Error('Recommendation violates business conditions.');
  return action === 'keep' ? policy.commitment_amount : eligible;
}

export async function recommendCommitment(policy, signals) {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) throw new Error('Business agent model is not configured.');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const permitted = nextCommitment(policy, signals.paid_holds);
  const direction = Number(permitted) > Number(policy.commitment_amount) ? 'raise' : Number(permitted) < Number(policy.commitment_amount) ? 'lower' : 'keep';
  const system='You manage commitment quotes for scarce inventory. Balance access for genuine buyers with accountable agent reservations. Consider observed demand and unpaid attempts. Choose the permitted adjustment or keep. Never change refunds, existing reservations, or charge anyone. Give one brief public explanation based only on supplied observations.';
  const contents=[{role:'user',parts:[{text:JSON.stringify({current_amount:policy.commitment_amount,business_limits:policy.automation,signals,permitted_actions:[...new Set(['keep',direction])]})}]}];
  const declarations=[{name:'recommend_commitment',description:'Recommend the next commitment quote under business-approved conditions.',parameters:{type:'OBJECT',properties:{action:{type:'STRING',enum:['raise','lower','keep']},explanation:{type:'STRING'}},required:['action','explanation']}}];
  let generated;
  if (process.env.GEMINI_API_KEY) {
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'content-type':'application/json'},
      body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,tools:[{functionDeclarations:declarations}],toolConfig:{functionCallingConfig:{mode:'ANY',allowedFunctionNames:['recommend_commitment']}},generationConfig:{maxOutputTokens:250,thinkingConfig:{thinkingBudget:0}}}),
      signal:AbortSignal.timeout(20000),
    });
    if (response.ok) {const data=await response.json();generated={content:data.candidates?.[0]?.content,model,provider:'gemini'};}
    else if (![429,500,502,503,504].includes(response.status) || !process.env.GROQ_API_KEY) throw new Error(`Business agent model HTTP ${response.status}`);
  }
  if (!generated) generated=await generateGroq(system,contents,declarations,'recommend_commitment');
  const call=generated.content?.parts?.find(p=>p.functionCall)?.functionCall;
  if (call?.name !== 'recommend_commitment' || typeof call.args?.explanation !== 'string') throw new Error('Model did not return a valid recommendation.');
  return {model:generated.model,provider:generated.provider,tool:call.name,action:call.args.action,explanation:call.args.explanation.slice(0,240),amount:applyRecommendation(policy,signals.paid_holds,call.args.action)};
}
