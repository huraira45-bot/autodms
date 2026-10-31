const { sql, getPool } = require('../config/db');
const { vehicleDeliveryLockedSql } = require('../services/vehicleDeliveryLockService');

function id(value, label) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value)>2147483647) throw new Error(`Invalid ${label}.`);
    return Number(value);
}
function day(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must be YYYY-MM-DD.');
    const check = new Date(value+'T00:00:00Z');
    if (value.startsWith('0000') || !Number.isFinite(check.getTime()) || check.toISOString().slice(0,10)!==value) throw new Error('Invalid date.');
    return new Date(value+'T00:00:00+05:00');
}
function filters(query) {
    const modelId=id(query.modelId,'model'),variantId=id(query.variantId,'variant');
    const from=day(query.from),to=day(query.to);
    if (from && to && from>to) throw new Error('From date must not be after To date.');
    return { modelId,variantId,from,to: to ? new Date(to.getTime()+86400000) : null,search:String(query.search||'').trim().slice(0,150) };
}
function bind(request, f) {
    request.input('model',sql.Int,f.modelId).input('variant',sql.Int,f.variantId)
        .input('search',sql.NVarChar(302),f.search ? `%${f.search}%` : null);
    return request;
}
function failure(res,error) {
    return res.status(error.number===208 ? 503 : 500).json({ error: error.number===208
        ? 'Vehicle inventory ledger setup is pending. Please ask your administrator to complete the update.' : error.message });
}
const validated = (req,res) => { try { return filters(req.query); } catch(e) { res.status(400).json({error:e.message});return null; } };

exports.options = async (req,res) => {
    try {
        const pool=await getPool();
        const r=await pool.request().query(`
            WITH historicalVariants AS (
                SELECT l.*,ROW_NUMBER() OVER(PARTITION BY l.VariantID ORDER BY l.MovementID DESC) AS n
                FROM dms_VehicleInventoryLedger l
                WHERE NOT EXISTS(SELECT 1 FROM dms_VehicleVariant v WHERE v.VariantID=l.VariantID)
            ), variants AS (
                SELECT v.VariantID,v.VariantCode,v.VariantName,m.ModelID,m.ModelName
                FROM dms_VehicleVariant v JOIN dms_VehicleModel m ON m.ModelID=v.ModelID
                UNION ALL
                SELECT l.VariantID,l.VariantCode,l.VariantName,l.ModelID,l.ModelName
                FROM historicalVariants l WHERE l.n=1
            ) SELECT * FROM variants ORDER BY ModelName,VariantName;`);
        const models=[...new Map(r.recordset.map(v=>[v.ModelID,{ModelID:v.ModelID,ModelName:v.ModelName}])).values()];
        res.json({models,variants:r.recordset});
    } catch(error) {failure(res,error);}
};

exports.summary = async (req,res) => {
    const f=validated(req,res);if(!f)return;
    try {
        const pool=await getPool();
        const r=await bind(pool.request(),f).input('stockOnly',sql.Bit,req.query.inStockOnly==='1').query(`
            WITH stock AS (
                SELECT v.VehicleID,v.VariantID,v.AllocationType,
                    CASE WHEN ${vehicleDeliveryLockedSql('v')} THEN 'Delivered' ELSE v.Status END AS Status
                FROM dms_Vehicle v
            ), scopedStock AS (
                SELECT * FROM stock
                WHERE @stockOnly=0 OR Status NOT IN ('Delivered','Sold','Returned')
            )
            SELECT m.ModelID,m.ModelName,vr.VariantID,vr.VariantCode,vr.VariantName,
                COUNT(s.VehicleID) AS TotalVehicles,
                SUM(CASE WHEN s.Status NOT IN ('Delivered','Sold','Returned') THEN 1 ELSE 0 END) AS InStock,
                SUM(CASE WHEN s.Status='AtMaster' THEN 1 ELSE 0 END) AS AtMaster,
                SUM(CASE WHEN s.Status='InTransit' THEN 1 ELSE 0 END) AS InTransit,
                SUM(CASE WHEN s.Status='AtDealer' THEN 1 ELSE 0 END) AS AtDealer,
                SUM(CASE WHEN s.Status='Allocated' THEN 1 ELSE 0 END) AS Allocated,
                SUM(CASE WHEN s.Status IN ('Delivered','Sold') THEN 1 ELSE 0 END) AS Delivered,
                SUM(CASE WHEN s.Status='Returned' THEN 1 ELSE 0 END) AS Returned,
                SUM(CASE WHEN s.Status NOT IN ('Delivered','Sold','Returned') AND s.AllocationType='OpenAllocation' THEN 1 ELSE 0 END) AS OpenAllocation
            FROM dms_VehicleVariant vr JOIN dms_VehicleModel m ON m.ModelID=vr.ModelID
            LEFT JOIN scopedStock s ON s.VariantID=vr.VariantID
            WHERE (@model IS NULL OR m.ModelID=@model) AND (@variant IS NULL OR vr.VariantID=@variant)
                AND (@search IS NULL OR m.ModelName LIKE @search OR vr.VariantName LIKE @search OR vr.VariantCode LIKE @search)
            GROUP BY m.ModelID,m.ModelName,vr.VariantID,vr.VariantCode,vr.VariantName ORDER BY m.ModelName,vr.VariantName;`);
        const rows=r.recordset.filter(row=>req.query.inStockOnly!=='1' || row.InStock>0);
        const totals={variants:rows.length};
        for(const key of ['TotalVehicles','InStock','AtMaster','InTransit','AtDealer','Allocated','Delivered','Returned','OpenAllocation']) totals[key]=rows.reduce((sum,row)=>sum+Number(row[key]),0);
        res.json({rows,totals});
    } catch(error) {failure(res,error);}
};

