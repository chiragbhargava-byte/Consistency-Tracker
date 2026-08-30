@echo off
netstat -ano | findstr /r /c:":5500 .*LISTENING" >nul
if errorlevel 1 start "Consistency Tracker Server" /min node "%~dp0server.js"
start "" "http://127.0.0.1:5500/index.html"
