import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import moment from 'moment';
import { Kafka, EachMessagePayload } from 'kafkajs';
import {
  deviceDataModel,
  IMQTTDeviceData,
  IDeviceData,
} from '../../models/device-data';
import { DeviceType } from '../../models/device';

dotenv.config();

// Enhanced interface for Kafka device data payload
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
  timestamp?: number; // Unix timestamp for Kafka messages
  // New fields for enhanced tracking
  messageId?: string;
  version?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

// Enhanced Kafka client with retry configuration
const kafka = new Kafka({
  clientId: 'sensor-data-processor',
  brokers: [process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8,
    maxRetryTime: 30000,
    factor: 2,
    multiplier: 2,
  },
  connectionTimeout: 3000,
  requestTimeout: 30000,
});

const consumer = kafka.consumer({ 
  groupId: 'sensor-data-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 5000,
  retry: {
    retries: 5,
  }
});

// Dead letter queue producer for failed messages
const dlqProducer = kafka.producer();

// Device type mapping from Kafka topics
const DEVICE_TYPE_MAP: Record<string, DeviceType> = {
  heartrate: DeviceType.heartRate,
  cadence: DeviceType.cadence,
  speed: DeviceType.speed,
  power: DeviceType.power,
  resistance: DeviceType.resistance,
  incline: DeviceType.incline,
  fan: DeviceType.fan,
};

// Enhanced value validation by device type
function validateValueForDeviceType(value: number, deviceType: DeviceType): boolean {
  const validationRules: Record<DeviceType, { min: number; max: number }> = {
    [DeviceType.heartRate]: { min: 30, max: 220 },
    [DeviceType.cadence]: { min: 0, max: 200 },
    [DeviceType.speed]: { min: 0, max: 80 },
    [DeviceType.power]: { min: 0, max: 2000 },
    [DeviceType.resistance]: { min: 0, max: 100 },
    [DeviceType.incline]: { min: -50, max: 50 },
    [DeviceType.fan]: { min: 0, max: 100 },
  };

  const rule = validationRules[deviceType];
  return rule ? value >= rule.min && value <= rule.max : true;
}

// Data validation function
function validateKafkaDeviceData(data: any): IKafkaDeviceData | null {
  try {
    // Check required fields
    if (typeof data.value !== 'number' || isNaN(data.value)) {
      throw new Error('Invalid or missing value field');
    }
    
    if (!data.unitName || typeof data.unitName !== 'string') {
      throw new Error('Invalid or missing unitName field');
    }

    // Create validated data object
    const validatedData: IKafkaDeviceData = {
      ...data,
      value: Number(data.value),
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      reportedAt: data.reportedAt ? new Date(data.reportedAt) : new Date(),
      metadata: data.metadata || {},
      messageId: data.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      version: data.version || '1.0',
    };

    return validatedData;
  } catch (error) {
    console.error('❌ Data validation failed:', error);
    return null;
  }
}

// Function to extract device info from Kafka topic
function parseKafkaTopic(
  topic: string
): { deviceId: string; deviceType: DeviceType } | null {
  // Expected format: bike.{deviceId}.{deviceType}
  const topicParts = topic.split('.');

  if (topicParts.length >= 3 && topicParts[0] === 'bike') {
    const deviceId = topicParts[1];
    const deviceType = DEVICE_TYPE_MAP[topicParts[2]];

    if (deviceType) {
      return { deviceId, deviceType };
    }
  }

  return null;
}

// Enhanced save function with retry logic
async function saveDeviceDataWithRetry(
  deviceData: IKafkaDeviceData,
  deviceId: string,
  deviceType: DeviceType,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await saveDeviceData(deviceData, deviceId, deviceType);
      return; // Success, exit retry loop
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed for ${deviceType} device ${deviceId}:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`❌ All ${maxRetries} attempts failed for ${deviceType} device ${deviceId}:`, lastError);
  throw lastError;
}

// Dead letter queue function
async function sendToDeadLetterQueue(
  originalTopic: string,
  originalMessage: any,
  errorType: string,
  error: Error
): Promise<void> {
  try {
    const dlqTopic = `${originalTopic}.dlq`;
    const dlqMessage = {
      key: originalMessage.key,
      value: JSON.stringify({
        originalTopic,
        originalValue: originalMessage.value?.toString(),
        errorType,
        errorMessage: error.message,
        timestamp: new Date().toISOString(),
        headers: originalMessage.headers,
      }),
      headers: {
        ...originalMessage.headers,
        'error-type': errorType,
        'original-topic': originalTopic,
      },
    };

    await dlqProducer.send({
      topic: dlqTopic,
      messages: [dlqMessage],
    });

    console.log(`📤 Sent message to DLQ: ${dlqTopic}`);
  } catch (dlqError) {
    console.error('❌ Failed to send message to DLQ:', dlqError);
  }
}

