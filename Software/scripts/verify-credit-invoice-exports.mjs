import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {buildCreditInvoiceWord,buildCreditInvoiceExcel} from '../frontend/src/utils/creditInvoiceOffice.js';
const XLSX=createRequire(import.meta.url)('xlsx');
const invoice={
 business:{CompanyName:'Dealer & Sons',Address1:'Main <Road>',NTN:'0000123-4'},
 metadata:[['Customer Name','Customer & Family','Invoice #','RO-TEST-1'],
    ['Party / Insurance','Credit Party','Date','13-Oct-26'],['Party NTN','0012345-6','Surveyor Name','Test']],
 vehicleHeaders:['Vehicle','Registration #','Engine #','KM','Chassis #','Color'],
 vehicle:['Oshan','TEST-123','EN-123','1234','CH-123','White'],
 sections:[
  {title:'Jobs',headers:['Job Description','Total Amount'],rows:[['Service <inspection> & repair',100]]},
  {title:'Sublet',headers:['Description','Qty','Total Amount'],rows:[['=SUM(A1:A99)',{value:1,format:'quantity'},50]]},
  {title:'Spares',headers:['Item Number','Description','Qty','Rate','Amount with GST','Dep %','Dep Amount'],
   rows:[['000123','Part & filter',{value:2,format:'quantity'},25,59,{value:20,format:'quantity'},10]]}
 ],
 totals:[['Labour + Sublet without PST',150],['16% PST',24],['Parts Without GST',50],['18% GST',9],
    ['Less: Depreciation',-10],['Total Payable by Party',223]],
 signatures:['Manager Service/Bodypaint','Accounts Manager']
};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'autodms-invoice-export-'));
const files=['invoice.docx','invoice.xlsx','invoice-logo.docx'].map(name=>path.join(directory,name));
try {

 const reportSource=fs.readFileSync(new URL('../frontend/src/pages/reports/Service.jsx',import.meta.url),'utf8');
 const exportStart=reportSource.indexOf('    const excelExport = '),exportEnd=reportSource.indexOf('\n    return (',exportStart);
 assert.ok(exportStart>=0&&exportEnd>exportStart);
 const reportExport=new Function('return '+reportSource.slice(exportStart+'    const excelExport = '.length,exportEnd).trim().replace(/;$/,''))();
 const csv=reportExport({rows:[{JobCardNo:'RO-TEST-1',CreditPartyName:'Credit Party',CreditPartyNTN:'0012345-6',LabourAmount:100}]},{});
 assert.equal(csv.headers.length,csv.rows[0].length);
 assert.equal(csv.rows[0][csv.headers.indexOf('Party NTN')],'0012345-6');
 assert.equal(csv.rows[0][csv.headers.indexOf('Labour')],100);

 const workbookBytes=buildCreditInvoiceExcel(invoice);
 const workbook=XLSX.read(workbookBytes,{type:'array'});
 assert.deepEqual(workbook.SheetNames,['Credit Invoice']);
 const sheet=workbook.Sheets['Credit Invoice'],rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true});
 assert.equal(rows.find(row=>row[0]==='Party NTN')[1],'0012345-6');
 assert.equal(typeof rows.find(row=>row[0]==='Party NTN')[1],'string');
 assert.equal(rows.find(row=>row[0]==='Total Payable by Party')[1],223);
 assert.equal(typeof rows.find(row=>row[0]==='Total Payable by Party')[1],'number');
 assert.equal(rows.find(row=>row[0]==='000123')[0],'000123');
 assert.equal(rows.find(row=>row[0]==='Less: Depreciation')[1],-10);
 const formulaLike=Object.values(sheet).find(cell=>cell?.v==='=SUM(A1:A99)');
 assert.equal(formulaLike.t,'s');assert.equal(formulaLike.f,undefined);
 const empty=structuredClone(invoice);empty.metadata[2][1]='';empty.sections.forEach(section=>section.rows=[]);
 const emptyBook=XLSX.read(buildCreditInvoiceExcel(empty),{type:'array'});
 assert.equal(XLSX.utils.sheet_to_json(emptyBook.Sheets['Credit Invoice'],{header:1,defval:''}).find(row=>row[0]==='Party NTN')[1],'');
 fs.writeFileSync(files[0],buildCreditInvoiceWord(invoice));fs.writeFileSync(files[1],workbookBytes);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
 fs.writeFileSync(files[2],buildCreditInvoiceWord(invoice,{bytes:png,extension:'png',contentType:'image/png'}));
 const python=`
import sys,zipfile,xml.etree.ElementTree as ET
for filename in sys.argv[1:]:
    with zipfile.ZipFile(filename) as archive:
        assert archive.testzip() is None, "Invalid archive CRC"
        for name in archive.namelist():
            if name.endswith((".xml",".rels")): ET.fromstring(archive.read(name))
        if filename.endswith(".docx"):
            document=ET.fromstring(archive.read("word/document.xml"))
            ns={"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            text=" ".join(node.text or "" for node in document.findall(".//w:t",ns))
            for value in ["0012345-6","Dealer & Sons","Service <inspection> & repair","223.00","(10.00)"]:
                assert value in text, value
            assert len(document.findall(".//w:tbl",ns))==7

            for props in document.findall(".//w:tblPr",ns):
                assert [node.tag.rsplit("}",1)[-1] for node in props]==["tblW","tblBorders","tblLayout"]

            if filename.endswith("logo.docx"):
                assert archive.read("word/media/logo.png").startswith(b"\\x89PNG")
print("Office archive CRC/XML/Word content/logo checks passed.")
`;
 execFileSync('python',['-c',python,...files],{stdio:'inherit'});
 console.log('Excel numeric amounts, NTN/item text identifiers, empty values and literal text checks passed.');
}finally{
 // Delete only the test files created above, then the now-empty owned directory.
 for(const file of files)if(fs.existsSync(file))fs.unlinkSync(file);
 fs.rmdirSync(directory);
}
