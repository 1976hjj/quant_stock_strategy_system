const fs=require('node:fs');const path=require('node:path');
let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(__dirname,'style.css'),'utf8')+'</style>');
html=html.replace(/<script src="([^"]+)"><\/script>/g,(_,p)=>'<script>'+fs.readFileSync(path.join(__dirname,p),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
fs.writeFileSync(path.join(__dirname,'quant-system-design.html'),html);console.log('Standalone HTML saved: '+Buffer.byteLength(html)+' bytes');
