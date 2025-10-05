#!/bin/bash

# Enhanced Redback SmartBike IoT Kafka Startup Script
# This script starts all enhanced components of the Kafka-based IoT system

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/pids"

# Ensure directories exist
mkdir -p "$LOG_DIR" "$PID_DIR"

echo -e "${BLUE}🚀 Enhanced Redback SmartBike IoT Kafka System Startup${NC}"
echo -e "${BLUE}===============================================${NC}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to check if a process is running
is_running() {
    local pid_file="$1"
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Function to stop a service
stop_service() {
    local service_name="$1"
    local pid_file="$PID_DIR/${service_name}.pid"
    
    if is_running "$pid_file"; then
        local pid=$(cat "$pid_file")
        print_info "Stopping $service_name (PID: $pid)..."
        kill -TERM "$pid" 2>/dev/null || true
        
        # Wait for graceful shutdown
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 30 ]]; do
            sleep 1
            ((count++))
        done
        
        if ps -p "$pid" > /dev/null 2>&1; then
            print_warning "Force killing $service_name..."
            kill -KILL "$pid" 2>/dev/null || true
        fi
        
        rm -f "$pid_file"
        print_status "$service_name stopped"
    else
        print_info "$service_name is not running"
    fi
}

# Function to start a service
start_service() {
    local service_name="$1"
    local start_command="$2"
    local pid_file="$PID_DIR/${service_name}.pid"
    local log_file="$LOG_DIR/${service_name}.log"
    
    if is_running "$pid_file"; then
        print_warning "$service_name is already running"
        return 0
    fi
    
    print_info "Starting $service_name..."
    
    # Start the service in background
    nohup bash -c "$start_command" > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    # Wait a moment and check if it's still running
    sleep 2
    if ps -p "$pid" > /dev/null 2>&1; then
        print_status "$service_name started (PID: $pid)"
        return 0
    else
        print_error "$service_name failed to start"
        rm -f "$pid_file"
        return 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check if Kafka is running (optional check)
    if command -v kafkacat &> /dev/null; then
        if ! kafkacat -b localhost:9092 -L &> /dev/null; then
            print_warning "Kafka broker might not be running on localhost:9092"
            print_info "Make sure Kafka is started before running this script"
        else
            print_status "Kafka broker is accessible"
        fi
    fi
    
    # Check if MongoDB is running (optional check)
    if command -v mongosh &> /dev/null || command -v mongo &> /dev/null; then
        local mongo_cmd="mongosh"
        if ! command -v mongosh &> /dev/null; then
            mongo_cmd="mongo"
        fi
        
        if ! $mongo_cmd --eval "db.runCommand('ping')" localhost/smart-bike &> /dev/null; then
            print_warning "MongoDB might not be running on localhost:27017"
            print_info "Make sure MongoDB is started before running this script"
        else
            print_status "MongoDB is accessible"
        fi
    fi
    
    print_status "Prerequisites check completed"
}

