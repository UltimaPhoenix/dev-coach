#Requires -Version 5.1
<#
.SYNOPSIS
    Installs devcoach on Windows the way Homebrew does on macOS: in one line.

.DESCRIPTION
    irm https://ultimaphoenix.github.io/dev-coach/install.ps1 | iex

    Puts a private Node.js (the current LTS from nodejs.org, checksum-verified, Authenticode-signed
    by the OpenJS Foundation) and the devcoach standalone bundle (from the GitHub release,
    checksum-verified) under %LOCALAPPDATA%\devcoach, adds a `devcoach` command to your user PATH,
    then runs `devcoach install` to connect Claude Code and Claude Desktop. Re-run it to update.
    Your data lives in ~\.devcoach and is never touched, by install or by uninstall.

    Options — environment variables for the one-liner, or parameters when you save the script
    first (irm … -OutFile install.ps1; .\install.ps1 -Version 2.8.0):
      DEVCOACH_VERSION          -Version        a release, e.g. 2.8.0 (default: the latest)
      DEVCOACH_CHANNEL          -Channel        latest | next (the canary built from develop)
      DEVCOACH_INSTALL_DIR      -InstallDir     default %LOCALAPPDATA%\devcoach
      DEVCOACH_NODE_VERSION     -NodeVersion    the private Node, e.g. 26.13.0 (default: newest LTS)
      DEVCOACH_USE_SYSTEM_NODE  -UseSystemNode  no private Node — `node` from your PATH (>= 24)
      DEVCOACH_NO_MODIFY_PATH   -NoModifyPath   leave the user PATH alone
      DEVCOACH_SKIP_CONNECT     -SkipConnect    do not run `devcoach install` at the end
                                -ConnectArgs    extra arguments for it, e.g. -ConnectArgs --gemini
                                -Archive        a local devcoach-<v>-standalone.zip (offline, CI)
                                -Uninstall      disconnect the agents, remove the runtime + PATH entry

    Uninstall later with %LOCALAPPDATA%\devcoach\uninstall.ps1 or from Apps & Features.
#>
[CmdletBinding()]
param(
    [string]$Version = $env:DEVCOACH_VERSION,
    [string]$Channel = $env:DEVCOACH_CHANNEL,
    [string]$InstallDir = $env:DEVCOACH_INSTALL_DIR,
    [string]$NodeVersion = $env:DEVCOACH_NODE_VERSION,
    [switch]$UseSystemNode,
    [switch]$NoModifyPath,
    [switch]$SkipConnect,
    [string[]]$ConnectArgs = @(),
    [string]$Archive,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
# Invoke-WebRequest is many times slower with the progress bar on Windows PowerShell 5.1.
$ProgressPreference = 'SilentlyContinue'

$Repo = 'UltimaPhoenix/dev-coach'
$ReleasesApi = "https://api.github.com/repos/$Repo/releases"
$NodeDist = 'https://nodejs.org/dist'
$UserAgent = 'devcoach-install.ps1'
$MinNodeMajor = 24

if (-not $Channel) { $Channel = 'latest' }
if ($Channel -notin @('latest', 'next')) { throw "DEVCOACH_CHANNEL / -Channel must be latest or next, not '$Channel'" }
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'devcoach' }
if ($env:DEVCOACH_USE_SYSTEM_NODE -eq '1') { $UseSystemNode = $true }
if ($env:DEVCOACH_NO_MODIFY_PATH -eq '1') { $NoModifyPath = $true }
if ($env:DEVCOACH_SKIP_CONNECT -eq '1') { $SkipConnect = $true }

