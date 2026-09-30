@echo off
rem Lance Fajma en local : serveur Django (port 8000) + interface (port 8080), puis ouvre le navigateur.
rem Double-cliquez sur ce fichier. Fermez les deux fenetres noires pour tout arreter.
cd /d "%~dp0"

netstat -ano | findstr ":8000 " | findstr LISTENING >nul
if errorlevel 1 (
  start "Fajma - serveur" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"
)

netstat -ano | findstr ":8080 " | findstr LISTENING >nul
if errorlevel 1 (
  start "Fajma - interface" cmd /k "cd /d "%~dp0" && npx vite dev --port 8080"
)

timeout /t 8 /nobreak >nul
start "" http://localhost:8080/auth
