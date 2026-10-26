// Cache only verified compressed weights. Storage failures must not prevent play.
export async function loadBrowserModel(base,{fetcher=fetch,storage=globalThis.caches,cryptoApi=globalThis.crypto,onProgress=()=>{}}={}){
  const manifestResponse=await fetcher(new URL('manifest.json',base),{cache:'no-cache'});
  if(!manifestResponse.ok)throw new Error(`Model manifest HTTP ${manifestResponse.status}`);
  const manifest=await manifestResponse.json();
  if(!/^[a-f0-9]{64}$/.test(manifest.sha256)||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<=0)throw new Error('Invalid model manifest');
  const url=new URL(`model.txt.gz?v=${manifest.sha256}`,base).href;
  const valid=async bytes=>bytes.byteLength===manifest.bytes&&Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')===manifest.sha256;
  let cache;
  try{cache=await storage?.open('electoral-go-models-v1');}catch{}
  try{
    const cached=await cache?.match(url);
    if(cached){const bytes=await cached.arrayBuffer();if(await valid(bytes)){onProgress({stage:'cached',received:bytes.byteLength,total:manifest.bytes});return bytes;}await cache.delete(url);}
  }catch{}
  const response=await fetcher(url);if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
  const chunks=[];let received=0;
  if(response.body){
    const reader=response.body.getReader();
    try{for(;;){const {done,value}=await reader.read();if(done)break;received+=value.length;
      if(received>manifest.bytes)throw new Error('Model exceeds expected size');
      chunks.push(value);onProgress({stage:'download',received,total:manifest.bytes});}}
    finally{reader.releaseLock();}
  }else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);received=bytes.length;}
  const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(!await valid(bytes))throw new Error('Model integrity check failed');
  try{
    await cache?.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));
    // Remove obsolete versions for this site's model, leaving other apps alone.
    for(const key of await cache?.keys()||[]){const old=new URL(key.url);if(old.origin===new URL(url).origin&&old.pathname===new URL(url).pathname&&key.url!==url)await cache.delete(key);}
  }catch{}
  onProgress({stage:'verified',received,total:manifest.bytes});return bytes.buffer;
}
