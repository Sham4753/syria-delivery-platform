param([string]$ProjectPath = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$winPath = (Resolve-Path $ProjectPath).Path
$wslPath = (wsl.exe wslpath -a ($winPath -replace '\\','/') | Out-String).Trim()
if (-not $wslPath) { throw 'تعذر تحويل مسار المشروع إلى WSL.' }
Write-Host "Project in WSL: $wslPath" -ForegroundColor Cyan
$script = @'
set -e
PROJECT="$1"
if ! command -v sudo >/dev/null; then echo "Ubuntu/WSL غير جاهز"; exit 1; fi
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3.12 python3.12-venv python3-pip
if ! command -v uv >/dev/null; then curl -LsSf https://astral.sh/uv/install.sh | sh; fi
export PATH="$HOME/.local/bin:$PATH"
mkdir -p "$PROJECT"
if [ ! -d "$PROJECT/openmanus/.git" ]; then git clone https://github.com/FoundationAgents/OpenManus.git "$PROJECT/openmanus"; else git -C "$PROJECT/openmanus" pull --ff-only; fi
cd "$PROJECT/openmanus"
uv venv --python 3.12
. .venv/bin/activate
uv pip install -r requirements.txt
mkdir -p config
if [ ! -f config/config.toml ]; then cp config/config.example.toml config/config.toml; fi
printf '\nOpenManus installed at %s\nEdit config/config.toml and add your LLM API key before running.\n' "$PROJECT/openmanus"
'@
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
wsl.exe bash -lc "echo $encoded | base64 -d > /tmp/install-openmanus.sh && bash /tmp/install-openmanus.sh '$wslPath'"
Write-Host 'تم تثبيت OpenManus. افتح config/config.toml وأضف مفتاح النموذج بنفسك.' -ForegroundColor Green
