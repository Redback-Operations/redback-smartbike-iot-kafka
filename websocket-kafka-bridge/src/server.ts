import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { Kafka, EachMessagePayload } from 'kafkajs';

dotenv.config();

// Initialize Express app
const app = express();
const server = createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Enable CORS for Express
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json());

// Initialize Kafka client with enhanced configuration
const kafka = new Kafka({
  clientId: 'websocket-kafka-bridge',
  brokers: [process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 5,
    maxRetryTime: 30000,
    factor: 2,
    multiplier: 2,
  },
  connectionTimeout: 3000,
  requestTimeout: 30000,
});

const consumer = kafka.consumer({ 
  groupId: 'websocket-bridge-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 5000,
  retry: {
    retries: 3,
  }
});
const producer = kafka.producer();

// Device type mapping
const DEVICE_TYPES = [
  'heartrate',
  'cadence',
  'speed',
  'power',
  'resistance',
  'incline',
  'fan',
];

// Enhanced connection tracking interface
interface ConnectionInfo {
  id: string;
  type: 'websocket' | 'sse';
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Set<string>;
  deviceId?: string;
  connection: any; // Store the actual connection object
}

// Store active WebSocket connections with enhanced tracking
const activeConnections = new Map<string, ConnectionInfo>();

// Connection cleanup interval
setInterval(() => {
  const now = new Date();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes

  activeConnections.forEach((connectionInfo, id) => {
    if (now.getTime() - connectionInfo.lastActivity.getTime() > staleThreshold) {
      console.log(`🧹 Removing stale connection: ${id}`);
      activeConnections.delete(id);
    }
  });
}, 60 * 1000); // Check every minute

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connections: activeConnections.size,
  });
});

// Server-Sent Events endpoint for real-time data
app.get('/events', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin':
      process.env.FRONTEND_URL || 'http://localhost:3000',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Send initial connection message
  res.write(
    'data: {"type":"connected","message":"SSE connection established"}\n\n'
  );

  // Store connection with enhanced tracking
  const connectionId = `sse_${Date.now()}`;
  const connectionInfo: ConnectionInfo = {
    id: connectionId,
    type: 'sse',
    connectedAt: new Date(),
    lastActivity: new Date(),
    subscriptions: new Set(),
    connection: res,
  };
  
  activeConnections.set(connectionId, connectionInfo);

  // Handle client disconnect
  req.on('close', () => {
    activeConnections.delete(connectionId);
    console.log(`SSE client disconnected: ${connectionId}`);
  });

  console.log(`SSE client connected: ${connectionId}`);
});

// Enhanced WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);

  // Store WebSocket connection with enhanced tracking
  const connectionInfo: ConnectionInfo = {
    id: socket.id,
    type: 'websocket',
    connectedAt: new Date(),
    lastActivity: new Date(),
    subscriptions: new Set(),
    connection: socket,
  };
  
  activeConnections.set(socket.id, connectionInfo);

  // Enhanced device subscription handling
  socket.on(
    'subscribe',
    (data: { deviceId: string; deviceTypes?: string[] }) => {
      const connectionInfo = activeConnections.get(socket.id);
      if (!connectionInfo) return;

      const { deviceId, deviceTypes = DEVICE_TYPES } = data;

      console.log(
        `Client ${
          socket.id
        } subscribing to device ${deviceId} for types: ${deviceTypes.join(
          ', '
        )}`
      );

      // Update connection info
      connectionInfo.deviceId = deviceId;
      connectionInfo.lastActivity = new Date();

      // Join rooms for specific device and types
      deviceTypes.forEach((type) => {
        const room = `device_${deviceId}_${type}`;
        connectionInfo.subscriptions.add(room);
        socket.join(room);
      });

      socket.emit('subscribed', { deviceId, deviceTypes });
    }
  );

  // Handle control command publishing
  socket.on(
    'publish_control',
    async (data: {
      deviceId: string;
      controlType: string;
      value: number;
      command: string;
    }) => {
      try {
        const topic = `bike.${data.deviceId}.${data.controlType}.control`;
        const payload = {
          value: data.value,
          unitName: getUnitForControlType(data.controlType),
          timestamp: Date.now() / 1000,
          command: data.command,
        };

        await producer.send({
          topic,
          messages: [{ value: JSON.stringify(payload) }],
        });

        console.log(`Published control command: ${topic}`, payload);
        socket.emit('control_published', { topic, payload });
      } catch (error) {
        console.error('Error publishing control command:', error);
        socket.emit('error', { message: 'Failed to publish control command' });
      }
    }
  );

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
    activeConnections.delete(socket.id);
  });
});

