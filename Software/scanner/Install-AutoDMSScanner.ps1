#requires -Version 5.1
param(
    [string]$ServerOrigin = '__AUTODMS_SERVER_ORIGIN__',
    [string]$Naps2Path,
    [string]$Device = 'DR-M160',
    [string]$ScannerProfile = ''
)
$ErrorActionPreference = 'Stop'
try {
    $server = [Uri]$ServerOrigin
    if ($server.Scheme -notin @('http','https') -or $server.UserInfo -or $server.AbsolutePath -ne '/' -or $server.Query -or $server.Fragment) {
        throw 'Enter only the AutoDMS server address, for example http://192.168.3.10:5000.'
    }
    if (-not $Naps2Path) {
        $programRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
        $candidates = @($programRoots | ForEach-Object { Join-Path $_ 'NAPS2\NAPS2.Console.exe' })
        $candidates += Join-Path $env:LOCALAPPDATA 'Programs\NAPS2\NAPS2.Console.exe'
        $Naps2Path = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    }
    if (-not $Naps2Path -or -not (Test-Path -LiteralPath $Naps2Path -PathType Leaf)) {
        throw 'Install NAPS2 from https://www.naps2.com/download first, then rerun this installer. For a portable copy, pass -Naps2Path with its NAPS2.Console.exe path.'
    }
    $installDirectory = Join-Path $env:LOCALAPPDATA 'AutoDMSScanner'
    New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
    $workerPath = Join-Path $installDirectory 'Start-AutoDMSScan.ps1'
    $embeddedWorker = '__AUTODMS_WORKER_BASE64__'
    if ($embeddedWorker.StartsWith('__')) {
        $sourceWorker = Join-Path $PSScriptRoot 'Start-AutoDMSScan.ps1'
        Copy-Item -LiteralPath $sourceWorker -Destination $workerPath -Force
    } else {
        [IO.File]::WriteAllBytes($workerPath, [Convert]::FromBase64String($embeddedWorker))
    }
    $configuration = @{ ServerOrigin = $server.GetLeftPart([UriPartial]::Authority); Naps2Path = (Resolve-Path -LiteralPath $Naps2Path).Path; Device = $Device; Profile = $ScannerProfile }
    [IO.File]::WriteAllText((Join-Path $installDirectory 'config.json'), ($configuration | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $protocolPath = 'HKCU:\Software\Classes\autodms-scan'
    New-Item -Path $protocolPath -Force | Out-Null
    Set-Item -Path $protocolPath -Value 'URL:AutoDMS document scanner'
    New-ItemProperty -Path $protocolPath -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    New-Item -Path ($protocolPath + '\shell\open\command') -Force | Out-Null
    $powershellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $command = '"' + $powershellPath + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $workerPath + '" -ScanUri "%1"'
    Set-Item -Path ($protocolPath + '\shell\open\command') -Value $command
    Write-Host 'AutoDMS scanner helper installed for this Windows user.' -ForegroundColor Green
    Write-Host ('Server: ' + $configuration.ServerOrigin)
    Write-Host 'Return to AutoDMS, load the document feeder and click Scan Documents. Allow the browser to open AutoDMS Scanner when prompted.'
    Write-Host ('Settings: ' + (Join-Path $installDirectory 'config.json'))
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $global:LASTEXITCODE = 1
}
Read-Host 'Press Enter to close' | Out-Null