# $IsWindows exists from PowerShell 6; Windows PowerShell 5.1 only runs on Windows.
$OnWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or [bool]$IsWindows
if (-not $OnWindows -and -not ($UseSystemNode -and $NoModifyPath)) {
    throw 'install.ps1 is for Windows. On macOS or Linux: brew install UltimaPhoenix/tap/devcoach'
}
if ($OnWindows -and $PSVersionTable.PSVersion.Major -lt 6) {
    # Windows PowerShell 5.1 may still default to TLS 1.0 for .NET web requests.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

$BinDir = Join-Path $InstallDir 'bin'
$AppDir = Join-Path $InstallDir 'app'
$NodeDir = Join-Path $InstallDir 'node'
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\devcoach'

function Write-Title([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Step([string]$Text) { Write-Host "    $Text" }

function Get-Json([string]$Url) {
    Invoke-RestMethod -Uri $Url -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent }
}

function Invoke-Download([string]$Url, [string]$Path) {
    Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent }
}

# `<sha256>  <file>` lines — Node's SHASUMS256.txt and the one `shasum -a 256` writes for a release.
function Get-ExpectedHash([string]$SumsPath, [string]$FileName) {
    foreach ($line in Get-Content -Path $SumsPath) {
        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$' -and $Matches[2].Trim() -eq $FileName) {
            return $Matches[1].ToLowerInvariant()
        }
    }
    throw "$FileName is not listed in $(Split-Path -Leaf $SumsPath)"
}

function Assert-Hash([string]$Path, [string]$Expected) {
    $actual = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected) {
        throw "checksum mismatch for $(Split-Path -Leaf $Path): expected $Expected, got $actual - the download is corrupt or was tampered with"
    }
    Write-Step "sha256 verified: $(Split-Path -Leaf $Path)"
}

function Expand-Zip([string]$Zip, [string]$Destination) {
    # Many times faster than Expand-Archive on Windows PowerShell 5.1 (Node's zip has thousands of files).
    if ($PSVersionTable.PSVersion.Major -lt 6) { Add-Type -AssemblyName System.IO.Compression.FileSystem }
    [IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Destination)
}

# The new tree is complete before it takes the name; the old one goes afterwards. A running
# devcoach (an open agent) holds node.exe, and Windows then refuses to rename its directory.
function Set-Directory([string]$Fresh, [string]$Target) {
    $old = "$Target.old"
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }
    if (Test-Path -LiteralPath $Target) {
        try { Rename-Item -LiteralPath $Target -NewName (Split-Path -Leaf $old) -ErrorAction Stop }
        catch { throw "$Target is in use - close Claude Code / Claude Desktop (they run devcoach) and re-run. $($_.Exception.Message)" }
    }
    Rename-Item -LiteralPath $Fresh -NewName (Split-Path -Leaf $Target)
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue }
}

function Get-Arch {
    $arch = $env:PROCESSOR_ARCHITEW6432
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
    switch ($arch) {
        'AMD64' { return 'x64' }
        'ARM64' { return 'arm64' }
        default { throw "devcoach needs a 64-bit Windows (x64 or ARM64); this is '$arch'" }
    }
}

function Get-Release {
    if ($Version) { $url = "$ReleasesApi/tags/v$($Version.TrimStart('v'))" }
    elseif ($Channel -eq 'next') { $url = "$ReleasesApi/tags/next" }
    else { $url = "$ReleasesApi/latest" }
    try { $release = Get-Json $url }
    catch { throw "could not read the release at $url - $($_.Exception.Message)" }
    $zips = @($release.assets | Where-Object { $_.name -like 'devcoach-*-standalone.zip' })
    if ($zips.Count -eq 0) {
        throw "release $($release.tag_name) has no standalone zip (the first release with one is 2.8.0): pass -Version 2.8.0 or newer"
    }
    $sums = @($release.assets | Where-Object { $_.name -eq 'SHASUMS256.txt' })
    [pscustomobject]@{
        Tag     = $release.tag_name
        ZipName = $zips[0].name
        ZipUrl  = $zips[0].browser_download_url
        SumsUrl = $(if ($sums.Count -gt 0) { $sums[0].browser_download_url } else { $null })
    }
}

# Newest LTS line >= 24 (index.json is newest first; an LTS entry carries its codename, the others `false`).
function Resolve-NodeVersion {
    if ($NodeVersion) { return $NodeVersion.TrimStart('v') }
    foreach ($entry in (Get-Json "$NodeDist/index.json")) {
        if ($entry.lts -is [string]) {
            $v = $entry.version.TrimStart('v')
            if ([int]$v.Split('.')[0] -ge $MinNodeMajor) { return $v }
        }
    }
    throw "no Node LTS >= $MinNodeMajor found at $NodeDist/index.json"
}

