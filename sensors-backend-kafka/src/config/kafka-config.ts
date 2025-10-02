import * as dotenv from 'dotenv';

dotenv.config();

// Enhanced Kafka Configuration
export const KafkaConfig = {
  // Broker Configuration
  brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
  clientId: process.env.KAFKA_CLIENT_ID || 'redback-smartbike-iot',
  
  // Security Configuration
  ssl: process.env.KAFKA_SSL_ENABLED === 'true',
  sasl: process.env.KAFKA_SASL_ENABLED === 'true' ? {
    mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
    username: process.env.KAFKA_SASL_USERNAME || '',
    password: process.env.KAFKA_SASL_PASSWORD || '',
  } : undefined,

  // Connection Configuration
  connectionTimeout: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '3000'),
  requestTimeout: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || '30000'),
  
  // Retry Configuration
  retry: {
    initialRetryTime: parseInt(process.env.KAFKA_INITIAL_RETRY_TIME || '100'),
    retries: parseInt(process.env.KAFKA_RETRIES || '8'),
    maxRetryTime: parseInt(process.env.KAFKA_MAX_RETRY_TIME || '30000'),
    factor: parseFloat(process.env.KAFKA_RETRY_FACTOR || '2'),
    multiplier: parseFloat(process.env.KAFKA_RETRY_MULTIPLIER || '2'),
  },
};

// Enhanced Consumer Configuration
export const ConsumerConfig = {
  groupId: process.env.KAFKA_CONSUMER_GROUP_ID || 'sensor-data-group',
  sessionTimeout: parseInt(process.env.KAFKA_SESSION_TIMEOUT || '30000'),
  heartbeatInterval: parseInt(process.env.KAFKA_HEARTBEAT_INTERVAL || '3000'),
  maxWaitTimeInMs: parseInt(process.env.KAFKA_MAX_WAIT_TIME || '5000'),
  allowAutoTopicCreation: process.env.KAFKA_ALLOW_AUTO_TOPIC_CREATION === 'true',
  partitionsConsumedConcurrently: parseInt(process.env.KAFKA_CONCURRENT_PARTITIONS || '3'),
  
  // Enhanced retry configuration for consumer
  retry: {
    retries: parseInt(process.env.KAFKA_CONSUMER_RETRIES || '5'),
  },
};

// Producer Configuration
export const ProducerConfig = {
  maxInFlightRequests: parseInt(process.env.KAFKA_MAX_IN_FLIGHT || '1'),
  idempotent: process.env.KAFKA_IDEMPOTENT === 'true',
  transactionTimeout: parseInt(process.env.KAFKA_TRANSACTION_TIMEOUT || '30000'),
  
  // Batching configuration
  retry: {
    retries: parseInt(process.env.KAFKA_PRODUCER_RETRIES || '5'),
  },
};

// Topic Configuration
export const TopicConfig = {
  // Sensor data topics pattern
  sensorTopicPattern: process.env.SENSOR_TOPIC_PATTERN || 'bike.{deviceId}.{sensorType}',
  
  // Control topics pattern
  controlTopicPattern: process.env.CONTROL_TOPIC_PATTERN || 'bike.{deviceId}.{sensorType}.control',
  
  // Dead letter queue topics
  dlqTopicSuffix: process.env.DLQ_TOPIC_SUFFIX || '.dlq',
  
  // Metrics topics
  metricsTopicPrefix: process.env.METRICS_TOPIC_PREFIX || 'sensor.metrics',
  
  // Default device IDs to monitor
  defaultDeviceIds: (process.env.DEFAULT_DEVICE_IDS || '000001').split(','),
  
  // Sensor types
  sensorTypes: [
    'heartrate',
    'cadence', 
    'speed',
    'power',
    'resistance',
    'incline',
    'fan'
  ],
};

// Database Configuration
export const DatabaseConfig = {
  mongoUrl: process.env.MONGODB_URL || 'mongodb://localhost:27017/smart-bike',
  mongoOptions: {
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10'),
    serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT || '5000'),
    socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT || '45000'),
    connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT || '10000'),
  },
};

