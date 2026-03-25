const fs = require('fs');
const env = fs.readFileSync('.env','utf8');
const get=(k)=>{const l=env.split(/\r?\n/).find(x=>x.startsWith(k+'=')); return l?l.split('=')[1].trim().replace(/^\"|\"$/g,''):''};
const fanKey=get('FANART_API_KEY');
const tmdb=get('TMDB_BEARER_TOKEN');
const ids=[1396,1399,60574,46261,66732];
(async()=>{
 for(const tmdbId of ids){
  const ext=await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`,{headers:{Authorization:`Bearer ${tmdb}`,Accept:'application/json'}});
  const ej=await ext.json();
  const tvdbId=ej.tvdb_id;
  console.log('tmdb',tmdbId,'tvdb',tvdbId);
  if(!tvdbId) continue;
  const r=await fetch(`https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${encodeURIComponent(fanKey)}`);
  console.log(' fanart status',r.status);
  if(r.ok){
    const d=await r.json();
    const keys=Object.keys(d).sort();
    const seasonKeys=keys.filter(k=>k.toLowerCase().includes('season'));
    console.log(' season keys',seasonKeys.join(',')||'(none)');
    for(const k of seasonKeys){
      const arr=Array.isArray(d[k])?d[k]:[];
      console.log('  ',k,'len',arr.length);
      if(arr[0]){
        const ex=arr[0];
        console.log('   sample',JSON.stringify({url:ex.url,lang:ex.lang,season:ex.season,likes:ex.likes}));
      }
    }
  }
  console.log('---');
 }
})();