// Function to save device data to MongoDB
async function saveDeviceData(
  deviceData: IKafkaDeviceData,
  deviceId: string,
  deviceType: DeviceType
) {
  try {
    const newDeviceData = new deviceDataModel({
      value: Number(deviceData.value),
      unitName: deviceData.unitName,
      timestamp: deviceData.timestamp
        ? new Date(deviceData.timestamp * 1000)
        : new Date(),
      deviceType: deviceType,
      deviceId: deviceId,
      metadata: {
        ...deviceData.metadata,
        messageId: deviceData.messageId,
        version: deviceData.version,
        location: deviceData.location,
      },
      bikeName: deviceData.bikeName || deviceId,
      reportedAt: deviceData.reportedAt
        ? new Date(deviceData.reportedAt)
        : new Date(),
    });

    await newDeviceData.save();
    console.log(`✅ Saved ${deviceType} data for device ${deviceId}:`, {
      value: newDeviceData.value,
      unitName: newDeviceData.unitName,
      timestamp: newDeviceData.timestamp,
      messageId: deviceData.messageId,
    });
  } catch (error) {
    console.error(
      `❌ Failed to save ${deviceType} data for device ${deviceId}:`,
      error
    );
    throw error; // Re-throw for retry logic
  }
}

// Enhanced main Kafka consumer function
const run = async () => {
  console.log('🚀 Starting enhanced Kafka sensor data processor...');

  try {
    // Connect DLQ producer
    await dlqProducer.connect();
    console.log('✅ Connected to DLQ producer');

    // Connect to Kafka
    await consumer.connect();
    console.log('✅ Connected to Kafka broker');

    // Enhanced topic subscription with pattern matching
    await consumer.subscribe({
      topics: [
        'bike.000001.heartrate',
        'bike.000001.cadence',
        'bike.000001.speed',
        'bike.000001.power',
        'bike.000001.resistance',
        'bike.000001.incline',
        'bike.000001.fan',
        // Add pattern for dynamic device discovery
        'bike.*.heartrate',
        'bike.*.cadence',
        'bike.*.speed',
        'bike.*.power',
        'bike.*.resistance',
        'bike.*.incline',
        'bike.*.fan',
      ],
    });
    console.log('✅ Subscribed to enhanced Kafka topics');

    // Start consuming messages with enhanced processing
    await consumer.run({
      partitionsConsumedConcurrently: 3, // Process multiple partitions
      eachMessage: async ({
        topic,
        partition,
        message,
        heartbeat,
      }: EachMessagePayload) => {
        const startTime = Date.now();
        
        try {
          // Call heartbeat to prevent session timeout
          await heartbeat();

          const messageValue = message.value?.toString();
          if (!messageValue) {
            console.warn(`⚠️ Empty message received from topic ${topic}`);
            return;
          }

          console.log(`📨 [${topic}] Processing message...`);

          // Parse device info from topic
          const topicInfo = parseKafkaTopic(topic);
          if (!topicInfo) {
            console.warn(`⚠️ Invalid topic format: ${topic}`);
            await sendToDeadLetterQueue(topic, message, 'INVALID_TOPIC', new Error(`Invalid topic format: ${topic}`));
            return;
          }

          const { deviceId, deviceType } = topicInfo;

          // Parse and validate JSON payload
          let deviceData: IKafkaDeviceData;
          try {
            const rawData = JSON.parse(messageValue);
            const validatedData = validateKafkaDeviceData(rawData);
            
            if (!validatedData) {
              throw new Error('Data validation failed');
            }
            
            deviceData = validatedData;
          } catch (parseError) {
            console.error(`❌ Failed to parse/validate JSON from topic ${topic}:`, parseError);
            await sendToDeadLetterQueue(topic, message, 'PARSE_ERROR', parseError as Error);
            return;
          }

          // Validate value for device type
          if (!validateValueForDeviceType(deviceData.value, deviceType)) {
            console.warn(`⚠️ Value ${deviceData.value} out of range for ${deviceType} device ${deviceId}`);
            await sendToDeadLetterQueue(topic, message, 'VALUE_OUT_OF_RANGE', new Error(`Value ${deviceData.value} out of range for ${deviceType}`));
            return;
          }

          // Save to database with retry
          try {
            await saveDeviceDataWithRetry(deviceData, deviceId, deviceType);
          } catch (saveError) {
            console.error(`❌ Failed to save after retries for ${deviceType} device ${deviceId}:`, saveError);
            await sendToDeadLetterQueue(topic, message, 'SAVE_ERROR', saveError as Error);
            return;
          }

          // Log processing metrics
          const processingTime = Date.now() - startTime;
          console.log(`✅ Processed ${topic} in ${processingTime}ms`);

        } catch (error) {
          console.error(`❌ Error processing message from topic ${topic}:`, error);
          await sendToDeadLetterQueue(topic, message, 'PROCESSING_ERROR', error as Error);
        }
      },
    });
  } catch (error) {
    console.error('❌ Error in enhanced Kafka consumer:', error);
    process.exit(1);
  }
};

// Enhanced graceful shutdown handling
const shutdown = async () => {
  console.log('\n🛑 Shutting down enhanced Kafka consumer...');
  try {
    // Disconnect consumer first
    await consumer.disconnect();
    console.log('✅ Kafka consumer disconnected');
    
    // Disconnect DLQ producer
    await dlqProducer.disconnect();
    console.log('✅ DLQ producer disconnected');
    
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/smart-bike')
  .then(() => {
    console.log('✅ Connected to MongoDB!');
    // Start Kafka consumer after MongoDB connection is established
    run().catch(console.error);
  })
  .catch((error: any) => {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  });

export default consumer;
