function jsonSchema(value) {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='type' && typeof v==='string' ? v.toLowerCase() : jsonSchema(v)]));
}

export function groqMessages(system, contents) {
  const messages=[{role:'system',content:system}];
  const pending=[];
  let sequence=0;
  for (const content of contents) {
    const text=content.parts.filter(p=>typeof p.text==='string').map(p=>p.text).join('\n');
    const calls=content.parts.filter(p=>p.functionCall).map(p=>p.functionCall);
    if (content.role==='model') {
      const tool_calls=calls.map(call=>{const id=`tool_${sequence++}`;pending.push({id,name:call.name});return {id,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args||{})}};});
      messages.push({role:'assistant',content:text||null,...(tool_calls.length?{tool_calls}:{})});
    } else {
      if (text) messages.push({role:'user',content:text});
      for (const part of content.parts.filter(p=>p.functionResponse)) {
        const index=pending.findIndex(call=>call.name===part.functionResponse.name);
        if(index<0) throw new Error('Tool response has no matching model call.');
        const [call]=pending.splice(index,1);
        messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(part.functionResponse.response)});
      }
    }
  }
  return messages;
}

export async function generateGroq(system, contents, declarations, requiredTool) {
  const model=process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({model,messages:groqMessages(system,contents),tools:declarations.map(d=>({type:'function',function:{...d,parameters:jsonSchema(d.parameters)}})),
      tool_choice:requiredTool?{type:'function',function:{name:requiredTool}}:'auto',max_completion_tokens:900}),
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok) throw new Error(`Groq HTTP ${response.status}: model request failed`);
  const data=await response.json(),message=data.choices?.[0]?.message;
  if(!message)throw new Error('Groq returned no action.');
  const parts=[];
  if(message.content)parts.push({text:message.content});
  for(const call of message.tool_calls||[])parts.push({functionCall:{name:call.function.name,args:JSON.parse(call.function.arguments)}});
  return {content:{role:'model',parts},model,provider:'groq'};
}
