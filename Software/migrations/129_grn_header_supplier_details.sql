-- 129_grn_header_supplier_details.sql
-- Owner report 2026-09-10: "in grn there is no information of the supplier".
-- The GRN print renders Supplier / Address / Term of Sales / NTN / STRN as
-- labels with nothing beside them.
--
-- Cause: GRNPrint.jsx already reads g.PartyName, g.PartyAddress,
-- g.TermOfSales, g.SupplierNTN and g.SupplierSTRN, and getGRNById serves
-- SELECT * FROM vw_PurchaseGRNHeader -- but that view exposes only
-- PurchasedParty AS PartyID. The party id was there; the party's details
-- never were, so every one of those fields came back undefined.
--
-- Every field already exists on gen_PartiesInfo (AddressOne/AddressTwo,
-- NTNNO, SaleTaxRegNo, PhoneOne, TermsandCondition). This rebuilds the view
-- with a LEFT JOIN onto it, naming the columns to match what the print
-- already asks for, so no frontend change is needed.
--
-- LEFT JOIN, not INNER: a GRN with a missing or deleted party must still
-- print rather than vanish from the list.
--
-- Idempotent -- safe to re-run.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('vw_PurchaseGRNHeader', 'V') IS NOT NULL
    DROP VIEW vw_PurchaseGRNHeader;
GO

CREATE VIEW vw_PurchaseGRNHeader AS
SELECT
    p.PurchaseID, p.PurchaseDate,
    p.FBRInvoiceNumber AS SupplierBillNo,
    p.PurchasedParty   AS PartyID,
    p.WHID, p.NetDiscount, p.Remarks,
    p.PurchaseVoucherNo AS PurchaseCode,
    p.CreatedBy, p.CreatedByName,
    p.IsFinalized, p.FinalizedBy, p.FinalizedByName, p.FinalizedAt,
    -- Supplier block for the print / list. Names match GRNPrint.jsx.
    party.PartyName,
    LTRIM(RTRIM(
        ISNULL(party.AddressOne, '')
        + CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(party.AddressTwo, ''))), '') IS NOT NULL
               THEN ', ' + party.AddressTwo ELSE '' END
    ))                        AS PartyAddress,
    party.NTNNO               AS SupplierNTN,
    party.SaleTaxRegNo        AS SupplierSTRN,
    party.PhoneOne            AS SupplierPhone,
    party.ContactPerson       AS SupplierContact,
    party.TermsandCondition   AS TermOfSales
FROM data_PurchaseInfo p
LEFT JOIN gen_PartiesInfo party ON party.PartyID = p.PurchasedParty;
GO

PRINT '129_grn_header_supplier_details complete.';
GO
