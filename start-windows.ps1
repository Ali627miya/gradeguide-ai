# GradeGuide AI - one-click start for Windows PowerShell.
# Run from the project folder:   powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$root\backend"
if (-not (Test-Path ".venv")) { py -3 -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
if (-not (Test-Path ".env")) { Copy-Item .env.example .env }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"
Set-Location "$root\frontend"
if (-not (Test-Path "node_modules")) { npm install }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"
Start-Sleep -Seconds 6
Start-Process "http://localhost:5173"