# Function to install dependencies
install_dependencies() {
    print_info "Installing/updating dependencies..."
    
    cd "$PROJECT_ROOT/sensors-backend-kafka"
    if [[ -f "package.json" ]]; then
        npm install
        print_status "Backend dependencies installed"
    fi
    
    cd "$PROJECT_ROOT/websocket-kafka-bridge"
    if [[ -f "package.json" ]]; then
        npm install
        print_status "WebSocket bridge dependencies installed"
    fi
    
    cd "$PROJECT_ROOT/sensors-cms-frontend-kafka"
    if [[ -f "package.json" ]]; then
        npm install
        print_status "Frontend dependencies installed"
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to build TypeScript projects
build_projects() {
    print_info "Building TypeScript projects..."
    
    cd "$PROJECT_ROOT/sensors-backend-kafka"
    if [[ -f "tsconfig.json" ]]; then
        npm run build 2>/dev/null || npx tsc
        print_status "Backend built"
    fi
    
    cd "$PROJECT_ROOT/websocket-kafka-bridge"
    if [[ -f "tsconfig.json" ]]; then
        npm run build 2>/dev/null || npx tsc
        print_status "WebSocket bridge built"
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to start all services
start_all_services() {
    print_info "Starting all enhanced services..."
    
    # Start Enhanced Kafka Consumer
    start_service "enhanced-kafka-consumer" \
        "cd '$PROJECT_ROOT/sensors-backend-kafka' && node dist/services/sensor-data-processors/EnhancedKafkaFeed.js"
    
    # Start Original Kafka Consumer (fallback)
    start_service "kafka-consumer" \
        "cd '$PROJECT_ROOT/sensors-backend-kafka' && node dist/services/sensor-data-processors/KafkaFeed.js"
    
    # Start WebSocket Kafka Bridge
    start_service "websocket-bridge" \
        "cd '$PROJECT_ROOT/websocket-kafka-bridge' && node dist/server.js"
    
    # Start Backend API Server
    start_service "backend-api" \
        "cd '$PROJECT_ROOT/sensors-backend-kafka' && node dist/index.js"
    
    # Start Frontend (if in development mode)
    if [[ "${NODE_ENV:-development}" == "development" ]]; then
        start_service "frontend-dev" \
            "cd '$PROJECT_ROOT/sensors-cms-frontend-kafka' && npm start"
    fi
    
    # Start Health Monitor
    start_service "health-monitor" \
        "cd '$PROJECT_ROOT/sensors-backend-kafka' && node -e 'const {healthMonitor} = require(\"./dist/services/health-monitor\"); healthMonitor.startMonitoring().then(() => console.log(\"Health monitor started\")).catch(console.error); setInterval(() => console.log(healthMonitor.generateHealthReport()), 60000);'"
}

# Function to stop all services
stop_all_services() {
    print_info "Stopping all services..."
    
    stop_service "health-monitor"
    stop_service "frontend-dev"
    stop_service "backend-api"
    stop_service "websocket-bridge"
    stop_service "kafka-consumer"
    stop_service "enhanced-kafka-consumer"
    
    print_status "All services stopped"
}

# Function to show service status
show_status() {
    echo -e "${BLUE}📊 Service Status${NC}"
    echo -e "${BLUE}===============${NC}"
    
    local services=("enhanced-kafka-consumer" "kafka-consumer" "websocket-bridge" "backend-api" "frontend-dev" "health-monitor")
    
    for service in "${services[@]}"; do
        local pid_file="$PID_DIR/${service}.pid"
        if is_running "$pid_file"; then
            local pid=$(cat "$pid_file")
            echo -e "${GREEN}✅ $service (PID: $pid)${NC}"
        else
            echo -e "${RED}❌ $service (not running)${NC}"
        fi
    done
}

# Function to show logs
show_logs() {
    local service="$1"
    local log_file="$LOG_DIR/${service}.log"
    
    if [[ -f "$log_file" ]]; then
        echo -e "${BLUE}📋 Logs for $service${NC}"
        echo -e "${BLUE}==================${NC}"
        tail -f "$log_file"
    else
        print_error "Log file for $service not found"
    fi
}

# Function to cleanup old logs and pids
cleanup() {
    print_info "Cleaning up old logs and PID files..."
    
    # Remove old logs (older than 7 days)
    find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Remove stale PID files
    for pid_file in "$PID_DIR"/*.pid; do
        if [[ -f "$pid_file" ]]; then
            if ! is_running "$pid_file"; then
                rm -f "$pid_file"
            fi
        fi
    done
    
    print_status "Cleanup completed"
}

# Function to run health check
health_check() {
    print_info "Running health check..."
    
    # Check if services are running
    local all_healthy=true
    local services=("enhanced-kafka-consumer" "websocket-bridge" "backend-api")
    
    for service in "${services[@]}"; do
        local pid_file="$PID_DIR/${service}.pid"
        if ! is_running "$pid_file"; then
            print_error "$service is not running"
            all_healthy=false
        fi
    done
    
    # Check API endpoint
    if command -v curl &> /dev/null; then
        local api_port="${API_PORT:-3000}"
        if curl -s "http://localhost:$api_port/health" > /dev/null 2>&1; then
            print_status "API health check passed"
        else
            print_warning "API health check failed"
            all_healthy=false
        fi
    fi
    
    # Check WebSocket bridge
    local ws_port="${WEBSOCKET_PORT:-3001}"
    if curl -s "http://localhost:$ws_port/health" > /dev/null 2>&1; then
        print_status "WebSocket bridge health check passed"
    else
        print_warning "WebSocket bridge health check failed"
        all_healthy=false
    fi
    
    if [[ "$all_healthy" == true ]]; then
        print_status "All health checks passed"
        return 0
    else
        print_error "Some health checks failed"
        return 1
    fi
}

# Main script logic
case "${1:-start}" in
    "start")
        check_prerequisites
        install_dependencies
        build_projects
        start_all_services
        echo
        show_status
        echo
        print_status "Enhanced Redback SmartBike IoT system started successfully!"
        print_info "Use '$0 status' to check service status"
        print_info "Use '$0 logs <service>' to view logs"
        print_info "Use '$0 stop' to stop all services"
        ;;
    
    "stop")
        stop_all_services
        ;;
    
    "restart")
        stop_all_services
        sleep 2
        start_all_services
        show_status
        ;;
    
    "status")
        show_status
        ;;
    
    "logs")
        if [[ -z "$2" ]]; then
            print_error "Usage: $0 logs <service>"
            print_info "Available services: enhanced-kafka-consumer, kafka-consumer, websocket-bridge, backend-api, frontend-dev, health-monitor"
            exit 1
        fi
        show_logs "$2"
        ;;
    
    "health")
        health_check
        ;;
    
    "cleanup")
        cleanup
        ;;
    
    "install")
        check_prerequisites
        install_dependencies
        build_projects
        print_status "Installation completed"
        ;;
    
    "build")
        build_projects
        ;;
    
    *)
        echo "Enhanced Redback SmartBike IoT Kafka System"
        echo "Usage: $0 {start|stop|restart|status|logs <service>|health|cleanup|install|build}"
        echo
        echo "Commands:"
        echo "  start    - Start all enhanced services"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  status   - Show service status"
        echo "  logs     - Show logs for a specific service"
        echo "  health   - Run health check"
        echo "  cleanup  - Clean up old logs and PID files"
        echo "  install  - Install dependencies and build projects"
        echo "  build    - Build TypeScript projects"
        echo
        echo "Services:"
        echo "  enhanced-kafka-consumer - Enhanced Kafka message processor"
        echo "  kafka-consumer         - Original Kafka message processor"
        echo "  websocket-bridge       - WebSocket to Kafka bridge"
        echo "  backend-api           - REST API server"
        echo "  frontend-dev          - Development frontend server"
        echo "  health-monitor        - System health monitoring"
        exit 1
        ;;
esac
