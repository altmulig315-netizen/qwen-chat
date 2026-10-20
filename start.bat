@echo off
REM Abliterated — start serveren (hvis den ikke kjorer) og apne nettsiden.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
