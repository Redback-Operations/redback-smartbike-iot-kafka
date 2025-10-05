import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Kafka, EachMessagePayload } from 'kafkajs';
import {
  deviceDataModel,
  IMQTTDeviceData,
  IDeviceData,
} from '../../models/device-data';
import { DeviceType } from '../../models/device';

dotenv.config();

// Base interface for Kafka device data
interface IKafkaDeviceData {
  bikeId?: any;
  deviceId?: any;
  workoutId?: any;
  userId?: any;
  deviceName?: string;
  bikeName?: string;
  unitName: string;
  value: number;
  metadata?: object;
  reportedAt?: Date;
  timestamp?: number;
}

// Enhanced interface for Kafka device data with additional tracking fields
interface IEnhancedKafkaDeviceData extends IKafkaDeviceData {
  messageId: string;
  version: string;
  processingMetrics?: {
    receivedAt: Date;
    processedAt: Date;
    processingTime?: number;
  };
  qualityScore?: number;
  anomalyDetected?: boolean;
}

// Enhanced Kafka client with production-ready configuration
const kafka = new Kafka({
  clientId: 'enhanced-sensor-data-processor',
  brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8,
    maxRetryTime: 30000,
    factor: 2,
    multiplier: 2,
  },
  connectionTimeout: 5000,
  requestTimeout: 30000,
});

const consumer = kafka.consumer({ 
  groupId: 'enhanced-sensor-data-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 5000,
  allowAutoTopicCreation: false,
  retry: {
    retries: 5,
  }
});

// Dead letter queue and monitoring producers
const dlqProducer = kafka.producer();
const metricsProducer = kafka.producer();

// Device type mapping with enhanced validation
const ENHANCED_DEVICE_TYPE_MAP: Record<string, { type: DeviceType; validationRules: { min: number; max: number; unit: string } }> = {
  heartrate: { 
    type: DeviceType.heartRate, 
    validationRules: { min: 30, max: 220, unit: 'bpm' }
  },
  cadence: { 
    type: DeviceType.cadence, 
    validationRules: { min: 0, max: 200, unit: 'rpm' }
  },
  speed: { 
    type: DeviceType.speed, 
    validationRules: { min: 0, max: 80, unit: 'kmh' }
  },
  power: { 
    type: DeviceType.power, 
    validationRules: { min: 0, max: 2000, unit: 'watts' }
  },
  resistance: { 
    type: DeviceType.resistance, 
    validationRules: { min: 0, max: 100, unit: 'percent' }
  },
  incline: { 
    type: DeviceType.incline, 
    validationRules: { min: -50, max: 50, unit: 'percent' }
  },
  fan: { 
    type: DeviceType.fan, 
    validationRules: { min: 0, max: 100, unit: 'percent' }
  },
};

// Enhanced topic parsing with pattern support
function parseEnhancedKafkaTopic(topic: string): { 
  deviceId: string; 
  deviceType: DeviceType; 
  deviceConfig: any;
  isControlTopic: boolean;
} | null {
  const topicParts = topic.split('.');
  
  if (topicParts.length >= 3 && topicParts[0] === 'bike') {
    const deviceId = topicParts[1];
    const deviceTypeStr = topicParts[2];
    const isControlTopic = topicParts[3] === 'control';
    
    const deviceConfig = ENHANCED_DEVICE_TYPE_MAP[deviceTypeStr];
    
    if (deviceConfig) {
      return { 
        deviceId, 
        deviceType: deviceConfig.type, 
        deviceConfig,
        isControlTopic 
      };
    }
  }
  
  return null;
}

