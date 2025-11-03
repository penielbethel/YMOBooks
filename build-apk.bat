@echo off
echo Building YmoBooks APK for manual installation...
echo.

REM Create release directory if it doesn't exist
if not exist "release" mkdir release

echo Step 1: Building Android bundle...
call npx expo export --platform android --output-dir release/bundle

echo.
echo Step 2: Creating development APK...
call npx expo run:android --variant debug --no-install

echo.
echo Step 3: Copying APK to release folder...
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    copy "android\app\build\outputs\apk\debug\app-debug.apk" "release\YmoBooks-debug.apk"
    echo APK copied to release\YmoBooks-debug.apk
) else (
    echo APK not found in expected location
    echo Searching for APK files...
    dir /s android\*.apk
)

echo.
echo Build process completed!
echo Check the release folder for your APK file.
pause