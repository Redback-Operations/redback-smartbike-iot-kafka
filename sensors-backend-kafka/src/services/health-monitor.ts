import * as dotenv from 'dotenv';
import { Kafka, Producer, Consumer } from 'kafkajs';
import mongoose from 'mongoose';
import { Config } from '../config/kafka-config';

dotenv.config();

interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  details?: any;
  responseTime?: number;
}

interface SystemMetrics {
  timestamp: string;
  kafka: {
    messagesProcessed: number;
    messagesPerSecond: number;
    averageProcessingTime: number;
    errors: number;
    deadLetterQueueCount: number;
  };
  database: {
    connections: number;
    operationsPerSecond: number;
    averageResponseTime: number;
    errors: number;
  };
  websocket: {
    activeConnections: number;
    messagesForwarded: number;
    subscriptions: number;
  };
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage?: number;
  };
}

export class HealthMonitorService {
  private kafka: Kafka;
  private healthProducer?: Producer;
  private metricsConsumer?: Consumer;
  private metrics: SystemMetrics;
  private isMonitoring: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;
  
  // Metrics tracking
  private kafkaMessageCount = 0;
  private kafkaErrorCount = 0;
  private processingTimes: number[] = [];
  private databaseOperationCount = 0;
  private databaseErrorCount = 0;
  private websocketConnections = 0;
  private websocketSubscriptions = 0;
  private startTime = Date.now();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'health-monitor-service',
      brokers: Config.kafka.brokers,
      retry: Config.kafka.retry,
    });

    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): SystemMetrics {
    return {
      timestamp: new Date().toISOString(),
      kafka: {
        messagesProcessed: 0,
        messagesPerSecond: 0,
        averageProcessingTime: 0,
        errors: 0,
        deadLetterQueueCount: 0,
      },
      database: {
        connections: 0,
        operationsPerSecond: 0,
        averageResponseTime: 0,
        errors: 0,
      },
      websocket: {
        activeConnections: 0,
        messagesForwarded: 0,
        subscriptions: 0,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Health monitoring already started');
      return;
    }

    try {
      // Initialize health producer
      this.healthProducer = this.kafka.producer();
      await this.healthProducer.connect();

      // Initialize metrics consumer to track DLQ messages
      this.metricsConsumer = this.kafka.consumer({ 
        groupId: 'health-monitor-dlq-group' 
      });
      await this.metricsConsumer.connect();
      
      // Subscribe to DLQ topics to count failed messages
      await this.metricsConsumer.subscribe({ 
        topics: [/.*\.dlq$/] 
      });

      await this.metricsConsumer.run({
        eachMessage: async ({ topic }) => {
          this.metrics.kafka.deadLetterQueueCount++;
          console.log(`📊 DLQ message tracked: ${topic}`);
        },
      });

      this.isMonitoring = true;

      // Start periodic health checks
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
        this.updateMetrics();
        this.publishHealthStatus();
      }, 30000); // Every 30 seconds

      console.log('✅ Health monitoring service started');
    } catch (error) {
      console.error('❌ Failed to start health monitoring:', error);
      throw error;
    }
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) return;

    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      if (this.healthProducer) {
        await this.healthProducer.disconnect();
      }

      if (this.metricsConsumer) {
        await this.metricsConsumer.disconnect();
      }

      this.isMonitoring = false;
      console.log('✅ Health monitoring service stopped');
    } catch (error) {
      console.error('❌ Error stopping health monitoring:', error);
    }
  }

  // Public methods for tracking metrics
  trackKafkaMessage(processingTime: number): void {
    this.kafkaMessageCount++;
    this.processingTimes.push(processingTime);
    
    // Keep only last 1000 processing times for memory efficiency
    if (this.processingTimes.length > 1000) {
      this.processingTimes = this.processingTimes.slice(-1000);
    }
  }

  trackKafkaError(): void {
    this.kafkaErrorCount++;
  }

  trackDatabaseOperation(): void {
    this.databaseOperationCount++;
  }

  trackDatabaseError(): void {
    this.databaseErrorCount++;
  }

  updateWebSocketConnections(count: number): void {
    this.websocketConnections = count;
  }

  updateWebSocketSubscriptions(count: number): void {
    this.websocketSubscriptions = count;
  }

  private async performHealthCheck(): Promise<HealthStatus[]> {
    const checks: HealthStatus[] = [];

    // Kafka Health Check
    const kafkaHealth = await this.checkKafkaHealth();
    checks.push(kafkaHealth);

    // Database Health Check
    const dbHealth = await this.checkDatabaseHealth();
    checks.push(dbHealth);

    // System Health Check
    const systemHealth = this.checkSystemHealth();
    checks.push(systemHealth);

    return checks;
  }

  private async checkKafkaHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      if (!this.healthProducer) {
        throw new Error('Health producer not initialized');
      }

      // Test Kafka connectivity by sending a health check message
      await this.healthProducer.send({
        topic: 'health.check',
        messages: [{
          key: 'health-check',
          value: JSON.stringify({
            service: 'health-monitor',
            timestamp: new Date().toISOString(),
            type: 'connectivity-check'
          })
        }]
      });

      const responseTime = Date.now() - startTime;

      return {
        service: 'kafka',
        status: responseTime < 5000 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          brokers: Config.kafka.brokers,
          messagesProcessed: this.kafkaMessageCount,
          errors: this.kafkaErrorCount,
          averageProcessingTime: this.getAverageProcessingTime(),
        }
      };
    } catch (error) {
      return {
        service: 'kafka',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          brokers: Config.kafka.brokers,
        }
      };
    }
  }

  private async checkDatabaseHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      // Check MongoDB connection
      const dbState = mongoose.connection.readyState;
      const connectionStates = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      const responseTime = Date.now() - startTime;

      return {
        service: 'database',
        status: dbState === 1 ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          connectionState: connectionStates[dbState as keyof typeof connectionStates],
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          name: mongoose.connection.name,
          operations: this.databaseOperationCount,
          errors: this.databaseErrorCount,
        }
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      };
    }
  }

  private checkSystemHealth(): HealthStatus {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Check memory usage (consider unhealthy if using more than 1GB)
    const memoryThreshold = 1024 * 1024 * 1024; // 1GB
    const isMemoryHealthy = memoryUsage.heapUsed < memoryThreshold;
    
    // Check uptime (degraded if less than 1 minute, indicating recent restart)
    const isUptimeHealthy = uptime > 60;

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (!isMemoryHealthy) {
      status = 'unhealthy';
    } else if (!isUptimeHealthy) {
      status = 'degraded';
    }

    return {
      service: 'system',
      status,
      timestamp: new Date().toISOString(),
      details: {
        memoryUsage: {
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        },
        uptime: `${Math.round(uptime)}s`,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      }
    };
  }

  private updateMetrics(): void {
    const now = new Date().toISOString();
    const runtime = Date.now() - this.startTime;
    const runtimeSeconds = runtime / 1000;

    this.metrics = {
      timestamp: now,
      kafka: {
        messagesProcessed: this.kafkaMessageCount,
        messagesPerSecond: runtimeSeconds > 0 ? this.kafkaMessageCount / runtimeSeconds : 0,
        averageProcessingTime: this.getAverageProcessingTime(),
        errors: this.kafkaErrorCount,
        deadLetterQueueCount: this.metrics.kafka.deadLetterQueueCount,
      },
      database: {
        connections: mongoose.connection.readyState,
        operationsPerSecond: runtimeSeconds > 0 ? this.databaseOperationCount / runtimeSeconds : 0,
        averageResponseTime: 0, // TODO: Implement database response time tracking
        errors: this.databaseErrorCount,
      },
      websocket: {
        activeConnections: this.websocketConnections,
        messagesForwarded: 0, // TODO: Track WebSocket message forwarding
        subscriptions: this.websocketSubscriptions,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }

  private async publishHealthStatus(): Promise<void> {
    try {
      if (!this.healthProducer) return;

      const healthData = {
        timestamp: new Date().toISOString(),
        service: 'redback-smartbike-iot',
        version: process.env.npm_package_version || '1.0.0',
        metrics: this.metrics,
        environment: process.env.NODE_ENV || 'development',
      };

      await this.healthProducer.send({
        topic: 'system.health',
        messages: [{
          key: 'health-status',
          value: JSON.stringify(healthData)
        }]
      });

      if (Config.dev.enableDebugLogging) {
        console.log('📊 Published health status:', {
          timestamp: healthData.timestamp,
          kafkaMessages: this.metrics.kafka.messagesProcessed,
          kafkaErrors: this.metrics.kafka.errors,
          dbOperations: this.metrics.database.operationsPerSecond,
          wsConnections: this.metrics.websocket.activeConnections,
        });
      }
    } catch (error) {
      console.error('❌ Failed to publish health status:', error);
    }
  }

  private getAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) return 0;
    
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    return sum / this.processingTimes.length;
  }

  // Public getter for current metrics
  getMetrics(): SystemMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  // Public method to get current health status
  async getCurrentHealthStatus(): Promise<HealthStatus[]> {
    return await this.performHealthCheck();
  }

  // Method to generate health report
  generateHealthReport(): string {
    const metrics = this.getMetrics();
    const uptime = Math.round(metrics.system.uptime / 60); // Convert to minutes
    
    return `
🏥 REDBACK SMARTBIKE IOT HEALTH REPORT
=====================================
📅 Timestamp: ${metrics.timestamp}
⏱️  Uptime: ${uptime} minutes

📨 KAFKA METRICS:
  • Messages Processed: ${metrics.kafka.messagesProcessed}
  • Messages/Second: ${metrics.kafka.messagesPerSecond.toFixed(2)}
  • Average Processing Time: ${metrics.kafka.averageProcessingTime.toFixed(2)}ms
  • Errors: ${metrics.kafka.errors}
  • DLQ Messages: ${metrics.kafka.deadLetterQueueCount}

🗄️  DATABASE METRICS:
  • Connection State: ${metrics.database.connections === 1 ? 'Connected' : 'Disconnected'}
  • Operations/Second: ${metrics.database.operationsPerSecond.toFixed(2)}
  • Errors: ${metrics.database.errors}

🌐 WEBSOCKET METRICS:
  • Active Connections: ${metrics.websocket.activeConnections}
  • Active Subscriptions: ${metrics.websocket.subscriptions}

💻 SYSTEM METRICS:
  • Memory Used: ${Math.round(metrics.system.memoryUsage.heapUsed / 1024 / 1024)}MB
  • Memory Total: ${Math.round(metrics.system.memoryUsage.heapTotal / 1024 / 1024)}MB
  • Node Version: ${process.version}
=====================================
    `.trim();
  }
}

// Singleton instance
export const healthMonitor = new HealthMonitorService();

// Export types for external use
export type { HealthStatus, SystemMetrics };
