$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
$lines = Get-Content 'backend\uv.lock'
$targets = @('sqlalchemy', 'pydantic', 'fastapi', 'alembic', 'mypy', 'pytest')
for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  foreach ($t in $targets) {
    if ($line -eq ('name = "' + $t + '"')) {
      Write-Output ($t + ' ' + $lines[$i + 1])
    }
  }
}
