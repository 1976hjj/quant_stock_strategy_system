const fs=require('node:fs');const path=require('node:path');
for(const [entry,output] of [['index.html','quant-system-design.html'],['intelligence.html','intelligence-design.html']]){
  let html=fs.readFileSync(path.join(__dirname,entry),'utf8');
  html=html.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,p)=>'<style>'+fs.readFileSync(path.join(__dirname,p),'utf8')+'</style>');
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(_,p)=>'<script>'+fs.readFileSync(path.join(__dirname,p),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
  fs.writeFileSync(path.join(__dirname,output),html);console.log(output+': '+Buffer.byteLength(html)+' bytes');
}