// Advanced data validation with quality scoring
function validateEnhancedKafkaDeviceData(
  data: any, 
  deviceConfig: any
): { isValid: boolean; data?: IEnhancedKafkaDeviceData; qualityScore: number; errors: string[] } {
  const errors: string[] = [];
  let qualityScore = 100;
  
  try {
    // Required field validation
    if (typeof data.value !== 'number' || isNaN(data.value)) {
      errors.push('Invalid or missing value field');
      qualityScore -= 50;
    }
    
    if (!data.unitName || typeof data.unitName !== 'string') {
      errors.push('Invalid or missing unitName field');
      qualityScore -= 30;
    }
    
    // Value range validation
    const { min, max, unit } = deviceConfig.validationRules;
    if (data.value < min || data.value > max) {
      errors.push(`Value ${data.value} out of range [${min}, ${max}] for unit ${unit}`);
      qualityScore -= 40;
    }
    
    // Unit consistency check
    if (data.unitName !== unit) {
      errors.push(`Unit mismatch: expected ${unit}, got ${data.unitName}`);
      qualityScore -= 20;
    }
    
    // Timestamp validation
    const now = Date.now();
    const messageTime = data.timestamp ? data.timestamp * 1000 : now;
    const timeDiff = Math.abs(now - messageTime);
    
    if (timeDiff > 5 * 60 * 1000) { // 5 minutes
      errors.push('Message timestamp is too old or in the future');
      qualityScore -= 10;
    }
    
    // Data completeness scoring
    if (!data.deviceId) qualityScore -= 5;
    if (!data.bikeId) qualityScore -= 5;
    if (!data.metadata) qualityScore -= 2;
    
    const enhancedData: IEnhancedKafkaDeviceData = {
      ...data,
      value: Number(data.value),
      timestamp: data.timestamp || Math.floor(now / 1000),
      reportedAt: data.reportedAt ? new Date(data.reportedAt) : new Date(),
      metadata: data.metadata || {},
      messageId: data.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      version: data.version || '2.0',
      processingMetrics: {
        receivedAt: new Date(),
        processedAt: new Date(), // Will be updated later
      },
      qualityScore: Math.max(0, qualityScore),
      anomalyDetected: qualityScore < 70, // Flag as anomaly if quality is low
    };
    
    return {
      isValid: errors.length === 0,
      data: enhancedData,
      qualityScore: Math.max(0, qualityScore),
      errors
    };
    
  } catch (error) {
    errors.push(`Validation error: ${error}`);
    return {
      isValid: false,
      qualityScore: 0,
      errors
    };
  }
}

// Enhanced save function with batch processing support
async function saveEnhancedDeviceData(
  deviceData: IEnhancedKafkaDeviceData,
  deviceId: string,
  deviceType: DeviceType,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      
      const newDeviceData = new deviceDataModel({
        value: deviceData.value,
        unitName: deviceData.unitName,
        timestamp: new Date(deviceData.timestamp * 1000),
        deviceType: deviceType,
        deviceId: deviceId,
        metadata: {
          ...deviceData.metadata,
          messageId: deviceData.messageId,
          version: deviceData.version,
          qualityScore: deviceData.qualityScore,
          anomalyDetected: deviceData.anomalyDetected,
          processingMetrics: deviceData.processingMetrics,
        },
        bikeName: deviceData.bikeName || deviceId,
        reportedAt: deviceData.reportedAt,
      });

      await newDeviceData.save();
      
      const processingTime = Date.now() - startTime;
      if (deviceData.processingMetrics) {
        deviceData.processingMetrics.processingTime = processingTime;
        deviceData.processingMetrics.processedAt = new Date();
      }
      
      // Send processing metrics to monitoring topic
      await sendProcessingMetrics(deviceId, deviceType, deviceData, processingTime);
      
      console.log(`✅ Enhanced save: ${deviceType} data for device ${deviceId}`, {
        value: deviceData.value,
        unitName: deviceData.unitName,
        messageId: deviceData.messageId,
        qualityScore: deviceData.qualityScore,
        processingTime: `${processingTime}ms`,
      });
      
      return; // Success
      
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ Save attempt ${attempt}/${maxRetries} failed for ${deviceType} device ${deviceId}:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Jittered exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`❌ All ${maxRetries} save attempts failed for ${deviceType} device ${deviceId}:`, lastError);
  throw lastError;
}

