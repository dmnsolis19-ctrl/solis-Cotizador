$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Compilando SOLIS..."
& npx.cmd vinext build
if ($LASTEXITCODE -ne 0) { throw "La compilación de SOLIS no finalizó correctamente." }

$configPath = Join-Path $projectRoot "dist\server\wrangler.json"
if (-not (Test-Path $configPath)) { throw "No se encontró la configuración generada: $configPath" }

$config = Get-Content $configPath -Raw | ConvertFrom-Json
if (-not $config.d1_databases -or $config.d1_databases.Count -lt 1) { throw "La configuración generada no contiene el binding D1." }
if (-not $config.r2_buckets -or $config.r2_buckets.Count -lt 1) { throw "La configuración generada no contiene el binding R2." }

$config.name = "solis-cotizador"
$config.d1_databases[0].binding = "DB"
$config.d1_databases[0].database_name = "solis-cotizador-db"
$config.d1_databases[0].database_id = "e3194dc1-7516-4514-ac97-8d3585be2e9f"
$config.r2_buckets[0].binding = "BUCKET"
$config.r2_buckets[0].bucket_name = "solis-cotizador-documents"

[System.IO.File]::WriteAllText(
  $configPath,
  ($config | ConvertTo-Json -Depth 100),
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "Publicando SOLIS en Cloudflare..."
& npx.cmd wrangler deploy --config $configPath
if ($LASTEXITCODE -ne 0) { throw "Cloudflare no confirmó el despliegue." }
