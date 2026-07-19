$exePath = "C:\Users\noteb\AppData\Local\Programs\Antigravity IDE\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe"
$content = [System.IO.File]::ReadAllText($exePath, [System.Text.Encoding]::ASCII)
$matches = [regex]::Matches($content, 'PLAYWRIGHT[A-Z_]*')
$unique = $matches | ForEach-Object { $_.Value } | Sort-Object -Unique
Write-Host "Found PLAYWRIGHT env vars:"
$unique | ForEach-Object { Write-Host "  $_" }

$driverMatches = [regex]::Matches($content, 'playwright.{0,50}driver')
Write-Host "`nFound 'playwright...driver' strings:"
$driverMatches | ForEach-Object { Write-Host "  $($_.Value)" } | Select-Object -First 10
