@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install Ashen Grimoire.ps1"
if errorlevel 1 pause
