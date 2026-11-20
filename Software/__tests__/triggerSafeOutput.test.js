const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const migrations=['175_permanent_booking_lock.sql','176_booking_month_locks.sql'].map(n=>fs.readFileSync(path.join(root,'migrations',n),'utf8')).join('\n');
const protectedTables=[...new Set([...migrations.matchAll(/ON dbo\.\[?(\w+)\]? AFTER/g)].map(m=>m[1]))];
test('active application queries never return direct OUTPUT from a trigger-protected table',()=>{
 const invalid=[];
 for(const folder of ['controllers','services'])for(const file of fs.readdirSync(path.join(root,folder)).filter(f=>f.endsWith('.js'))){
  const source=fs.readFileSync(path.join(root,folder,file),'utf8');
  for(const literal of source.matchAll(/`([^`]*)`/gs)){
   const sql=literal[1];
   if(!protectedTables.some(t=>new RegExp('\\b(?:INSERT\\s+(?:INTO\\s+)?|UPDATE\\s+|DELETE\\s+FROM\\s+)(?:dbo\\.)?'+t+'\\b','i').test(sql)))continue;
   for(const output of sql.matchAll(/OUTPUT\s+INSERTED\.(\w+)(?!\w)(?!\s+INTO\b)/gi))invalid.push(folder+'/'+file+': '+output[1]);
  }
 }
 expect(invalid).toEqual([]);
});
