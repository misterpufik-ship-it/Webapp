# Прямая выгрузка на BeGet (если VPS 82.202.129.7 недоступен)
param(
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\codex_beget_vps_ed25519",
    [string]$BegetHost = "mrpuffch.beget.tech",
    [string]$BegetUser = "mrpuffch",
    [string]$RemotePath = "/home/m/mrpuffch/nostradamus-1503.ru/public_html/webapp"
)

$ErrorActionPreference = "Stop"
$Source = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "public_html"

Write-Host "SCP -> $BegetUser@${BegetHost}:$RemotePath"
ssh -i $IdentityFile -o BatchMode=yes $BegetUser@$BegetHost "mkdir -p $RemotePath"
scp -i $IdentityFile -o BatchMode=yes -r "${Source}\*" "${BegetUser}@${BegetHost}:${RemotePath}/"
Write-Host "Done: https://nostradamus-1503.ru/webapp/"