// Send processing metrics for monitoring
async function sendProcessingMetrics(
  deviceId: string,
  deviceType: DeviceType,
  deviceData: IEnhancedKafkaDeviceData,
  processingTime: number
): Promise<void> {
  try {
    const metrics = {
      deviceId,
      deviceType,
      messageId: deviceData.messageId,
      qualityScore: deviceData.qualityScore,
      processingTime,
      anomalyDetected: deviceData.anomalyDetected,
      timestamp: new Date().toISOString(),
    };

    await metricsProducer.send({
      topic: 'sensor.metrics',
      messages: [{
        key: `${deviceId}_${deviceType}`,
        value: JSON.stringify(metrics),
      }],
    });
  } catch (error) {
    console.warn('⚠️ Failed to send processing metrics:', error);
  }
}

// Enhanced dead letter queue with detailed error information
async function sendToEnhancedDLQ(
  originalTopic: string,
  originalMessage: any,
  errorType: string,
  error: Error,
  additionalContext?: any
): Promise<void> {
  try {
    const dlqTopic = `${originalTopic}.dlq.v2`;
    const dlqMessage = {
      key: originalMessage.key,
      value: JSON.stringify({
        originalTopic,
        originalValue: originalMessage.value?.toString(),
        originalHeaders: originalMessage.headers,
        errorType,
        errorMessage: error.message,
        errorStack: error.stack,
        additionalContext,
        timestamp: new Date().toISOString(),
        dlqVersion: '2.0',
      }),
      headers: {
        ...originalMessage.headers,
        'error-type': errorType,
        'original-topic': originalTopic,
        'dlq-version': '2.0',
        'error-timestamp': new Date().toISOString(),
      },
    };

    await dlqProducer.send({
      topic: dlqTopic,
      messages: [dlqMessage],
    });

    console.log(`📤 Enhanced DLQ: ${dlqTopic} - ${errorType}`);
  } catch (dlqError) {
    console.error('❌ Failed to send message to enhanced DLQ:', dlqError);
  }
}

