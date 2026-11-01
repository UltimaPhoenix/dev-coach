#Requires -Version 5.1
<#
.SYNOPSIS
    Installs devcoach on Windows the way Homebrew does on macOS: in one line.

.DESCRIPTION
    irm https://ultimaphoenix.github.io/dev-coach/install.ps1 | iex

    Puts a private Node.js (the current LTS from nodejs.org, checksum-verified, Authenticode
    signature checked: OpenJS Foundation) and the devcoach standalone bundle (from the GitHub
    release, checksum-verified) under %LOCALAPPDATA%\devcoach, adds a `devcoach` command to your
    user PATH, then runs `devcoach install` to connect Claude Code and Claude Desktop. Re-run it to
    update. Your data lives in ~\.devcoach and is never touched, by install or by uninstall.

    Options — environment variables for the one-liner, or parameters when you save the script
    first (irm … -OutFile install.ps1; .\install.ps1 -Version 2.8.0):
      DEVCOACH_VERSION              -Version             a release, e.g. 2.8.0 (default: the latest)
      DEVCOACH_CHANNEL              -Channel             latest | next (the canary built from develop)
      DEVCOACH_INSTALL_DIR          -InstallDir          default %LOCALAPPDATA%\devcoach
      DEVCOACH_NODE_VERSION         -NodeVersion         the private Node, e.g. 26.13.0 (default: newest LTS)
      DEVCOACH_USE_SYSTEM_NODE      -UseSystemNode       no private Node — `node` from your PATH (>= 24)
      DEVCOACH_NO_MODIFY_PATH       -NoModifyPath        leave the user PATH alone
      DEVCOACH_SKIP_CONNECT         -SkipConnect         do not run `devcoach install` at the end
      DEVCOACH_SKIP_SIGNATURE_CHECK -SkipSignatureCheck  accept a node.exe whose Authenticode check fails
                                    -ConnectArgs         extra arguments for it, e.g. -ConnectArgs --gemini
                                    -Archive             a local devcoach-<v>-standalone.zip (offline, CI)
                                    -Uninstall           disconnect the agents, remove the runtime + PATH entry

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
    [switch]$SkipSignatureCheck,
    [string[]]$ConnectArgs = @(),
    [string]$Archive,
    [switch]$Uninstall
)

# Everything below runs in its own scope: through `irm | iex` this script executes in the user's
# console, and its functions, variables and preferences must not stay behind.
& {
$ErrorActionPreference = 'Stop'
# A native command's exit code is read by hand below; a profile that makes it terminating would
# turn the "run it again" warning into an abort.
$PSNativeCommandUseErrorActionPreference = $false
# Invoke-WebRequest is many times slower with the progress bar on Windows PowerShell 5.1.
$ProgressPreference = 'SilentlyContinue'

$Repo = 'UltimaPhoenix/dev-coach'
$Releases = "https://github.com/$Repo/releases"
$NodeDist = 'https://nodejs.org/dist'
$NodeSigner = 'OpenJS Foundation'
$UserAgent = 'devcoach-install.ps1'
$MinNodeMajor = 24

if (-not $Channel) { $Channel = 'latest' }
if ($Channel -notin @('latest', 'next')) { throw "DEVCOACH_CHANNEL / -Channel must be latest or next, not '$Channel'" }
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'devcoach' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if ($env:DEVCOACH_USE_SYSTEM_NODE -eq '1') { $UseSystemNode = $true }
if ($env:DEVCOACH_NO_MODIFY_PATH -eq '1') { $NoModifyPath = $true }
if ($env:DEVCOACH_SKIP_CONNECT -eq '1') { $SkipConnect = $true }
if ($env:DEVCOACH_SKIP_SIGNATURE_CHECK -eq '1') { $SkipSignatureCheck = $true }

# $IsWindows exists from PowerShell 6 (read defensively: a strict-mode profile would throw on an
# undefined variable); Windows PowerShell 5.1 only runs on Windows.
$OnWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or [bool](Get-Variable IsWindows -ValueOnly -ErrorAction SilentlyContinue)
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
$Uninstaller = Join-Path $InstallDir 'uninstall.ps1'
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\devcoach'
# What an install writes into $InstallDir — and all an uninstall removes.
$Owned = @('app', 'app.new', 'app.old', 'node', 'node.new', 'node.old', 'bin', 'uninstall.ps1')

function Write-Title([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Step([string]$Text) { Write-Host "    $Text" }

function Get-Json([string]$Url) {
    Invoke-RestMethod -Uri $Url -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent }
}

function Invoke-Download([string]$Url, [string]$Path) {
    Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent }
}

# `<sha256>  <file>` lines — Node's SHASUMS256.txt and the one `shasum -a 256` writes for a release.
function Read-Checksums([string]$SumsPath) {
    $sums = @{}
    foreach ($line in Get-Content -LiteralPath $SumsPath) {
        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') { $sums[$Matches[2].Trim()] = $Matches[1].ToLowerInvariant() }
    }
    return $sums
}

function Assert-Hash([string]$Path, [string]$Expected) {
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected) {
        throw "checksum mismatch for $(Split-Path -Leaf $Path): expected $Expected, got $actual - the download is corrupt or was tampered with"
    }
    Write-Step "sha256 verified: $(Split-Path -Leaf $Path)"
}