// Enhanced Kafka consumer to forward messages to WebSocket clients
const startKafkaConsumer = async () => {
  try {
    await consumer.connect();
    console.log('✅ Kafka consumer connected');

    // Subscribe to all sensor data topics with pattern matching
    const topics = [];
    for (const deviceId of ['000001', '*']) { // Add wildcard pattern support
      for (const type of DEVICE_TYPES) {
        topics.push(`bike.${deviceId}.${type}`);
        topics.push(`bike.${deviceId}.${type}.report`);
      }
    }

    await consumer.subscribe({ topics });
    console.log('✅ Subscribed to enhanced Kafka topics:', topics);

    await consumer.run({
      partitionsConsumedConcurrently: 2, // Process multiple partitions
      eachMessage: async ({ topic, message, heartbeat }: EachMessagePayload) => {
        try {
          // Call heartbeat to prevent session timeout
          await heartbeat();

          const messageValue = message.value?.toString();
          if (!messageValue) {
            console.warn(`⚠️ Empty message received from topic ${topic}`);
            return;
          }

          const data = JSON.parse(messageValue);

          // Extract device info from topic
          const topicParts = topic.split('.');
          if (topicParts.length >= 3) {
            const deviceId = topicParts[1];
            const deviceType = topicParts[2];
            const isReport = topicParts[3] === 'report';

            const messageData = {
              topic,
              deviceId,
              deviceType,
              isReport,
              data: {
                ...data,
                timestamp: data.timestamp || new Date().toISOString(),
                messageId: data.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              },
              receivedAt: new Date().toISOString(),
            };

            // Send to WebSocket clients in relevant rooms
            const room = `device_${deviceId}_${deviceType}`;
            io.to(room).emit('sensor_data', messageData);

            // Update activity for connected clients
            activeConnections.forEach((connectionInfo) => {
              if (connectionInfo.type === 'websocket' && connectionInfo.subscriptions.has(room)) {
                connectionInfo.lastActivity = new Date();
              }
            });

            // Send to SSE clients
            const sseMessage = `data: ${JSON.stringify(messageData)}\n\n`;
            activeConnections.forEach((connectionInfo, id) => {
              if (id.startsWith('sse_')) {
                try {
                  connectionInfo.connection.write(sseMessage);
                  connectionInfo.lastActivity = new Date();
                } catch (error) {
                  console.error(`Error sending SSE message to ${id}:`, error);
                  activeConnections.delete(id);
                }
              }
            });

            console.log(
              `📡 Enhanced forwarded ${topic} to ${activeConnections.size} clients`
            );
          }
        } catch (error) {
          console.error('❌ Error processing enhanced Kafka message:', error);
        }
      },
    });
  } catch (error) {
    console.error('❌ Error starting enhanced Kafka consumer:', error);
    process.exit(1);
  }
};

// Initialize Kafka producer
const startKafkaProducer = async () => {
  try {
    await producer.connect();
    console.log('✅ Kafka producer connected');
  } catch (error) {
    console.error('❌ Error starting Kafka producer:', error);
    process.exit(1);
  }
};

// Helper function to get unit for control type
function getUnitForControlType(controlType: string): string {
  switch (controlType) {
    case 'fan':
    case 'incline':
      return 'percent';
    case 'resistance':
      return 'level';
    default:
      return 'unit';
  }
}

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down WebSocket-Kafka bridge...');

  try {
    // Close WebSocket connections
    io.close();

    // Close Kafka connections
    await consumer.disconnect();
    await producer.disconnect();

    // Close HTTP server
    server.close(() => {
      console.log('✅ Server shut down gracefully');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start the server
const PORT = process.env.PORT || 3001;

const startServer = async () => {
  // Initialize Kafka connections
  await startKafkaProducer();
  await startKafkaConsumer();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`🚀 WebSocket-Kafka Bridge running on port ${PORT}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`📊 SSE endpoint: http://localhost:${PORT}/events`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  });
};

startServer().catch(console.error);

export default app;