// Processing Configuration
export const ProcessingConfig = {
  // Data validation settings
  enableDataValidation: process.env.ENABLE_DATA_VALIDATION !== 'false',
  minQualityScore: parseInt(process.env.MIN_QUALITY_SCORE || '50'),
  enableAnomalyDetection: process.env.ENABLE_ANOMALY_DETECTION === 'true',
  
  // Retry settings for database operations
  maxSaveRetries: parseInt(process.env.MAX_SAVE_RETRIES || '3'),
  saveRetryDelayMs: parseInt(process.env.SAVE_RETRY_DELAY_MS || '1000'),
  
  // Performance monitoring
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  slowProcessingThresholdMs: parseInt(process.env.SLOW_PROCESSING_THRESHOLD_MS || '1000'),
  metricsReportingIntervalMessages: parseInt(process.env.METRICS_REPORTING_INTERVAL || '100'),
  
  // Message aging tolerance
  maxMessageAgeMs: parseInt(process.env.MAX_MESSAGE_AGE_MS || '300000'), // 5 minutes
};

// WebSocket Bridge Configuration
export const WebSocketConfig = {
  port: parseInt(process.env.WEBSOCKET_PORT || '3001'),
  corsOrigin: process.env.FRONTEND_URL || 'http://localhost:3000',
  enableSSE: process.env.ENABLE_SSE !== 'false',
  
  // Connection management
  connectionTimeoutMs: parseInt(process.env.WS_CONNECTION_TIMEOUT_MS || '300000'), // 5 minutes
  heartbeatIntervalMs: parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000'), // 30 seconds
  maxConnections: parseInt(process.env.MAX_WS_CONNECTIONS || '1000'),
  
  // Enhanced features
  enableConnectionTracking: process.env.ENABLE_CONNECTION_TRACKING !== 'false',
  enableSubscriptionManagement: process.env.ENABLE_SUBSCRIPTION_MANAGEMENT !== 'false',
};

// Security Configuration
export const SecurityConfig = {
  // Basic Auth for API
  basicAuthUsername: process.env.BASIC_AUTH_USERNAME || 'admin',
  basicAuthPassword: process.env.BASIC_AUTH_PASSWORD || 'password123',
  
  // JWT Configuration (future enhancement)
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpirationTime: process.env.JWT_EXPIRATION || '1h',
  
  // Rate limiting
  enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
};

// Logging Configuration
export const LoggingConfig = {
  logLevel: process.env.LOG_LEVEL || 'info',
  enableConsoleLogging: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
  enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
  logFilePath: process.env.LOG_FILE_PATH || './logs/smartbike.log',
  
  // Structured logging
  enableStructuredLogging: process.env.ENABLE_STRUCTURED_LOGGING === 'true',
  logFormat: process.env.LOG_FORMAT || 'combined',
};

// Feature Flags
export const FeatureFlags = {
  enableEnhancedValidation: process.env.ENABLE_ENHANCED_VALIDATION !== 'false',
  enableDeadLetterQueue: process.env.ENABLE_DLQ !== 'false',
  enableMetricsReporting: process.env.ENABLE_METRICS_REPORTING === 'true',
  enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
  enableGracefulShutdown: process.env.ENABLE_GRACEFUL_SHUTDOWN !== 'false',
  enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING === 'true',
  enableCompressionInTransit: process.env.ENABLE_COMPRESSION === 'true',
};

// Development/Testing Configuration
export const DevConfig = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  enableDebugLogging: process.env.ENABLE_DEBUG_LOGGING === 'true',
  mockDataEnabled: process.env.ENABLE_MOCK_DATA === 'true',
  skipDatabaseOperations: process.env.SKIP_DATABASE_OPS === 'true',
};

// Export all configurations
export const Config = {
  kafka: KafkaConfig,
  consumer: ConsumerConfig,
  producer: ProducerConfig,
  topics: TopicConfig,
  database: DatabaseConfig,
  processing: ProcessingConfig,
  websocket: WebSocketConfig,
  security: SecurityConfig,
  logging: LoggingConfig,
  features: FeatureFlags,
  dev: DevConfig,
};

export default Config;
