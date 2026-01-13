@echo off
setlocal enabledelayedexpansion

set "BASE_DIR=%~dp0..\tts_resources"

:menu
cls
echo ============================================
echo    Clean TTS Resources
echo ============================================
echo.
echo Available folders:
echo.

set "count=0"
set "has_items=0"

if exist "%BASE_DIR%\silero" (
    set /a count+=1
    set "dir1=silero"
    echo   1. silero
    set "has_items=1"
)

if exist "%BASE_DIR%\rhvoice" (
    set /a count+=1
    if !count!==1 (set "dir1=rhvoice") else if !count!==2 (set "dir2=rhvoice") else if !count!==3 (set "dir3=rhvoice") else if !count!==4 (set "dir4=rhvoice") else (set "dir5=rhvoice")
    echo   !count!. rhvoice
    set "has_items=1"
)

if exist "%BASE_DIR%\ffmpeg" (
    set /a count+=1
    if !count!==1 (set "dir1=ffmpeg") else if !count!==2 (set "dir2=ffmpeg") else if !count!==3 (set "dir3=ffmpeg") else if !count!==4 (set "dir4=ffmpeg") else (set "dir5=ffmpeg")
    echo   !count!. ffmpeg
    set "has_items=1"
)

if exist "%BASE_DIR%\xtts-mobile" (
    set /a count+=1
    if !count!==1 (set "dir1=xtts-mobile") else if !count!==2 (set "dir2=xtts-mobile") else if !count!==3 (set "dir3=xtts-mobile") else if !count!==4 (set "dir4=xtts-mobile") else (set "dir5=xtts-mobile")
    echo   !count!. xtts-mobile
    set "has_items=1"
)


if exist "%BASE_DIR%\coqui" (
    set /a count+=1
    if !count!==1 (set "dir1=coqui") else if !count!==2 (set "dir2=coqui") else if !count!==3 (set "dir3=coqui") else if !count!==4 (set "dir4=coqui") else (set "dir5=coqui")
    echo   !count!. coqui
    set "has_items=1"
)

if exist "%BASE_DIR%\piper" (
    set /a count+=1
    if !count!==1 (set "dir1=piper") else if !count!==2 (set "dir2=piper") else if !count!==3 (set "dir3=piper") else if !count!==4 (set "dir4=piper") else (set "dir5=piper")
    echo   !count!. piper
    set "has_items=1"
)

echo.

if "!has_items!"=="0" (
    echo   No folders found.
    echo.
    pause
    exit /b 0
)

set /a all_num=count+1
echo   !all_num!. Delete ALL
echo.
echo   0. Exit
echo.
echo ============================================

set /p "choice=Select (0-!all_num!): "

if "!choice!"=="0" (
    echo.
    echo Exiting...
    exit /b 0
)

if "!choice!"=="!all_num!" (
    echo.
    set /p "confirm=Delete ALL folders? (y/n): "
    if /i "!confirm!"=="y" (
        if defined dir1 (
            echo Deleting !dir1!...
            rmdir /s /q "%BASE_DIR%\!dir1!" 2>nul
        )
        if defined dir2 (
            echo Deleting !dir2!...
            rmdir /s /q "%BASE_DIR%\!dir2!" 2>nul
        )
        if defined dir3 (
            echo Deleting !dir3!...
            rmdir /s /q "%BASE_DIR%\!dir3!" 2>nul
        )
        if defined dir4 (
            echo Deleting !dir4!...
            rmdir /s /q "%BASE_DIR%\!dir4!" 2>nul
        )
        if defined dir5 (
            echo Deleting !dir5!...
            rmdir /s /q "%BASE_DIR%\!dir5!" 2>nul
        )
        echo Done.
    ) else (
        echo Cancelled.
    )
    echo.
    pause
    goto menu
)

if "!choice!"=="1" if defined dir1 (
    set "target=!dir1!"
    goto delete_single
)
if "!choice!"=="2" if defined dir2 (
    set "target=!dir2!"
    goto delete_single
)
if "!choice!"=="3" if defined dir3 (
    set "target=!dir3!"
    goto delete_single
)
if "!choice!"=="4" if defined dir4 (
    set "target=!dir4!"
    goto delete_single
)
if "!choice!"=="5" if defined dir5 (
    set "target=!dir5!"
    goto delete_single
)

echo.
echo Invalid choice!
pause
goto menu

:delete_single
echo.
set /p "confirm=Delete !target!? (y/n): "
if /i "!confirm!"=="y" (
    echo Deleting !target!...
    rmdir /s /q "%BASE_DIR%\!target!" 2>nul
    if exist "%BASE_DIR%\!target!" (
        echo   Error deleting !target!
    ) else (
        echo   !target! deleted successfully
    )
) else (
    echo Cancelled.
)
echo.
pause
goto menu
