<#
.SYNOPSIS
  Checks the Authenticode signature of one or more Windows executables.

.DESCRIPTION
  For every path given, reports whether the file exists, its signature status, signer subject, issuer and
  certificate validity dates, and clearly separates three outcomes:
    SIGNED   - Get-AuthenticodeSignature says Valid
    UNSIGNED - the file carries no signature (NotSigned)
    INVALID  - a signature is present but not valid (HashMismatch, NotTrusted, UnknownError, ...)
  Exit codes: 0 = every file passed, 1 = a file is missing, 2 = a file is unsigned, 3 = a signature is invalid.
  When several problems occur, the highest code wins.

  This script never signs anything and never changes the files.

.PARAMETER Path
  One or more files (wildcards allowed), e.g. release\*.exe

.PARAMETER AllowUnsigned
  Treat UNSIGNED files as acceptable (local unsigned builds). INVALID signatures and missing files still fail.

.PARAMETER ExpectedSigner
  Optional text that must appear in the signer certificate subject (e.g. the subject SignPath Foundation's
  certificate carries). If omitted, any valid signer passes - the subject is printed so a person can check it.

.EXAMPLE
  powershell -File apps\desktop\scripts\verify-signatures.ps1 -AllowUnsigned "apps\desktop\release\DASH Setup 0.1.0.exe"

.EXAMPLE
  powershell -File apps\desktop\scripts\verify-signatures.ps1 apps\desktop\release\*.exe
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
  [string[]] $Path,
  [switch] $AllowUnsigned,
  [string] $ExpectedSigner = ''
)

$ErrorActionPreference = 'Stop'
$worst = 0
function Raise([int] $code) { if ($code -gt $script:worst) { $script:worst = $code } }

# Expand wildcards; keep literal paths that do not exist so they are reported as missing.
$files = @()
foreach ($p in $Path) {
  if ([System.Management.Automation.WildcardPattern]::ContainsWildcardCharacters($p)) {
    $found = @(Get-ChildItem -Path $p -File -ErrorAction SilentlyContinue)
    if ($found.Count -eq 0) { $files += $p } else { $files += $found.FullName }
  } else {
    $files += $p
  }
}

foreach ($file in $files) {
  Write-Host ''
  Write-Host "File:       $file"
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    Write-Host 'Result:     MISSING - file does not exist' -ForegroundColor Red
    Raise 1
    continue
  }

  $sig = Get-AuthenticodeSignature -LiteralPath $file
  $status = [string] $sig.Status
  Write-Host "Status:     $status"
  # For NotSigned, Windows' own message talks about "running a script" and execution policy, which is confusing here:
  # it is only saying the file has no signature. Print our own wording instead.
  if ($status -eq 'NotSigned') { Write-Host 'Message:    the file carries no Authenticode signature' }
  elseif ($sig.StatusMessage) { Write-Host "Message:    $($sig.StatusMessage)" }

  if ($status -eq 'NotSigned') {
    if ($AllowUnsigned) {
      Write-Host 'Result:     UNSIGNED (allowed by -AllowUnsigned) - this file has no Authenticode signature' -ForegroundColor Yellow
    } else {
      Write-Host 'Result:     UNSIGNED - this file has no Authenticode signature' -ForegroundColor Red
      Raise 2
    }
    continue
  }

  $cert = $sig.SignerCertificate
  if ($cert) {
    Write-Host "Signer:     $($cert.Subject)"
    Write-Host "Issuer:     $($cert.Issuer)"
    Write-Host "Valid from: $($cert.NotBefore.ToString('u'))"
    Write-Host "Valid to:   $($cert.NotAfter.ToString('u'))"
    Write-Host "Thumbprint: $($cert.Thumbprint)"
  }
  if ($sig.TimeStamperCertificate) {
    Write-Host "Timestamp:  $($sig.TimeStamperCertificate.Subject)"
  } else {
    Write-Host 'Timestamp:  none (the signature stops being trusted when the certificate expires)'
  }

  if ($status -ne 'Valid') {
    Write-Host "Result:     INVALID - a signature is present but is not valid ($status)" -ForegroundColor Red
    Raise 3
    continue
  }
  if ($ExpectedSigner -and (-not $cert -or $cert.Subject -notlike "*$ExpectedSigner*")) {
    Write-Host "Result:     INVALID - signer does not contain the expected text '$ExpectedSigner'" -ForegroundColor Red
    Raise 3
    continue
  }
  Write-Host 'Result:     SIGNED - signature is valid' -ForegroundColor Green
}

Write-Host ''
switch ($worst) {
  0 { Write-Host 'All files passed.' }
  1 { Write-Host 'FAILED: at least one file is missing.' -ForegroundColor Red }
  2 { Write-Host 'FAILED: at least one file is unsigned.' -ForegroundColor Red }
  3 { Write-Host 'FAILED: at least one signature is invalid.' -ForegroundColor Red }
}
exit $worst
