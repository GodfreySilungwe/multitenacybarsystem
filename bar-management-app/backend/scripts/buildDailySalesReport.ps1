$ErrorActionPreference = 'Stop'

$backendRoot = Split-Path -Parent $PSScriptRoot
$buildId = [guid]::NewGuid().ToString('N')
$stagePath = Join-Path ([System.IO.Path]::GetTempPath()) "daily-report-build-$buildId"
$zipTempPath = "$stagePath.zip"
$bundlePath = Join-Path $stagePath 'dailySalesReport.js'
$targetZipPath = Join-Path $backendRoot 'dailySalesReport.zip'

New-Item -ItemType Directory -Path $stagePath | Out-Null
Push-Location $backendRoot
try {
  & npx.cmd esbuild dailySalesReport.js --bundle --platform=node --target=node20 --outfile=$bundlePath
  if ($LASTEXITCODE -ne 0) {
    throw 'esbuild failed.'
  }

  Copy-Item -Path 'node_modules/pdfkit/js/data' -Destination (Join-Path $stagePath 'data') -Recurse

  & node.exe -e "const report = require(process.argv[1]); const reportWindow = report.getReportWindow('2026-10-10T04:05:00.000Z'); report.createSalesPdf({ barName: 'Build smoke test', orders: [{ totalAmount: 100, createdAt: '2026-10-09T10:00:00.000Z', items: [] }], window: reportWindow }).then((pdf) => { if (pdf.subarray(0, 5).toString() !== '%PDF-') process.exit(1); console.log('Bundled report PDF smoke test passed'); }).catch((error) => { console.error(error); process.exit(1); });" $bundlePath
  if ($LASTEXITCODE -ne 0) {
    throw 'Bundled report PDF smoke test failed.'
  }

  Compress-Archive -Path (Join-Path $stagePath '*') -DestinationPath $zipTempPath -Force
  Move-Item -Path $zipTempPath -Destination $targetZipPath -Force
  Get-Item $targetZipPath | Select-Object FullName, Length, LastWriteTime
} finally {
  Pop-Location
  if (Test-Path $stagePath) {
    Remove-Item -Path $stagePath -Recurse -Force
  }
  if (Test-Path $zipTempPath) {
    Remove-Item -Path $zipTempPath -Force
  }
}