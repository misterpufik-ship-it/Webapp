param(
    [string]$VpsHost = "82.202.129.7",
    [string]$VpsUser = "root",
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\codex_beget_vps_ed25519"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Source = Join-Path $RepoRoot "public_html"
$Remote = "$VpsUser@$VpsHost"
$RemoteDir = "/tmp/webapp-deploy"
$BegetPath = "/home/m/mrpuffch/nostradamus-1503.ru/public_html/webapp"

if (!(Test-Path $IdentityFile)) {
    throw "Missing SSH key: $IdentityFile"
}
if (!(Test-Path $Source)) {
    throw "Missing: $Source"
}

Write-Host "Webapp -> BeGet (nostradamus-1503.ru/webapp/)..."
ssh -i $IdentityFile -o BatchMode=yes -o ConnectTimeout=20 $Remote "rm -rf $RemoteDir && mkdir -p $RemoteDir && chown -R deploy:deploy $RemoteDir"
scp -i $IdentityFile -o BatchMode=yes -r "${Source}\*" "${Remote}:$RemoteDir/"

$remoteCmd = @(
    "chown -R deploy:deploy $RemoteDir",
    "sudo -u deploy rsync -az $RemoteDir/ mrpuffch@mrpuffch.beget.tech:$BegetPath/"
) -join "; "

ssh -i $IdentityFile -o BatchMode=yes -o ConnectTimeout=120 $Remote $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "BeGet deploy failed." }

Write-Host "Done: https://nostradamus-1503.ru/webapp/"