@ECHO OFF
REM devcoach launcher (standalone zip). Prefers a private node.exe next to this tree -
REM install.ps1 puts one in ..\node - and falls back to the node on the PATH (Scoop: nodejs-lts).
SETLOCAL
SET "_dp0=%~dp0"
SET "_node=node"
IF EXIST "%_dp0%node\node.exe" SET "_node=%_dp0%node\node.exe"
IF EXIST "%_dp0%..\node\node.exe" SET "_node=%_dp0%..\node\node.exe"
"%_node%" "%_dp0%dist\bin.js" %*
EXIT /B %ERRORLEVEL%