function Get-NodeMajor([string]$VersionText) {
    [int]($VersionText.Trim().TrimStart('v').Split('.')[0])
}

function Install-App([string]$Tmp) {
    if ($Archive) {
        $zip = (Resolve-Path -LiteralPath $Archive).Path
        Write-Title "Installing devcoach from $zip"
    } else {
        $release = Get-Release
        Write-Title "Downloading devcoach $($release.Tag) ($($release.ZipName))"
        $zip = Join-Path $Tmp $release.ZipName
        Invoke-Download $release.ZipUrl $zip
        if ($release.SumsUrl) {
            $sums = Join-Path $Tmp 'devcoach-SHASUMS256.txt'
            Invoke-Download $release.SumsUrl $sums
            Assert-Hash $zip (Get-ExpectedHash $sums $release.ZipName)
        } else {
            Write-Warning "release $($release.Tag) ships no SHASUMS256.txt - checksum not verified"
        }
    }
    $fresh = Join-Path $InstallDir 'app.new'
    if (Test-Path -LiteralPath $fresh) { Remove-Item -LiteralPath $fresh -Recurse -Force }
    Expand-Zip $zip $fresh
    $pkg = Join-Path $fresh 'package.json'
    if (-not (Test-Path -LiteralPath $pkg) -or -not (Test-Path -LiteralPath (Join-Path (Join-Path $fresh 'dist') 'bin.js'))) {
        throw "$zip is not a devcoach standalone zip (no package.json + dist\bin.js at its root)"
    }
    $installed = (Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json).version
    Set-Directory $fresh $AppDir
    Write-Step "devcoach $installed in $AppDir"
    return $installed
}

function Install-Node([string]$Tmp) {
    $want = Resolve-NodeVersion
    $exe = Join-Path $NodeDir 'node.exe'
    $have = $null
    if (Test-Path -LiteralPath $exe) {
        $have = (& $exe --version).Trim().TrimStart('v')
        if ($have -eq $want) { Write-Title "Node $want already in place"; return }
    }
    $arch = Get-Arch
    $name = "node-v$want-win-$arch"
    Write-Title "Downloading Node $want ($arch) from nodejs.org"
    $zip = Join-Path $Tmp "$name.zip"
    $sums = Join-Path $Tmp 'node-SHASUMS256.txt'
    Invoke-Download "$NodeDist/v$want/$name.zip" $zip
    Invoke-Download "$NodeDist/v$want/SHASUMS256.txt" $sums
    Assert-Hash $zip (Get-ExpectedHash $sums "$name.zip")
    $extract = Join-Path $Tmp 'node'
    Expand-Zip $zip $extract
    $fresh = Join-Path $InstallDir 'node.new'
    if (Test-Path -LiteralPath $fresh) { Remove-Item -LiteralPath $fresh -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $extract $name) -Destination $fresh
    $signature = Get-AuthenticodeSignature -FilePath (Join-Path $fresh 'node.exe')
    if ($signature.Status -eq 'Valid') {
        Write-Step "node.exe signed by $($signature.SignerCertificate.Subject -replace '^CN=([^,]+).*', '$1')"
    } else {
        Write-Warning "node.exe's Authenticode signature is '$($signature.Status)' (expected Valid)"
    }
    try { Set-Directory $fresh $NodeDir }
    catch {
        if ($have) {
            Write-Warning "kept Node $have - $($_.Exception.Message)"
            Remove-Item -LiteralPath $fresh -Recurse -Force -ErrorAction SilentlyContinue
            return
        }
        throw
    }
    Write-Step "Node $want in $NodeDir"
}

function Assert-SystemNode {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw "no `node` on the PATH - drop -UseSystemNode to get a private Node, or install Node >= $MinNodeMajor" }
    $v = (& $node.Source --version).Trim()
    if ((Get-NodeMajor $v) -lt $MinNodeMajor) {
        throw "node $v at $($node.Source) is too old - devcoach needs Node >= $MinNodeMajor (it uses the built-in node:sqlite)"
    }
    Write-Title "Using the system Node $v ($($node.Source))"
}

