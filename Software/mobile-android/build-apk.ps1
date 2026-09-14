<#
.SYNOPSIS
    Builds the DealerDesk Service debug APK using a toolchain that lives
    entirely under one folder (default F:\android-build), so nothing lands on
    the nearly-full C: drive.

.DESCRIPTION
    Expects, under -Toolchain:
        jdk-21\                     Java 21 (Microsoft OpenJDK)
        sdk\cmdline-tools\latest\   Android command-line tools, licences accepted

    Creates as needed, also under -Toolchain:
        gradle-home\         Gradle distribution + dependency cache
        android-user-home\   Android per-user settings
        tmp\                 TEMP/TMP for the build

    Gradle, the Android tools and Java all default to C:\Users\... for caches
    and temp files. Every one of those is redirected here, and only for this
    PowerShell process — no system-wide environment variables are changed.

.EXAMPLE
    .\build-apk.ps1
    .\build-apk.ps1 -SkipWebBuild
    .\build-apk.ps1 -Toolchain H:\android-build
#>
param(
    [string]$Toolchain = 'F:\android-build',
    [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$jdk = Join-Path $Toolchain 'jdk-21'
$sdk = Join-Path $Toolchain 'sdk'
if (-not (Test-Path "$jdk\bin\java.exe"))                         { throw "Java 21 not found at $jdk" }
if (-not (Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) { throw "Android SDK tools not found at $sdk" }

foreach ($d in 'gradle-home', 'android-user-home', 'tmp') {
    New-Item -ItemType Directory -Force -Path (Join-Path $Toolchain $d) | Out-Null
}

$env:JAVA_HOME         = $jdk
$env:ANDROID_HOME      = $sdk
$env:ANDROID_SDK_ROOT  = $sdk
$env:GRADLE_USER_HOME  = Join-Path $Toolchain 'gradle-home'
$env:ANDROID_USER_HOME = Join-Path $Toolchain 'android-user-home'
$env:TEMP              = Join-Path $Toolchain 'tmp'
$env:TMP               = $env:TEMP
$env:Path              = "$jdk\bin;$env:Path"

Push-Location $here
try {
    if (-not $SkipWebBuild) {
        Write-Host '== 1/3 Building the web app =='
        npm --prefix ..\frontend run build
        if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    }

    Write-Host '== 2/3 Copying it into the Android project =='
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'cap sync failed.' }

    Write-Host '== 3/3 Building the APK =='
    Push-Location (Join-Path $here 'android')
    try {
        # --no-daemon: don't leave a Gradle process holding memory on the server.
        .\gradlew.bat assembleDebug --no-daemon
        if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed.' }
    } finally {
        Pop-Location
    }

    $apk = Join-Path $here 'android\app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path $apk)) { throw "Gradle reported success but there is no APK at $apk" }
    Write-Host ('== APK ready: {0} ({1:N1} MB) ==' -f $apk, ((Get-Item $apk).Length / 1MB))
} finally {
    Pop-Location
}
