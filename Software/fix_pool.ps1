$files = Get-ChildItem "c:\Users\ServerDeskop\Desktop\db1\software\controllers\*.js"
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $content = $content.Replace("const { sql, dbConfig } = require('../config/db');", "const { sql, dbConfig, getPool } = require('../config/db');")
    $content = $content.Replace("await sql.connect(dbConfig)", "await getPool()")
    Set-Content -Path $file.FullName -Value $content -NoNewline
    Write-Host "Updated: $($file.Name)"
}
