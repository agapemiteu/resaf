import test from 'node:test';
import assert from 'node:assert/strict';
import { groqMessages,generateGroq } from '../src/agents/groq.mjs';
test('fallback carries completed tool observations forward with matching call IDs',()=>{
 const contents=[{role:'user',parts:[{text:'Inspect only'}]},{role:'model',parts:[{functionCall:{name:'get_resource',args:{resource_id:'space'}}}]},{role:'user',parts:[{functionResponse:{name:'get_resource',response:{status:'AVAILABLE'}}}]}];
 const messages=groqMessages('Rules',contents);
 assert.equal(messages[2].tool_calls[0].id,messages[3].tool_call_id);
 assert.equal(messages[3].role,'tool');assert.deepEqual(JSON.parse(messages[3].content),{status:'AVAILABLE'});
 assert.throws(()=>groqMessages('Rules',[{role:'user',parts:[{functionResponse:{name:'unknown',response:{}}}]}]));
});
test('fallback normalizes schema and returns explicit provider metadata',async()=>{
 const saved=globalThis.fetch;
 try{
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  const body=JSON.parse(options.body);assert.equal(body.tools[0].function.parameters.type,'object');assert.equal(body.tools[0].function.parameters.properties.id.type,'string');
  return new Response(JSON.stringify({choices:[{message:{tool_calls:[{function:{name:'inspect',arguments:'{"id":"space"}'}}]}}]}),{status:200});
 };
 const result=await generateGroq('Rules',[{role:'user',parts:[{text:'Inspect'}]}],[{name:'inspect',parameters:{type:'OBJECT',properties:{id:{type:'STRING'}}}}]);
 assert.equal(result.provider,'groq');assert.deepEqual(result.content.parts[0].functionCall,{name:'inspect',args:{id:'space'}});
 }finally{globalThis.fetch=saved;}
});
