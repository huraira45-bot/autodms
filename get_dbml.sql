SET NOCOUNT ON;

-- Tables
SELECT 'Table ' + QUOTENAME(t.TABLE_NAME, '"') + ' {' + CHAR(13) + CHAR(10) +
       STRING_AGG(CAST('  ' + QUOTENAME(c.COLUMN_NAME, '"') + ' ' + c.DATA_TYPE AS NVARCHAR(MAX)), CHAR(13) + CHAR(10)) WITHIN GROUP (ORDER BY c.ORDINAL_POSITION) +
       CHAR(13) + CHAR(10) + '}'
FROM INFORMATION_SCHEMA.TABLES t
JOIN INFORMATION_SCHEMA.COLUMNS c ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
WHERE t.TABLE_TYPE = 'BASE TABLE'
GROUP BY t.TABLE_NAME;

-- Relations
SELECT 'Ref: ' + QUOTENAME(tp.name, '"') + '.' + QUOTENAME(cp.name, '"') + ' > ' + QUOTENAME(tr.name, '"') + '.' + QUOTENAME(cr.name, '"')
FROM sys.foreign_keys fk
INNER JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
INNER JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
INNER JOIN sys.columns cp ON fkc.parent_column_id = cp.column_id AND fkc.parent_object_id = cp.object_id
INNER JOIN sys.columns cr ON fkc.referenced_column_id = cr.column_id AND fkc.referenced_object_id = cr.object_id;
