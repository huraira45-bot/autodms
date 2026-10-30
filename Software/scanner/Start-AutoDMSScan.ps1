#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$ScanUri, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$client = $null
$workDirectory = $null
$success = $false
$claimed = $false
$scanKey = $null
$sessionAddress = $null
$failure = $false
$scannerMutex = $null
$ownsScanner = $false
try {
    $uri = [Uri]$ScanUri
    if ($uri.Scheme -ne 'autodms-scan' -or $uri.Host -ne 'scan' -or $uri.UserInfo -or $uri.Fragment -or $uri.Port -ne -1 -or $uri.AbsolutePath -notmatch '^/[a-f0-9]{32}$') {
        throw 'Invalid AutoDMS scan request. Start scanning from your booking form.'
    }
    $sessionId = $uri.AbsolutePath.TrimStart('/')
    $parameters = @{}
    foreach ($entry in $uri.Query.TrimStart('?').Split('&')) {
        $parts = $entry.Split('=',2)
        if ($parts.Count -ne 2 -or $parameters.ContainsKey($parts[0])) { throw 'Invalid AutoDMS scan parameters.' }
        $parameters[$parts[0]] = [Uri]::UnescapeDataString($parts[1])
    }
    if ($parameters.Count -ne 3 -or $parameters['token'] -notmatch '^[a-f0-9]{64}$' -or $parameters['source'] -notin @('duplex','feeder') -or $parameters['format'] -notin @('jpeg','pdf')) {
        throw 'Invalid AutoDMS scan parameters.'
    }
    $scanKey = $parameters['token']
    $configuration = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'config.json')) | ConvertFrom-Json
    $server = [Uri]$configuration.ServerOrigin
    if ($server.Scheme -notin @('http','https') -or $server.UserInfo -or $server.AbsolutePath -ne '/' -or $server.Query -or $server.Fragment) { throw 'The scanner server setting is invalid. Run Scanner Setup again.' }
    if (-not (Test-Path -LiteralPath $configuration.Naps2Path -PathType Leaf)) { throw 'NAPS2 was not found. Run Scanner Setup again.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $client = [Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromMinutes(3)
    $client.DefaultRequestHeaders.Add('X-AutoDMS-Scan-Key', $scanKey)
    # The destination comes only from the locally installed configuration, never from the web launch URL.
    $sessionAddress = $server.GetLeftPart([UriPartial]::Authority) + '/api/scanner/ingest/' + $sessionId
    function Send-ScanJson([string]$Endpoint, [object]$Body) {
        $content = [Net.Http.StringContent]::new(($Body | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
        try {
            $response = $client.PostAsync($sessionAddress + $Endpoint, $content).GetAwaiter().GetResult()
            try {
                if (-not $response.IsSuccessStatusCode) { throw ('AutoDMS refused this scan request (HTTP ' + [int]$response.StatusCode + '). Start a new scan from the booking.') }
            } finally { $response.Dispose() }
        } finally { $content.Dispose() }
    }
    Send-ScanJson '/start' @{}
    $claimed = $true
    $scannerMutex = [Threading.Mutex]::new($false, 'Local\AutoDMSScanner')
    $ownsScanner = $scannerMutex.WaitOne(0)
    if (-not $ownsScanner) { throw 'The scanner is already being used by another scan. Finish that scan and try again.' }
    $batchRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'AutoDMSScanner'))
    $workDirectory = [IO.Path]::GetFullPath((Join-Path $batchRoot $sessionId))
    if ([IO.Path]::GetDirectoryName($workDirectory) -ne $batchRoot) { throw 'Invalid scan working directory.' }
    New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null
    $isPdf = $parameters['format'] -eq 'pdf'
    $outputPattern = if ($isPdf) { Join-Path $workDirectory 'document.pdf' } else { Join-Path $workDirectory 'page-$(nnnn).jpg' }
    $scanArguments = @('-o', $outputPattern, '--source', $parameters['source'], '--progress')
    if ($configuration.Profile) {
        $scanArguments += @('--profile', [string]$configuration.Profile)
    } else {
        $scanArguments += @('--noprofile', '--driver', 'twain', '--device', [string]$configuration.Device, '--dpi', '300', '--pagesize', 'a4', '--bitdepth', 'color', '--deskew')
    }
    # An argument array is passed to a fixed local executable. No launch data is evaluated as code.
    $scanLog = Join-Path $workDirectory 'scanner.log'
    $ErrorActionPreference = 'Continue'
    & $configuration.Naps2Path @scanArguments *> $scanLog
    $scannerExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($scannerExit -ne 0) { throw 'The scanner could not finish. Check power, the USB cable, the feeder and the Canon TWAIN driver. Check scanner.log in the saved scan folder for details.' }
    $pattern = if ($isPdf) { 'document.pdf' } else { 'page-*.jpg' }
    $pages = @(Get-ChildItem -LiteralPath $workDirectory -File -Filter $pattern | Sort-Object Name)
    if ($pages.Count -eq 0) { throw 'No pages were scanned. Load the feeder and try again.' }
    if ($pages.Count -gt 100) { throw 'This batch has more than 100 pages. Scan a smaller batch.' }
    if (($pages | Measure-Object Length -Sum).Sum -gt 209715200) { throw 'This batch exceeds 200 MB. Scan a smaller batch.' }
    $index = 0
    foreach ($page in $pages) {
        $index++
        if ($page.Length -gt 10485760) { throw 'One scanned page exceeds 10 MB. Use a lower resolution in an NAPS2 profile.' }
        $form = [Net.Http.MultipartFormDataContent]::new()
        $stream = [IO.File]::OpenRead($page.FullName)
        $fileContent = [Net.Http.StreamContent]::new($stream)
        $mime = if ($isPdf) { 'application/pdf' } else { 'image/jpeg' }
        $fileContent.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new($mime)
        $form.Add($fileContent, 'file', $page.Name)
        try {
            $response = $client.PostAsync($sessionAddress + '/pages/' + $index, $form).GetAwaiter().GetResult()
            try { if (-not $response.IsSuccessStatusCode) { throw ('AutoDMS could not receive a scanned page (HTTP ' + [int]$response.StatusCode + ').') } }
            finally { $response.Dispose() }
        } finally { $form.Dispose(); $stream.Dispose() }
    }
    Send-ScanJson '/complete' @{ count = $pages.Count }
    $success = $true
} catch {
    $failure = $true
    $message = $_.Exception.Message
    if ($claimed -and $client -and $sessionAddress) {
        try { Send-ScanJson '/complete' @{ error = $message.Substring(0, [Math]::Min(500, $message.Length)) } } catch {}
    }
    if ($workDirectory -and (Test-Path -LiteralPath $workDirectory)) { $message += "`r`nScanned files are retained here for recovery: " + $workDirectory }
    if ($NonInteractive) { Write-Error $message -ErrorAction Continue }
    else {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show($message, 'AutoDMS Scanner', 'OK', 'Warning') | Out-Null
    }
} finally {
    if ($client) { $client.Dispose() }
    if ($scannerMutex) { if ($ownsScanner) { $scannerMutex.ReleaseMutex() }; $scannerMutex.Dispose() }
    if ($success -and $workDirectory) {
        $resolved = [IO.Path]::GetFullPath($workDirectory)
        if ([IO.Path]::GetDirectoryName($resolved) -eq $batchRoot -and [IO.Path]::GetFileName($resolved) -match '^[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
if ($failure) { exit 1 }
