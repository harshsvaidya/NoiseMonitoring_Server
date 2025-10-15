
# ============================================
# Quick deployment script
# Place in: NoiseMonitoring_Server/deploy.sh
# ============================================

#!/bin/bash

echo "🚀 Noise Monitoring System Deployment"
echo "======================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp .env.example .env
    echo "⚠️  Please edit .env file with your passwords"
    exit 1
fi

# Build frontend
echo -e "${GREEN}Building frontend...${NC}"
cd NoiseFrontend
npm install
npm run build
cd ..

# Start Docker containers
echo -e "${GREEN}Starting Docker containers...${NC}"
docker-compose down
docker-compose up -d --build

# Wait for services
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Check health
echo -e "${GREEN}Checking services...${NC}"
docker-compose ps

echo ""
echo "✅ Deployment complete!"
echo "📊 Dashboard: http://localhost"
echo "🔌 API: http://localhost:3000/health"
echo ""
echo "Useful commands:"
echo "  docker-compose logs -f          # View logs"
echo "  docker-compose restart          # Restart all"
echo "  docker-compose down             # Stop all"