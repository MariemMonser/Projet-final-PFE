@echo off
setlocal EnableDelayedExpansion

REM Pipeline ETL : charges Node.js -> extraction Python -> import energie app
REM -> staging -> transformation -> DW -> modele de risque.
set SCRIPT_DIR=%~dp0
set LOG_DIR=%SCRIPT_DIR%logs
set PYTHON=python
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f "tokens=1-3 delims=/ " %%a in ("%DATE%") do set DATE_TAG=%%c%%b%%a
for /f "tokens=1-2 delims=:." %%a in ("%TIME: =0%") do set TIME_TAG=%%a%%b
set LOG_FILE=%LOG_DIR%\etl_%DATE_TAG%_%TIME_TAG%.log

pushd "%SCRIPT_DIR%"
echo PIPELINE ETL - risque de panne >> "%LOG_FILE%"

echo [1/7] Extraction des charges employes...
node extract_charges.js >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :erreur

echo [2/7] Extraction des autres sources...
%PYTHON% "extract.py" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :erreur

for %%S in (import_energie_app.py load_staging.py transformation.py load_dwtest.py retrain_model.py) do (
    echo Execution de %%S...
    echo Execution de %%S >> "%LOG_FILE%"
    %PYTHON% "%%S" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 goto :erreur
)

popd
echo PIPELINE TERMINE AVEC SUCCES
echo SUCCES >> "%LOG_FILE%"
exit /b 0

:erreur
popd
echo PIPELINE ECHOUE - consultez %LOG_FILE%
echo ECHEC >> "%LOG_FILE%"
exit /b 1