exports.ledger = async (req,res) => {
    const f=validated(req,res);if(!f)return;
    try {
        const pool=await getPool(),request=bind(pool.request(),f);
        request.input('from',sql.DateTime2,f.from).input('to',sql.DateTime2,f.to);
        const where=`(@model IS NULL OR l.ModelID=@model) AND (@variant IS NULL OR l.VariantID=@variant)
            AND (@to IS NULL OR l.OccurredAtUtc<@to)
            AND (@search IS NULL OR l.ChasisNo LIKE @search OR l.EngineNo LIKE @search)`;
        const r=await request.query(`
            SELECT StartedAtUtc FROM dms_VehicleInventoryLedgerConfig WHERE ConfigID=1;
            SELECT l.VariantID,MAX(l.ModelName) AS ModelName,MAX(l.VariantCode) AS VariantCode,MAX(l.VariantName) AS VariantName,
                SUM(CASE WHEN l.EntryType='Opening' OR (@from IS NOT NULL AND l.OccurredAtUtc<@from) THEN l.QuantityIn-l.QuantityOut ELSE 0 END) AS Opening,
                SUM(CASE WHEN l.EntryType<>'Opening' AND (@from IS NULL OR l.OccurredAtUtc>=@from) THEN l.QuantityIn ELSE 0 END) AS QuantityIn,
                SUM(CASE WHEN l.EntryType<>'Opening' AND (@from IS NULL OR l.OccurredAtUtc>=@from) THEN l.QuantityOut ELSE 0 END) AS QuantityOut,
                SUM(l.QuantityIn-l.QuantityOut) AS Closing
            FROM dms_VehicleInventoryLedger l WHERE ${where} GROUP BY l.VariantID ORDER BY ModelName,VariantName;
            WITH running AS (
                SELECT l.*,SUM(l.QuantityIn-l.QuantityOut) OVER(PARTITION BY l.VariantID ORDER BY l.OccurredAtUtc,l.MovementID ROWS UNBOUNDED PRECEDING) AS Balance
                FROM dms_VehicleInventoryLedger l WHERE ${where}
            ) SELECT r.*,b.BookingNo,g.GatePassNo
            FROM running r LEFT JOIN dms_SalesBookings b ON b.BookingID=r.BookingID
            OUTER APPLY(SELECT TOP(1) gp.GatePassNo FROM dms_GatePasses gp
                        WHERE gp.DocType='BOOKING' AND gp.DocID=r.BookingID AND r.EntryType IN ('Delivered','Opening') ORDER BY gp.GatePassID) g
            WHERE @from IS NULL OR r.OccurredAtUtc>=@from
            ORDER BY r.VariantName,r.VariantID,r.OccurredAtUtc,r.MovementID;`);
        const startedAt=r.recordsets[0][0]?.StartedAtUtc;
        if (startedAt && f.to && f.to<=startedAt) return res.status(400).json({
            error:'This period is before vehicle inventory tracking began. Choose a period that includes the opening snapshot or later movements.',
        });
        const rows=r.recordsets[2].map(row=>({...row,
            OccurredAtUtc:row.OccurredAtUtc?.toISOString() || null,
            OpeningQuantity:row.EntryType==='Opening' ? row.QuantityIn-row.QuantityOut : 0,
            QuantityIn:row.EntryType==='Opening' ? 0 : Number(row.QuantityIn),QuantityOut:Number(row.QuantityOut),Balance:Number(row.Balance),
        }));
        const variants=r.recordsets[1],totals={};
        for(const key of ['Opening','QuantityIn','QuantityOut','Closing']) totals[key]=variants.reduce((sum,row)=>sum+Number(row[key]),0);
        res.json({rows,variants,totals,startedAtUtc:startedAt?.toISOString() || null,
            basis:'Opening snapshot plus registered-stock movements. At Master, in-transit, at-dealer and allocated vehicles count as stock; delivered and returned vehicles do not. Business dates use Pakistan time.'});
    } catch(error) {failure(res,error);}
};
