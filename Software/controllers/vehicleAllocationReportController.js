const { sql, getPool } = require('../config/db');
const { vehicleDeliveryLockedSql } = require('../services/vehicleDeliveryLockService');
const { parseStockStatus, parseAllocationType, allocatedStockPositionSql } = require('../services/vehicleStockStatusFilter');
const query = `WITH inventory AS (
    SELECT v.VehicleID,v.ChasisNo,v.EngineNo,v.Color,v.Location,v.AllocationType,
        ${allocatedStockPositionSql('v')} AS RecordedStockPosition,
        CASE WHEN ${vehicleDeliveryLockedSql('v')} THEN 'Delivered' ELSE v.Status END AS VehicleStatus,
        m.ModelName,vr.VariantName,vr.VariantCode,b.BookingID,b.BookingNo,b.DMSBookingNumber,
        b.Status AS BookingStatus,CONVERT(varchar(10),COALESCE(b.BookingDate,b.CreatedAt),23) AS BookingDate,
        CONVERT(varchar(7),b.PromisedDeliveryMonth,23) AS PromisedDeliveryMonth,
        p.PartyName AS CustomerName,p.CNIC,p.PhoneOne AS Phone,
        COALESCE(e.EmployeeName,b.CreatedByName) AS SalespersonName,
        CASE WHEN links.LinkCount>1 OR (links.LinkCount=0 AND (v.CurrentBookingID IS NOT NULL OR v.Status='Allocated')) THEN 'Review'
             WHEN links.LinkCount=1 THEN 'Allocated' ELSE 'Unallocated' END AS AllocationState,
        links.LinkCount
    FROM dms_Vehicle v
    LEFT JOIN dms_VehicleVariant vr ON vr.VariantID=v.VariantID
    LEFT JOIN dms_VehicleModel m ON m.ModelID=vr.ModelID
    OUTER APPLY (SELECT COUNT(*) AS LinkCount,MIN(candidate.BookingID) AS BookingID
        FROM dms_SalesBookings candidate
        WHERE (candidate.BookingID=v.CurrentBookingID OR candidate.AllocatedVehicleID=v.VehicleID)
            AND candidate.Status<>'Cancelled') links
    LEFT JOIN dms_SalesBookings b ON links.LinkCount=1 AND b.BookingID=links.BookingID
    LEFT JOIN gen_PartiesInfo p ON p.PartyID=b.PartyID
    LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID
    WHERE @search IS NULL OR v.ChasisNo LIKE @search OR v.EngineNo LIKE @search OR EXISTS (
        SELECT 1 FROM dms_SalesBookings searched LEFT JOIN gen_PartiesInfo customer ON customer.PartyID=searched.PartyID
        WHERE (searched.BookingID=v.CurrentBookingID OR searched.AllocatedVehicleID=v.VehicleID)
          AND searched.Status<>'Cancelled'
          AND (searched.BookingNo LIKE @search OR searched.DMSBookingNumber LIKE @search OR customer.PartyName LIKE @search))
)
SELECT * FROM (SELECT inventory.*,CASE WHEN VehicleStatus IN ('Delivered','Sold','Returned') THEN VehicleStatus ELSE RecordedStockPosition END AS StockPosition FROM inventory) locatedStock
WHERE (@stockOnly=0 OR VehicleStatus NOT IN ('Delivered','Sold','Returned'))
  AND (@stockStatus IS NULL OR (@stockStatus='Allocated' AND VehicleStatus='Allocated') OR (@stockStatus<>'Allocated' AND StockPosition=@stockStatus))
  AND (@allocationType IS NULL OR AllocationType=@allocationType)
  AND (@assignment IS NULL OR AllocationState=@assignment)
ORDER BY ModelName,VariantName,ChasisNo,VehicleID;`;
exports.report = async (req,res) => {
    let stockStatus,allocationType,assignment,search;
    try {
        stockStatus=parseStockStatus(req.query.stockStatus);allocationType=parseAllocationType(req.query.allocationType);
        assignment=req.query.assignment || null;
        if(assignment!==null&&!['Allocated','Unallocated','Review'].includes(assignment))throw Error('Invalid allocation selection.');
        if(req.query.search!==undefined&&(typeof req.query.search!=='string'||req.query.search.length>150))throw Error('Search must contain at most 150 characters.');
        search=(req.query.search||'').trim();
    }catch(error){return res.status(400).json({error:error.message});}
    try {
        const pool=await getPool();const result=await pool.request()
            .input('stockOnly',sql.Bit,req.query.inStockOnly==='1')
            .input('stockStatus',sql.NVarChar(20),stockStatus)
            .input('allocationType',sql.NVarChar(20),allocationType)
            .input('assignment',sql.NVarChar(20),assignment)
            .input('search',sql.NVarChar(452),search?`%${search.replace(/[[%_]/g,'[$&]')}%`:null).query(query);
        const rows=result.recordset;
        res.json({rows,totals:{vehicles:rows.length,allocated:rows.filter(r=>r.AllocationState==='Allocated').length,
            unallocated:rows.filter(r=>r.AllocationState==='Unallocated').length,review:rows.filter(r=>r.AllocationState==='Review').length,
            booked:rows.filter(r=>r.AllocationType==='Booked').length,openAllocation:rows.filter(r=>r.AllocationType==='OpenAllocation').length}});
    }catch(error){res.status(500).json({error:error.message});}
};
