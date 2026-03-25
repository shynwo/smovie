const fs = require('fs');
const env = fs.readFileSync('.env','utf8');
const keyLine = env.split(/\r?\n/).find(l=>l.startsWith('FANART_API_KEY='));
const key = keyLine ? keyLine.split('=')[1].trim().replace(/^\"|\"$/g,'') : '';
const ids=[1396,1399,60574,46261,66732];
(async()=>{
  for(const id of ids){
    const u=`https://webservice.fanart.tv/v3/tv/${id}?api_key=${encodeURIComponent(key)}`;
    const r=await fetch(u);
    console.log('id',id,'status',r.status);
    if(r.ok){
      const d=await r.json();
      const keys=Object.keys(d).sort();
      const seasonKeys = keys.filter(k=>k.toLowerCase().includes('season'));
      console.log('season keys', seasonKeys.join(',') || '(none)');
      for(const k of seasonKeys){
        const arr=Array.isArray(d[k])?d[k]:[];
        console.log(' ',k,'len',arr.length);
        if(arr[0]){
          const ex=arr[0];
          console.log('   sample', JSON.stringify({url:ex.url,lang:ex.lang,season:ex.season,likes:ex.likes}));
        }
      }
    }
    console.log('---');
  }
})();
