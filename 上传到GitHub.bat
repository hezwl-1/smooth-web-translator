@echo off
chcp 65001 >nul
title 上传 Smooth Web Translator 到 GitHub
cd /d "%~dp0"

echo ========================================
echo Smooth Web Translator GitHub 上传工具
echo 作者：hez
echo 说明：这是 hez 使用 GPT-5.5 开发的浏览器插件
echo ========================================
echo.
echo 第一步：请先在 GitHub 新建一个空仓库。
echo 推荐仓库名：smooth-web-translator
echo 新建地址：https://github.com/new
echo.
echo 注意：不要勾选 Add a README file，因为本地已经有 README。
echo.
set /p repo=请粘贴你的 GitHub 仓库 HTTPS 地址，例如 https://github.com/你的用户名/smooth-web-translator.git ：
if "%repo%"=="" (
  echo 你没有输入仓库地址。
  pause
  exit /b 1
)

git --version >nul 2>nul
if errorlevel 1 (
  echo 没找到 git，请先安装 Git for Windows。
  pause
  exit /b 1
)

git remote remove origin >nul 2>nul
git remote add origin "%repo%"
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo 上传失败。
  echo 如果提示登录，请按 GitHub 弹窗登录后再运行一次。
  pause
  exit /b 1
)

echo.
echo 上传成功！
echo 仓库地址：%repo%
pause
