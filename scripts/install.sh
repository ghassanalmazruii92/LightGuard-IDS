#!/bin/bash
set -e
echo "Installing LightGuard IDS for Tadhamon Smart City..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Linux detected. Installing system dependencies with apt..."
    sudo apt update -y
    sudo apt install -y python3-pip python3-venv nmap masscan nodejs npm curl libpcap-dev
    # RustScan – fastest port scanner
    RUSTSCAN_DEB="rustscan_2.1.1_amd64.deb"
    wget -q "https://github.com/RustScan/RustScan/releases/download/2.1.1/${RUSTSCAN_DEB}" -O /tmp/${RUSTSCAN_DEB} \
      && sudo dpkg -i /tmp/${RUSTSCAN_DEB} || true
    
    # Network permissions for Scapy (no sudo needed at runtime)
    # We use a trick to find the real python path in venv later
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS detected. Installing tools via Homebrew..."
    command -v brew &>/dev/null || { echo "Homebrew not found – install from https://brew.sh"; exit 1; }
    brew install nmap node rustscan 2>/dev/null || true
fi

# Python env
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install fastapi uvicorn scapy scikit-learn joblib pandas \
            python-nmap websockets python-jose[cryptography] passlib[bcrypt] \
            python-dotenv sqlalchemy watchdog

# Grant capabilities to python in venv (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PYTHON_PATH=$(readlink -f venv/bin/python3)
    sudo setcap cap_net_raw,cap_net_admin+eip "$PYTHON_PATH"
fi

# Frontend
echo "Building React frontend..."
cd frontend
npm install
npm run build
cd ..

# Ensure config directory exists
mkdir -p config
if [ ! -f "config/lightguard.env" ]; then
    cp config/lightguard.env.example config/lightguard.env 2>/dev/null || echo "Using existing or manual config/lightguard.env"
fi

# ML model
echo "Training anomaly detection model..."
python3 ml/train.py

# Systemd service (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Setting up systemd service..."
    sudo tee /etc/systemd/system/lightguard.service > /dev/null <<EOF
[Unit]
Description=LightGuard IDS – Tadhamon Smart City
After=network.target

[Service]
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/venv/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable lightguard
    sudo systemctl start lightguard
fi

echo ""
echo "✅ LightGuard IDS installed and running"
echo "   Dashboard: http://localhost:8000"
echo "   Admin:     admin / lightguard123"
echo "   Viewer:    viewer / viewer123"
echo ""
echo "⚙️  Edit config/lightguard.env to set your NETWORK_CIDR and NETWORK_INTERFACE"
