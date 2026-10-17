const fs=require('fs');
const path=require('path');
const {sql,getPool}=require('../config/db');
const {recordMasterInvoiceDocument}=require('../services/bookingMasterInvoiceDocumentService');

exports.record=async(req,res)=>{
    let tx,committed=false;
    try{
        tx=new sql.Transaction(await getPool());
        await tx.begin();
        const result=await recordMasterInvoiceDocument(tx,{
            bookingId:Number(req.params.id),invoiceNo:req.body?.MasterInvoiceNo,invoiceDate:req.body?.MasterInvoiceDate,
            notes:req.body?.Notes,file:req.file,user:req.user,
        });
        await tx.commit();committed=true;
        res.status(201).json(result);
    }catch(err){
        if(tx){try{await tx.rollback();}catch(_){}}
        res.status(err.status || 500).json({error:err.message});
    }finally{
        if(!committed && req.file?.path){
            const root=path.resolve(__dirname,'..','uploads','sales')+path.sep;
            if(path.resolve(req.file.path).startsWith(root)){
                try{await fs.promises.unlink(req.file.path);}catch(err){if(err.code!=='ENOENT')console.error('Discarding failed Master invoice upload:',err.message);}
            }
        }
    }
};