# Written as `%LOCALAPPDATA%\…` when the install dir is the default one: cmd.exe reads batch files
# in the OEM code page, and a literal path with accented letters would not survive it.
function Get-CmdPath([string]$Path) {
    $local = $env:LOCALAPPDATA
    if ($local -and $Path.StartsWith($local, [StringComparison]::OrdinalIgnoreCase)) {
        return '%LOCALAPPDATA%' + $Path.Substring($local.Length)
    }
    return $Path
}

function Write-Launchers {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    $script = Join-Path (Join-Path $AppDir 'dist') 'bin.js'
    $node = $(if ($UseSystemNode) { 'node' } else { Join-Path $NodeDir 'node.exe' })
    $cmd = "@ECHO OFF`r`n`"$(Get-CmdPath $node)`" `"$(Get-CmdPath $script)`" %*`r`nEXIT /B %ERRORLEVEL%`r`n"
    $oem = $(if ($OnWindows) { [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage) } else { New-Object Text.UTF8Encoding $false })
    [IO.File]::WriteAllText((Join-Path $BinDir 'devcoach.cmd'), $cmd, $oem)
    # The Git Bash twin: forward slashes, LF, no BOM.
    $sh = "#!/bin/sh`n# devcoach launcher for Git Bash (written by install.ps1)`nexec `"$($node -replace '\\', '/')`" `"$($script -replace '\\', '/')`" `"`$@`"`n"
    [IO.File]::WriteAllText((Join-Path $BinDir 'devcoach'), $sh, (New-Object Text.UTF8Encoding $false))
    Write-Step "launchers in $BinDir"
}

function Invoke-Devcoach {
    if ($OnWindows) { & (Join-Path $BinDir 'devcoach.cmd') @args }
    else { & node (Join-Path (Join-Path $AppDir 'dist') 'bin.js') @args }
}

