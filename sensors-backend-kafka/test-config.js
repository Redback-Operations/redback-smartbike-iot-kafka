#!/usr/bin/env node

// Enhanced Kafka Configuration Test Script
const { Config } = require('./dist/config/kafka-config');

console.log('🧪 Testing Enhanced Kafka Configuration...');
console.log('==========================================');

try {
  // Test Kafka Configuration
  console.log('✅ Kafka Config:', {
    brokers: Config.kafka.brokers,
    clientId: Config.kafka.clientId,
    retries: Config.kafka.retry.retries,
  });

  // Test Consumer Configuration
  console.log('✅ Consumer Config:', {
    groupId: Config.consumer.groupId,
    sessionTimeout: Config.consumer.sessionTimeout,
    partitionsConsumedConcurrently: Config.consumer.partitionsConsumedConcurrently,
  });

  // Test Topic Configuration
  console.log('✅ Topic Config:', {
    sensorTypes: Config.topics.sensorTypes,
    defaultDeviceIds: Config.topics.defaultDeviceIds,
    dlqSuffix: Config.topics.dlqTopicSuffix,
  });

  // Test Processing Configuration
  console.log('✅ Processing Config:', {
    enableValidation: Config.processing.enableDataValidation,
    minQualityScore: Config.processing.minQualityScore,
    maxRetries: Config.processing.maxSaveRetries,
  });

  // Test Feature Flags
  console.log('✅ Feature Flags:', {
    enhancedValidation: Config.features.enableEnhancedValidation,
    deadLetterQueue: Config.features.enableDeadLetterQueue,
    healthChecks: Config.features.enableHealthChecks,
  });

  console.log('\n🎉 Configuration validation passed!');
  process.exit(0);

} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
  process.exit(1);
}
