#!/bin/bash
# LightGuard IDS – Tadhamon Smart City
set -e

cd "$(dirname "$0")/.."

# Load environment variables (skip lines with Arabic/comments)
if [ -f config/lightguard.env ]; then
  while IFS= read -r line; do
    # Skip blank lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Only export lines matching KEY=VALUE (ASCII key names)
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      export "$line"
    fi
  done < config/lightguard.env
fi

# Activate virtual environment
source venv/bin/activate

echo "================================================"
echo " LightGuard IDS – مدينة التضامن الذكية"
echo " Dashboard: http://localhost:8000"
echo " Default: admin / lightguard123"
echo "================================================"

uvicorn backend.main:app --host 0.0.0.0 --port 8000
