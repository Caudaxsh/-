@echo off
rem 以「應用程式視窗」開啟小尺寸版本(無網址列、無分頁),不需安裝任何東西。
rem 用法:雙擊即可。要開機自動啟動,把此檔案的捷徑放進 shell:startup。
set "APP=%~dp0index.html"
where msedge >nul 2>nul && (start "" msedge --app="file:///%APP:\=/%" --window-size=380,640 --window-position=40,40 & exit /b)
where chrome >nul 2>nul && (start "" chrome --app="file:///%APP:\=/%" --window-size=380,640 --window-position=40,40 & exit /b)
echo 找不到 Edge 或 Chrome,請手動開啟 index.html
pause