function Expand-Zip([string]$Zip, [string]$Destination) {
    # Many times faster than Expand-Archive on Windows PowerShell 5.1 (Node's zip has thousands of
    # files), and ExtractToDirectory refuses entries that would land outside $Destination.
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
    # The OS architecture, not the shell's: an x64 PowerShell emulated on Windows-on-ARM still
    # reports AMD64 in PROCESSOR_ARCHITECTURE.
    $arch = $null
    try { $arch = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() } catch { $arch = $null }
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITEW6432 }
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
    switch -Regex ($arch) {
        '^(X64|AMD64)$' { return 'x64' }
        '^(Arm64|ARM64)$' { return 'arm64' }
        default { throw "devcoach needs a 64-bit Windows (x64 or ARM64); this is '$arch'" }
    }
}

# A release's download base: its SHASUMS256.txt names the standalone zip and carries its hash, so
# no GitHub API call (rate-limited per IP) is needed.
function Get-ReleaseBase {
    if ($Version) { return "$Releases/download/v$($Version.TrimStart('v'))" }
    if ($Channel -eq 'next') { return "$Releases/download/next" }
    return "$Releases/latest/download"
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

function Get-Major([string]$VersionText) {
    [int]($VersionText.Trim().TrimStart('v').Split('.')[0])
}

function Assert-InstallDirUsable {
    if (-not (Test-Path -LiteralPath $InstallDir)) { return }
    $entries = @(Get-ChildItem -LiteralPath $InstallDir -Force | Where-Object { $_.Name -notin $Owned })
    if ($entries.Count -gt 0 -and -not (Test-Path -LiteralPath $Uninstaller)) {
        throw "$InstallDir is not empty and is not a devcoach install ($($entries[0].Name), ...) - pick another -InstallDir"
    }
}

function Install-App([string]$Tmp) {
    if ($Archive) {
        $zip = (Resolve-Path -LiteralPath $Archive).Path
        Write-Title "Installing devcoach from $zip"
    } else {
        $base = Get-ReleaseBase
        $sums = Join-Path $Tmp 'devcoach-SHASUMS256.txt'
        try { Invoke-Download "$base/SHASUMS256.txt" $sums }
        catch { throw "could not read $base/SHASUMS256.txt - no such release, or the release predates the Windows installer (2.8.0). $($_.Exception.Message)" }
        $checksums = Read-Checksums $sums
        $name = @($checksums.Keys | Where-Object { $_ -like 'devcoach-*-standalone.zip' })
        if ($name.Count -eq 0) { throw "the release at $base has no standalone zip (the first release with one is 2.8.0): pass -Version 2.8.0 or newer" }
        $zip = Join-Path $Tmp $name[0]
        Write-Title "Downloading $($name[0])"
        Invoke-Download "$base/$($name[0])" $zip
        Assert-Hash $zip $checksums[$name[0]]
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

function Assert-NodeSignature([string]$Exe) {
    $signature = Get-AuthenticodeSignature -FilePath $Exe
    $subject = [string]$signature.SignerCertificate.Subject
    if ($signature.Status -eq 'Valid' -and $subject -match [regex]::Escape($NodeSigner)) {
        Write-Step "node.exe signed by $NodeSigner"
        return
    }
    $problem = "node.exe's Authenticode signature is '$($signature.Status)' by '$subject' (expected Valid, $NodeSigner)"
    if ($SkipSignatureCheck) { Write-Warning "$problem - accepted because of -SkipSignatureCheck"; return }
    throw "$problem - refusing to install it (DEVCOACH_SKIP_SIGNATURE_CHECK=1 overrides)"
}

function Install-Node([string]$Tmp) {
    $want = Resolve-NodeVersion
    $exe = Join-Path $NodeDir 'node.exe'
    $have = $null
    if (Test-Path -LiteralPath $exe) {
        $have = (& $exe --version).Trim().TrimStart('v')
        # Same LTS line = keep it: a patch bump is not worth a 40 MB download and a swap that fails
        # while an agent runs. -NodeVersion asks for exactly that version.
        $keep = $(if ($NodeVersion) { $have -eq $want } else { (Get-Major $have) -ge (Get-Major $want) })
        if ($keep) { Write-Title "Node $have already in place"; return }
    }
    $arch = Get-Arch
    $name = "node-v$want-win-$arch"
    Write-Title "Downloading Node $want ($arch) from nodejs.org"
    $zip = Join-Path $Tmp "$name.zip"
    $sums = Join-Path $Tmp 'node-SHASUMS256.txt'
    Invoke-Download "$NodeDist/v$want/$name.zip" $zip
    Invoke-Download "$NodeDist/v$want/SHASUMS256.txt" $sums
    $expected = (Read-Checksums $sums)["$name.zip"]
    if (-not $expected) { throw "$name.zip is not listed in Node's SHASUMS256.txt" }
    Assert-Hash $zip $expected
    $extract = Join-Path $Tmp 'node'
    Expand-Zip $zip $extract
    $fresh = Join-Path $InstallDir 'node.new'
    if (Test-Path -LiteralPath $fresh) { Remove-Item -LiteralPath $fresh -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $extract $name) -Destination $fresh
    if ($OnWindows) { Assert-NodeSignature (Join-Path $fresh 'node.exe') }
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
    if ((Get-Major $v) -lt $MinNodeMajor) {
        throw "node $v at $($node.Source) is too old - devcoach needs Node >= $MinNodeMajor (it uses the built-in node:sqlite)"
    }
    Write-Title "Using the system Node $v ($($node.Source))"
}

# Written as `%LOCALAPPDATA%\…` / `%USERPROFILE%\…` when the path sits under them: cmd.exe reads
# batch files in the OEM code page, and a literal path with accented letters would not survive it.
function Get-CmdPath([string]$Path) {
    foreach ($var in @('LOCALAPPDATA', 'USERPROFILE')) {
        $root = [Environment]::GetEnvironmentVariable($var)
        if ($root -and $Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
            return "%$var%" + $Path.Substring($root.Length)
        }
    }
    return $Path
}

function Get-OemEncoding {
    if (-not $OnWindows) { return (New-Object Text.UTF8Encoding $false) }
    $oem = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
    # "Use Unicode UTF-8 for worldwide language support": code page 65001 comes with a BOM that
    # cmd.exe would read as part of the first command.
    if ($oem.CodePage -eq 65001) { return (New-Object Text.UTF8Encoding $false) }
    return $oem
}

function Write-Launchers {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    $script = Join-Path (Join-Path $AppDir 'dist') 'bin.js'
    $node = $(if ($UseSystemNode) { 'node' } else { Join-Path $NodeDir 'node.exe' })
    $cmd = "@ECHO OFF`r`n`"$(Get-CmdPath $node)`" `"$(Get-CmdPath $script)`" %*`r`nEXIT /B %ERRORLEVEL%`r`n"
    [IO.File]::WriteAllText((Join-Path $BinDir 'devcoach.cmd'), $cmd, (Get-OemEncoding))
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
    # A courtesy to running Explorer windows and new consoles; Constrained Language Mode refuses
    # Add-Type, and the PATH is written either way.
    try {
        if (-not ('Devcoach.Native' -as [type])) {
            Add-Type -Namespace Devcoach -Name Native -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
        }
        $result = [UIntPtr]::Zero
        # HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG
        [Devcoach.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null
    } catch {
        Write-Step "PATH written; already-open programs see it after they restart ($($_.Exception.Message))"
    }
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
        UninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Uninstaller`""
    }
    foreach ($name in $props.Keys) { Set-ItemProperty -Path $UninstallKey -Name $name -Value $props[$name] }
    Set-ItemProperty -Path $UninstallKey -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $UninstallKey -Name NoRepair -Value 1 -Type DWord
    $kb = [int]((Get-ChildItem -LiteralPath $InstallDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB)
    Set-ItemProperty -Path $UninstallKey -Name EstimatedSize -Value $kb -Type DWord
}

# The uninstaller is a file on disk so Apps & Features (and -Uninstall) work offline, with the
# install dir baked in. It disconnects the agents first, removes only what install wrote, and
# drops the Apps & Features entry last — a failed step can be retried from Settings. UTF-8 WITH a
# BOM: Windows PowerShell 5.1 reads a BOM-less .ps1 in the ANSI code page (an accented user name
# would come out wrong).
function Write-Uninstaller {
    $dirLiteral = $InstallDir -replace "'", "''"
    $ownedLiteral = ($Owned | ForEach-Object { "'$_'" }) -join ', '
    $text = @"
# devcoach uninstaller - written by install.ps1. Disconnects your agents (devcoach uninstall --all),
# then removes the devcoach runtime in $InstallDir, its PATH entry and its Apps & Features entry.
# Your data in ~\.devcoach stays: run ``devcoach uninstall --data`` BEFORE this if you want it gone too.
`$ErrorActionPreference = 'Continue'
`$dir = '$dirLiteral'
`$owned = @($ownedLiteral)
`$launcher = Join-Path (Join-Path `$dir 'bin') 'devcoach.cmd'
if (Test-Path -LiteralPath `$launcher) { & `$launcher uninstall --all }
`$key = 'HKCU:\Environment'
`$raw = (Get-Item -Path `$key).GetValue('Path', '', 'DoNotExpandEnvironmentNames')
`$entry = Join-Path `$dir 'bin'
`$all = @(`$raw -split ';' | Where-Object { `$_ -ne '' })
`$kept = @(`$all | Where-Object { `$_ -ne `$entry })
if (`$kept.Count -ne `$all.Count) { Set-ItemProperty -Path `$key -Name Path -Value (`$kept -join ';') -Type ExpandString }
Set-Location -Path `$env:USERPROFILE
foreach (`$name in `$owned) {
    `$path = Join-Path `$dir `$name
    if (Test-Path -LiteralPath `$path) { Remove-Item -LiteralPath `$path -Recurse -Force }
}
if ((Test-Path -LiteralPath `$dir) -and @(Get-ChildItem -LiteralPath `$dir -Force).Count -eq 0) { Remove-Item -LiteralPath `$dir -Force }
Remove-Item -Path '$UninstallKey' -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "devcoach removed from `$dir (your data in ~\.devcoach is untouched). Terminals opened before this one still carry the old PATH."
"@
    [IO.File]::WriteAllText($Uninstaller, $text, (New-Object Text.UTF8Encoding $true))
}

if ($Uninstall) {
    if (-not (Test-Path -LiteralPath $Uninstaller)) { throw "nothing to remove: $Uninstaller does not exist" }
    # In-process: an execution policy that refuses .ps1 files does not apply to evaluated text.
    Invoke-Expression (Get-Content -LiteralPath $Uninstaller -Raw -Encoding UTF8)
    return
}

Write-Host ''
Write-Host 'devcoach for Windows' -ForegroundColor Cyan
Write-Host "    runtime: $InstallDir    data: $(Join-Path $HOME '.devcoach') (yours, never touched)"
Write-Host ''

Assert-InstallDirUsable
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
    Write-Host '    command:  devcoach      (this console has it; terminals opened earlier need reopening)'
    Write-Host '    update:   re-run the same one-liner'
    Write-Host "    remove:   $Uninstaller  (also under Apps & Features)"
    Write-Host '    docs:     https://ultimaphoenix.github.io/dev-coach/install/windows'
    Write-Host ''
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
}