function Send-EnvironmentChange {
    if (-not ('Devcoach.Native' -as [type])) {
        Add-Type -Namespace Devcoach -Name Native -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
    }
    $result = [UIntPtr]::Zero
    # HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG: running Explorer and new consoles see the PATH.
    [Devcoach.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null
}

function Get-UserPathParts {
    $raw = (Get-Item -Path 'HKCU:\Environment').GetValue('Path', '', 'DoNotExpandEnvironmentNames')
    return @($raw -split ';' | Where-Object { $_ -ne '' })
}

function Set-UserPathParts([string[]]$Parts) {
    # ExpandString keeps the %VAR% entries other installers wrote; Set-ItemProperty creates the value if needed.
    Set-ItemProperty -Path 'HKCU:\Environment' -Name Path -Value ($Parts -join ';') -Type ExpandString
    Send-EnvironmentChange
}

function Add-UserPath([string]$Entry) {
    $parts = Get-UserPathParts
    if ($parts -contains $Entry) { return $false }
    Set-UserPathParts (@($Entry) + $parts)
    return $true
}

function Register-Uninstall([string]$Installed) {
    New-Item -Path $UninstallKey -Force | Out-Null
    $props = @{
        DisplayName     = 'devcoach'
        DisplayVersion  = $Installed
        Publisher       = 'UltimaPhoenix'
        InstallLocation = $InstallDir
        URLInfoAbout    = 'https://ultimaphoenix.github.io/dev-coach/'
        UninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $InstallDir 'uninstall.ps1')`""
    }
    foreach ($name in $props.Keys) { Set-ItemProperty -Path $UninstallKey -Name $name -Value $props[$name] }
    Set-ItemProperty -Path $UninstallKey -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $UninstallKey -Name NoRepair -Value 1 -Type DWord
    $kb = [int]((Get-ChildItem -LiteralPath $InstallDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB)
    Set-ItemProperty -Path $UninstallKey -Name EstimatedSize -Value $kb -Type DWord
}

# The uninstaller is a file on disk so Apps & Features (and -Uninstall) work offline, with the
# install dir baked in. It disconnects the agents first: PATH and runtime go last.
function Write-Uninstaller {
    $text = @"
# devcoach uninstaller - written by install.ps1. Disconnects your agents (devcoach uninstall --all),
# then removes the runtime in $InstallDir, its PATH entry and its Apps & Features entry.
# Your data in ~\.devcoach stays: run ``devcoach uninstall --data`` BEFORE this if you want it gone too.
`$ErrorActionPreference = 'Continue'
`$dir = '$($InstallDir -replace "'", "''")'
`$launcher = Join-Path `$dir 'bin\devcoach.cmd'
if (Test-Path -LiteralPath `$launcher) { & `$launcher uninstall --all }
`$key = 'HKCU:\Environment'
`$raw = (Get-Item -Path `$key).GetValue('Path', '', 'DoNotExpandEnvironmentNames')
`$entry = Join-Path `$dir 'bin'
`$all = @(`$raw -split ';' | Where-Object { `$_ -ne '' })
`$kept = @(`$all | Where-Object { `$_ -ne `$entry })
if (`$kept.Count -ne `$all.Count) { Set-ItemProperty -Path `$key -Name Path -Value (`$kept -join ';') -Type ExpandString }
Remove-Item -Path '$UninstallKey' -Recurse -Force -ErrorAction SilentlyContinue
Set-Location -Path `$env:USERPROFILE
Remove-Item -LiteralPath `$dir -Recurse -Force
Write-Host "devcoach removed from `$dir (your data in ~\.devcoach is untouched). Open a new terminal for the PATH change."
"@
    [IO.File]::WriteAllText((Join-Path $InstallDir 'uninstall.ps1'), $text, (New-Object Text.UTF8Encoding $false))
}

if ($Uninstall) {
    $uninstaller = Join-Path $InstallDir 'uninstall.ps1'
    if (-not (Test-Path -LiteralPath $uninstaller)) { throw "nothing to remove: $uninstaller does not exist" }
    # In-process: an execution policy that refuses .ps1 files does not apply to evaluated text.
    Invoke-Expression (Get-Content -LiteralPath $uninstaller -Raw)
    return
}

Write-Host ''
Write-Host 'devcoach for Windows' -ForegroundColor Cyan
Write-Host "    runtime: $InstallDir    data: $(Join-Path $HOME '.devcoach') (yours, never touched)"
Write-Host ''

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('devcoach-install-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $installed = Install-App $tmp
    if ($UseSystemNode) { Assert-SystemNode } else { Install-Node $tmp }
    Write-Launchers
    Write-Uninstaller

    $reported = (Invoke-Devcoach --version | Out-String).Trim()
    if ($reported -notlike "*$installed*") { throw "the installed devcoach answers '$reported' to --version, expected $installed" }
    Write-Step "devcoach $installed runs"

    if ($OnWindows) {
        if (-not $NoModifyPath) {
            if (Add-UserPath $BinDir) { Write-Step "added $BinDir to your user PATH" }
            else { Write-Step "$BinDir is already on your user PATH" }
        }
        $env:Path = "$BinDir;$env:Path"
        Register-Uninstall $installed
    }

    if (-not $SkipConnect) {
        Write-Title "Connecting your agents: devcoach install $($ConnectArgs -join ' ')"
        Invoke-Devcoach install @ConnectArgs
        if ($LASTEXITCODE -ne 0) { Write-Warning "devcoach install exited with $LASTEXITCODE - run it again from a new terminal" }
    }

    Write-Host ''
    Write-Host "devcoach $installed is installed." -ForegroundColor Green
    Write-Host '    command:  devcoach      (open a NEW terminal: this one does not see the PATH change)'
    Write-Host '    update:   re-run the same one-liner'
    Write-Host "    remove:   $(Join-Path $InstallDir 'uninstall.ps1')  (also under Apps & Features)"
    Write-Host '    docs:     https://ultimaphoenix.github.io/dev-coach/install/windows'
    Write-Host ''
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
