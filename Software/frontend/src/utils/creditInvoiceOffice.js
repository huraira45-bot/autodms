// Native Office files: no external library or server write is required.
const utf8 = value => new TextEncoder().encode(value);
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const valueOf = cell => cell && typeof cell === 'object' ? cell.value : cell;
const display = cell => {
    const value = valueOf(cell);
    if (typeof value === 'number' && cell?.format !== 'quantity') {
        const money=Math.abs(value).toLocaleString('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2});
        return value<0?'('+money+')':money;
    }
    return String(value ?? '');
};
const crcTable = Array.from({length:256},(_,index)=>{
    let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xEDB88320^(value>>>1):value>>>1;return value>>>0;
});
function crc32(bytes){let crc=0xFFFFFFFF;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}
function joinBytes(chunks){
    const out=new Uint8Array(chunks.reduce((size,chunk)=>size+chunk.length,0));
    let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
function zip(files){
    const local=[],central=[];let offset=0;
    for(const [name,content] of Object.entries(files)){
        const fileName=utf8(name),bytes=typeof content==='string'?utf8(content):content,crc=crc32(bytes);
        const header=new Uint8Array(30),v=new DataView(header.buffer);
        v.setUint32(0,0x04034B50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);
        v.setUint16(12,0x0021,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);
        v.setUint16(26,fileName.length,true);local.push(header,fileName,bytes);
        const dir=new Uint8Array(46),d=new DataView(dir.buffer);
        d.setUint32(0,0x02014B50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);
        d.setUint16(14,0x0021,true);d.setUint32(16,crc,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);
        d.setUint16(28,fileName.length,true);d.setUint32(42,offset,true);central.push(dir,fileName);
        offset+=header.length+fileName.length+bytes.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer),directory=joinBytes(central);
    e.setUint32(0,0x06054B50,true);e.setUint16(8,Object.keys(files).length,true);e.setUint16(10,Object.keys(files).length,true);
    e.setUint32(12,directory.length,true);e.setUint32(16,offset,true);
    return joinBytes([...local,directory,end]);
}
const XML_HEADER='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const packageRelationships=type=>XML_HEADER+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${type==='word'?'word/document.xml':'xl/workbook.xml'}"/></Relationships>`;
function businessLines(profile={}){
    return [profile.CompanyName,profile.LegalName,
        [profile.Address1,profile.Address2,profile.City,profile.Country].filter(Boolean).join(', '),
        [profile.PhoneNumbers&&'Phone: '+profile.PhoneNumbers,profile.FaxNumber&&'Fax: '+profile.FaxNumber,profile.Email,profile.Website].filter(Boolean).join(' | '),
        [profile.NTN&&'NTN: '+profile.NTN,profile.STRN&&'STRN: '+profile.STRN,profile.CNIC&&'CNIC: '+profile.CNIC].filter(Boolean).join(' | ')
    ].filter(Boolean);
}
function paragraph(text,{bold=false,center=false,size=18}={}){
    return `<w:p><w:pPr><w:spacing w:after="60"/>${center?'<w:jc w:val="center"/>':''}</w:pPr><w:r><w:rPr>${bold?'<w:b/>':''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}
function wordTable(rows,{headers=false,widths=null,labelColumns=[]}={}){
    const columns=Math.max(...rows.map(row=>row.length),1);
    const sizes=widths||Array.from({length:columns},()=>Math.floor(10400/columns));
    return `<w:tbl><w:tblPr><w:tblW w:w="10400" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(edge=>`<w:${edge} w:val="single" w:sz="4" w:color="555555"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${sizes.map(width=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row,index)=>`<w:tr>${headers&&index===0?'<w:trPr><w:tblHeader/></w:trPr>':''}${row.map((cell,col)=>`<w:tc><w:tcPr><w:tcW w:w="${sizes[col]}" w:type="dxa"/>${headers&&index===0?'<w:shd w:fill="E8EDF2"/>':''}</w:tcPr>${paragraph(display(cell),{bold:(headers&&index===0)||labelColumns.includes(col)})}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
}
export function buildCreditInvoiceWord(invoice,logo=null){
    const lines=businessLines(invoice.business);
    const logoWidth=logo?.width && logo?.height?Math.round(Math.min(609600,457200*logo.width/logo.height)):609600;
    const logoHeight=logo?.width && logo?.height?Math.round(logoWidth*logo.height/logo.width):457200;
    let body=lines.map((line,index)=>paragraph(line,{center:true,bold:index===0,size:index===0?28:16})).join('');
    if(logo){
        body=`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${logoWidth}" cy="${logoHeight}"/><wp:docPr id="1" name="Business logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Business logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${logoWidth}" cy="${logoHeight}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`+body;
    }
    body+=paragraph('Credit Invoice',{center:true,bold:true,size:24});
    body+=wordTable(invoice.metadata,{widths:[1600,3600,1600,3600],labelColumns:[0,2]});
    body+=paragraph('Vehicle',{bold:true})+wordTable([invoice.vehicleHeaders,invoice.vehicle],{headers:true});
    for(const section of invoice.sections){
        body+=paragraph(section.title,{bold:true})+wordTable([section.headers,...(section.rows.length?section.rows:[section.headers.map(()=> '')])],{headers:true,widths:section.wordWidths});
    }
    body+=paragraph('Invoice totals',{bold:true})+wordTable(invoice.totals,{widths:[7800,2600],labelColumns:[0]});
    body+=paragraph('')+wordTable([invoice.signatures],{});
    const document=XML_HEADER+`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="567" w:right="680" w:bottom="567" w:left="680" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`;
    const files={
        '[Content_Types].xml':XML_HEADER+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo?`<Default Extension="${logo.extension}" ContentType="${logo.contentType}"/>`:''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
        '_rels/.rels':packageRelationships('word'),
        'word/document.xml':document,
        'word/styles.xml':XML_HEADER+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>',
        'word/_rels/document.xml.rels':XML_HEADER+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${logo?`<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.extension}"/>`:''}</Relationships>`
    };
    if(logo)files['word/media/logo.'+logo.extension]=logo.bytes;
    return zip(files);
}
function columnName(index){let name='';for(let i=index+1;i>0;i=Math.floor((i-1)/26))name=String.fromCharCode(65+(i-1)%26)+name;return name;}
export function buildCreditInvoiceExcel(invoice){
    const rows=[],headers=new Set();
    const heading=values=>{headers.add(rows.length+1);rows.push(values);};
    for(const line of businessLines(invoice.business))rows.push([line]);
    heading(['Credit Invoice']);rows.push([]);
    rows.push(...invoice.metadata);rows.push([]);
    heading(invoice.vehicleHeaders);rows.push(invoice.vehicle);rows.push([]);
    for(const section of invoice.sections){
        heading([section.title]);heading(section.headers);rows.push(...section.rows);rows.push([]);
    }
    heading(['Invoice totals']);rows.push(...invoice.totals);rows.push([]);rows.push(invoice.signatures);
    const sheet=XML_HEADER+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>${[24,46,18,22,23,16,22].map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row,index)=>`<row r="${index+1}">${row.map((cell,col)=>{
        const value=valueOf(cell),reference=columnName(col)+(index+1);
        return typeof value==='number'&&Number.isFinite(value)
            ? `<c r="${reference}" s="${cell?.format==='quantity'?0:1}"><v>${value}</v></c>`
            : `<c r="${reference}" s="${headers.has(index+1)?2:0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('')}</row>`).join('')}</sheetData><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0" footer="0"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    return zip({
        '[Content_Types].xml':XML_HEADER+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        '_rels/.rels':packageRelationships('excel'),
        'xl/workbook.xml':XML_HEADER+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Credit Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':XML_HEADER+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml':sheet,
        'xl/styles.xml':XML_HEADER+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;(#,##0.00)"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    });
}
export function downloadInvoiceFile(bytes,filename,type){
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}