// Main enhanced consumer function
const runEnhancedConsumer = async () => {
  console.log('🚀 Starting Enhanced Kafka Sensor Data Processor v2.0...');

  try {
    // Connect producers
    await dlqProducer.connect();
    await metricsProducer.connect();
    console.log('✅ Connected to DLQ and metrics producers');

    // Connect consumer
    await consumer.connect();
    console.log('✅ Connected to enhanced Kafka broker');

    // Dynamic topic subscription
    const topics = [
      // Static topics for known devices
      'bike.000001.heartrate',
      'bike.000001.cadence',
      'bike.000001.speed',
      'bike.000001.power',
      'bike.000001.resistance',
      'bike.000001.incline',
      'bike.000001.fan',
      // Control topics
      'bike.000001.heartrate.control',
      'bike.000001.cadence.control',
      'bike.000001.speed.control',
      'bike.000001.power.control',
      'bike.000001.resistance.control',
      'bike.000001.incline.control',
      'bike.000001.fan.control',
    ];

    await consumer.subscribe({ topics });
    console.log('✅ Enhanced topic subscription completed');

    let messageCount = 0;
    const startTime = Date.now();

    await consumer.run({
      partitionsConsumedConcurrently: 4,
      eachMessage: async ({ topic, partition, message, heartbeat }: EachMessagePayload) => {
        const processingStartTime = Date.now();
        messageCount++;
        
        try {
          await heartbeat();

          const messageValue = message.value?.toString();
          if (!messageValue) {
            console.warn(`⚠️ Empty message received from topic ${topic}`);
            return;
          }

          // Parse topic information
          const topicInfo = parseEnhancedKafkaTopic(topic);
          if (!topicInfo) {
            console.warn(`⚠️ Invalid topic format: ${topic}`);
            await sendToEnhancedDLQ(topic, message, 'INVALID_TOPIC_FORMAT', 
              new Error(`Invalid topic format: ${topic}`));
            return;
          }

          const { deviceId, deviceType, deviceConfig, isControlTopic } = topicInfo;

          // Skip control topics for now (could be handled separately)
          if (isControlTopic) {
            console.log(`🎮 Control message received for ${deviceId}:${deviceType}`);
            return;
          }

          // Parse and validate JSON payload
          let rawData: any;
          try {
            rawData = JSON.parse(messageValue);
          } catch (parseError) {
            console.error(`❌ JSON parse error for topic ${topic}:`, parseError);
            await sendToEnhancedDLQ(topic, message, 'JSON_PARSE_ERROR', 
              parseError as Error, { rawMessage: messageValue });
            return;
          }

          // Enhanced validation
          const validationResult = validateEnhancedKafkaDeviceData(rawData, deviceConfig);
          
          if (!validationResult.isValid) {
            console.warn(`⚠️ Validation failed for ${topic}:`, validationResult.errors);
            await sendToEnhancedDLQ(topic, message, 'VALIDATION_ERROR', 
              new Error(`Validation errors: ${validationResult.errors.join(', ')}`),
              { validationErrors: validationResult.errors, qualityScore: validationResult.qualityScore });
            
            // Still process if quality score is acceptable
            if (validationResult.qualityScore < 50) {
              return;
            }
          }

          const deviceData = validationResult.data!;

          // Save to database
          try {
            await saveEnhancedDeviceData(deviceData, deviceId, deviceType);
          } catch (saveError) {
            console.error(`❌ Save error for ${deviceType} device ${deviceId}:`, saveError);
            await sendToEnhancedDLQ(topic, message, 'DATABASE_SAVE_ERROR', 
              saveError as Error, { deviceData: deviceData });
            return;
          }

          // Log processing metrics every 100 messages
          if (messageCount % 100 === 0) {
            const avgProcessingTime = (Date.now() - startTime) / messageCount;
            console.log(`📊 Processed ${messageCount} messages, avg time: ${avgProcessingTime.toFixed(2)}ms`);
          }

          const processingTime = Date.now() - processingStartTime;
          if (processingTime > 1000) { // Log slow processing
            console.warn(`🐌 Slow processing: ${topic} took ${processingTime}ms`);
          }

        } catch (error) {
          console.error(`❌ Unexpected error processing message from topic ${topic}:`, error);
          await sendToEnhancedDLQ(topic, message, 'UNEXPECTED_ERROR', error as Error);
        }
      },
    });
  } catch (error) {
    console.error('❌ Error in enhanced Kafka consumer:', error);
    process.exit(1);
  }
};

// Enhanced graceful shutdown
const enhancedShutdown = async () => {
  console.log('\n🛑 Shutting down Enhanced Kafka Consumer v2.0...');
  try {
    console.log('📊 Disconnecting consumer...');
    await consumer.disconnect();
    
    console.log('📤 Disconnecting producers...');
    await dlqProducer.disconnect();
    await metricsProducer.disconnect();
    
    console.log('🗄️ Closing MongoDB connection...');
    await mongoose.connection.close();
    
    console.log('✅ Enhanced graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during enhanced shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', enhancedShutdown);
process.on('SIGTERM', enhancedShutdown);

// Enhanced startup with MongoDB connection
mongoose
  .connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/smart-bike', {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log('✅ Enhanced MongoDB connection established!');
    runEnhancedConsumer().catch(console.error);
  })
  .catch((error: any) => {
    console.error('❌ Enhanced MongoDB connection failed:', error);
    process.exit(1);
  });

export { runEnhancedConsumer, enhancedShutdown };
export default consumer;
