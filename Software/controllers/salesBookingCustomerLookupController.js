const {sql,getPool}=require('../config/db');
exports.lookup=async(req,res)=>{
 try {
  const pool=await getPool();const r=pool.request();
  const search=String(req.query.search||'').trim().slice(0,150);
  if(search)r.input('q',sql.NVarChar(452),'%'+search.replace(/[[%_]/g,'[$&]')+'%');
  const rows=await r.query(`SELECT p.PartyID,p.PartyName,p.PartyType,p.PhoneOne,p.CNIC,p.NTNNO,p.AddressOne,p.PartyGLID,
   c.GLCode AS PartyGLCode,c.GLTitle AS PartyGLTitle
   FROM gen_PartiesInfo p JOIN GLChartOFAccount c ON c.GLCAID=p.PartyGLID
   WHERE c.GLCode LIKE N'201002%' AND p.PartyType IN('Customer','Both','CorporateCustomer')
   ${search?'AND (p.PartyName LIKE @q OR p.CNIC LIKE @q OR p.PhoneOne LIKE @q OR p.NTNNO LIKE @q)':''}
   ORDER BY p.PartyID DESC`);
  return res.json(rows.recordset);
 }catch(err){return res.status(500).json({error:'Customer lookup failed.'});}
};
