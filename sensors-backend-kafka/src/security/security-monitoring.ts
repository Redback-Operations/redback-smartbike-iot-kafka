// Security Monitoring System with SIEM-like capabilities
// Assignment 4: Security Monitoring Implementation

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  source: string;
  deviceId: string;
  eventType: SecurityEventType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  sourceIP?: string;
  userAgent?: string;
  payload?: any;
  tags: string[];
  correlationId?: string;
}

export type SecurityEventType = 
  | 'AUTHENTICATION_FAILURE'
  | 'AUTHENTICATION_SUCCESS'
  | 'UNAUTHORIZED_ACCESS'
  | 'SUSPICIOUS_ACTIVITY'
  | 'DATA_EXFILTRATION'
  | 'MALWARE_DETECTED'
  | 'NETWORK_ANOMALY'
  | 'CONFIGURATION_CHANGE'
  | 'PRIVILEGE_ESCALATION'
  | 'BRUTE_FORCE_ATTACK';

export interface AnomalyDetectionModel {
  deviceId: string;
  modelType: 'STATISTICAL' | 'MACHINE_LEARNING' | 'RULE_BASED';
  parameters: any;
  trainingData: SecurityEvent[];
  threshold: number;
  lastTrained: Date;
  accuracy: number;
}

export interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  anomaliesDetected: number;
  falsePositives: number;
  averageResponseTime: number;
  threatsBlocked: number;
  systemHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  events: SecurityEvent[];
  deviceIds: string[];
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  assignedTo?: string;
  resolvedAt?: Date;
  automatedResponse: boolean;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'CHART' | 'METRIC' | 'LIST' | 'MAP' | 'GAUGE';
  data: any;
  refreshInterval: number; // in seconds
  position: { x: number; y: number; width: number; height: number };
}

export class SecurityMonitoringSystem extends EventEmitter {
  private events: SecurityEvent[] = [];
  private alerts: SecurityAlert[] = [];
  private models: Map<string, AnomalyDetectionModel> = new Map();
  private metrics: SecurityMetrics;
  private dashboardWidgets: DashboardWidget[] = [];
  private correlationRules: CorrelationRule[] = [];
  private readonly dataPath: string;
  private readonly maxEventsInMemory = 10000;

  constructor(dataPath: string = './security-monitoring') {
    super();
    this.dataPath = dataPath;
    this.metrics = this.initializeMetrics();
    this.initializeSystem();
    this.setupCorrelationRules();
    this.startEventProcessing();
  }

  /**
   * Initialize the security monitoring system
   */
  private async initializeSystem(): Promise<void> {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadHistoricalData();
      this.setupDashboard();
      console.log('Security Monitoring System initialized');
    } catch (error) {
      console.error('Failed to initialize security monitoring system:', error);
    }
  }

  /**
   * Ingest security events from various sources
   */
  async ingestEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date()
    };

    // Add to event stream
    this.events.push(securityEvent);
    
    // Maintain memory limit
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(-this.maxEventsInMemory);
    }

    // Update metrics
    this.updateMetrics(securityEvent);

    // Perform real-time analysis
    await this.analyzeEvent(securityEvent);

    // Check for correlations
    await this.correlateEvents(securityEvent);

    // Emit event for real-time processing
    this.emit('securityEvent', securityEvent);

    console.log(`Security event ingested: ${securityEvent.eventType} from ${securityEvent.deviceId}`);
  }

  /**
   * Machine Learning-based Anomaly Detection
   */
  async detectAnomalies(deviceId: string, events: SecurityEvent[]): Promise<SecurityEvent[]> {
    const model = this.models.get(deviceId);
    if (!model) {
      // Create new model for device
      await this.trainAnomalyModel(deviceId, events);
      return [];
    }

    const anomalies: SecurityEvent[] = [];

    for (const event of events) {
      const isAnomaly = await this.evaluateAnomaly(event, model);
      if (isAnomaly) {
        // Tag as anomaly
        event.tags.push('ANOMALY');
        anomalies.push(event);

        // Create alert for significant anomalies
        if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
          await this.createAlert({
            title: `Anomaly Detected: ${event.eventType}`,
            description: `Machine learning model detected anomalous behavior from device ${event.deviceId}`,
            severity: event.severity,
            events: [event],
            deviceIds: [event.deviceId],
            automatedResponse: true
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Train anomaly detection model for a device
   */
  async trainAnomalyModel(deviceId: string, trainingData: SecurityEvent[]): Promise<void> {
    console.log(`Training anomaly detection model for device: ${deviceId}`);

    const model: AnomalyDetectionModel = {
      deviceId,
      modelType: 'STATISTICAL',
      parameters: this.calculateStatisticalParameters(trainingData),
      trainingData,
      threshold: 0.95, // 95% confidence interval
      lastTrained: new Date(),
      accuracy: 0.85 // Initial accuracy estimate
    };

    this.models.set(deviceId, model);
    console.log(`Anomaly detection model trained for device: ${deviceId}`);
  }

  /**
   * Evaluate if an event is anomalous using the trained model
   */
  private async evaluateAnomaly(event: SecurityEvent, model: AnomalyDetectionModel): Promise<boolean> {
    switch (model.modelType) {
      case 'STATISTICAL':
        return this.statisticalAnomalyDetection(event, model);
      case 'MACHINE_LEARNING':
        return this.mlAnomalyDetection(event, model);
      case 'RULE_BASED':
        return this.ruleBasedAnomalyDetection(event, model);
      default:
        return false;
    }
  }

  /**
   * Statistical anomaly detection (Z-score based)
   */
  private statisticalAnomalyDetection(event: SecurityEvent, model: AnomalyDetectionModel): boolean {
    const params = model.parameters;
    
    // Check frequency anomaly
    const eventFrequency = this.calculateEventFrequency(event.deviceId, event.eventType);
    const zScore = Math.abs((eventFrequency - params.meanFrequency) / params.stdDevFrequency);
    
    if (zScore > 2.5) { // Events beyond 2.5 standard deviations
      return true;
    }

    // Check timing anomaly
    const timingSinceLastEvent = this.getTimingSinceLastEvent(event.deviceId, event.eventType);
    const timingZScore = Math.abs((timingSinceLastEvent - params.meanTiming) / params.stdDevTiming);
    
    if (timingZScore > 3.0) { // Timing beyond 3 standard deviations
      return true;
    }

    return false;
  }

  /**
   * Machine Learning anomaly detection (simplified implementation)
   */
  private mlAnomalyDetection(event: SecurityEvent, model: AnomalyDetectionModel): boolean {
    // Simplified ML approach - feature vector comparison
    const eventFeatures = this.extractFeatures(event);
    const modelFeatures = model.parameters.normalFeatures;
    
    const distance = this.calculateEuclideanDistance(eventFeatures, modelFeatures);
    const threshold = model.parameters.distanceThreshold;
    
    return distance > threshold;
  }

  /**
   * Rule-based anomaly detection
   */
  private ruleBasedAnomalyDetection(event: SecurityEvent, model: AnomalyDetectionModel): boolean {
    const rules = model.parameters.rules;
    
    for (const rule of rules) {
      if (this.evaluateRule(event, rule)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Event correlation engine
   */
  async correlateEvents(newEvent: SecurityEvent): Promise<void> {
    for (const rule of this.correlationRules) {
      const correlatedEvents = await this.findCorrelatedEvents(newEvent, rule);
      
      if (correlatedEvents.length >= rule.minEvents) {
        const deviceIdSet = new Set(correlatedEvents.map(e => e.deviceId));
        const deviceIds = Array.from(deviceIdSet);
        
        // Create correlated alert
        await this.createAlert({
          title: rule.alertTitle,
          description: rule.description,
          severity: rule.severity,
          events: correlatedEvents,
          deviceIds,
          automatedResponse: rule.automatedResponse
        });
      }
    }
  }

  /**
   * Create security alert
   */
  async createAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'status'>): Promise<SecurityAlert> {
    const alert: SecurityAlert = {
      ...alertData,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      status: 'OPEN'
    };

    this.alerts.push(alert);

    // Emit alert for real-time notification
    this.emit('securityAlert', alert);

    // Auto-assign based on severity
    if (alert.severity === 'CRITICAL') {
      alert.assignedTo = 'security-team-lead';
    }

    // Trigger automated response if configured
    if (alert.automatedResponse) {
      await this.executeAutomatedResponse(alert);
    }

    console.log(`Security alert created: ${alert.title} (${alert.severity})`);
    return alert;
  }

  /**
   * Execute automated response to security alerts
   */
  private async executeAutomatedResponse(alert: SecurityAlert): Promise<void> {
    console.log(`Executing automated response for alert: ${alert.id}`);

    for (const deviceId of alert.deviceIds) {
      switch (alert.severity) {
        case 'CRITICAL':
          // Isolate device from network
          await this.isolateDevice(deviceId);
          // Collect forensic data
          await this.collectForensicData(deviceId);
          break;
        
        case 'HIGH':
          // Increase monitoring
          await this.increaseMonitoring(deviceId);
          // Require re-authentication
          await this.requireReAuthentication(deviceId);
          break;
        
        case 'MEDIUM':
          // Log additional details
          await this.enhanceLogging(deviceId);
          break;
      }
    }
  }

  /**
   * Setup security dashboard with various widgets
   */
  private setupDashboard(): void {
    this.dashboardWidgets = [
      {
        id: 'security-overview',
        title: 'Security Overview',
        type: 'METRIC',
        data: () => this.getSecurityOverview(),
        refreshInterval: 30,
        position: { x: 0, y: 0, width: 6, height: 3 }
      },
      {
        id: 'threat-feed',
        title: 'Live Threat Feed',
        type: 'LIST',
        data: () => this.getLatestThreats(),
        refreshInterval: 10,
        position: { x: 6, y: 0, width: 6, height: 3 }
      },
      {
        id: 'device-security-map',
        title: 'Device Security Status',
        type: 'MAP',
        data: () => this.getDeviceSecurityMap(),
        refreshInterval: 60,
        position: { x: 0, y: 3, width: 8, height: 4 }
      },
      {
        id: 'anomaly-detection',
        title: 'Anomaly Detection',
        type: 'CHART',
        data: () => this.getAnomalyChart(),
        refreshInterval: 30,
        position: { x: 8, y: 3, width: 4, height: 4 }
      },
      {
        id: 'security-score',
        title: 'Security Score',
        type: 'GAUGE',
        data: () => this.calculateSecurityScore(),
        refreshInterval: 300,
        position: { x: 0, y: 7, width: 3, height: 3 }
      },
      {
        id: 'incident-timeline',
        title: 'Incident Timeline',
        type: 'CHART',
        data: () => this.getIncidentTimeline(),
        refreshInterval: 60,
        position: { x: 3, y: 7, width: 9, height: 3 }
      }
    ];
  }

  /**
   * Get dashboard data for security overview
   */
  private getSecurityOverview(): any {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp > last24Hours);
    
    return {
      totalEvents: recentEvents.length,
      criticalEvents: recentEvents.filter(e => e.severity === 'CRITICAL').length,
      highSeverityEvents: recentEvents.filter(e => e.severity === 'HIGH').length,
      activeAlerts: this.alerts.filter(a => a.status === 'OPEN').length,
      devicesMonitored: new Set(this.events.map(e => e.deviceId)).size,
      anomaliesDetected: recentEvents.filter(e => e.tags.includes('ANOMALY')).length
    };
  }

  /**
   * Get latest threat intelligence
   */
  private getLatestThreats(): any[] {
    return this.alerts
      .filter(a => a.status === 'OPEN')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)
      .map(alert => ({
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        timestamp: alert.timestamp,
        deviceCount: alert.deviceIds.length
      }));
  }

  /**
   * Get device security status map
   */
  private getDeviceSecurityMap(): any {
    const deviceMap = new Map<string, any>();
    
    for (const event of this.events) {
      if (!deviceMap.has(event.deviceId)) {
        deviceMap.set(event.deviceId, {
          deviceId: event.deviceId,
          riskLevel: 'LOW',
          lastSeen: event.timestamp,
          eventCount: 0,
          anomalies: 0
        });
      }
      
      const device = deviceMap.get(event.deviceId)!;
      device.eventCount++;
      device.lastSeen = new Date(Math.max(device.lastSeen.getTime(), event.timestamp.getTime()));
      
      if (event.tags.includes('ANOMALY')) {
        device.anomalies++;
      }
      
      // Calculate risk level
      if (device.anomalies > 5) device.riskLevel = 'CRITICAL';
      else if (device.anomalies > 2) device.riskLevel = 'HIGH';
      else if (device.anomalies > 0) device.riskLevel = 'MEDIUM';
    }
    
    return Array.from(deviceMap.values());
  }

  /**
   * Calculate overall security score
   */
  private calculateSecurityScore(): number {
    const overview = this.getSecurityOverview();
    let score = 100;
    
    // Deduct points for issues
    score -= overview.criticalEvents * 10;
    score -= overview.highSeverityEvents * 5;
    score -= overview.activeAlerts * 3;
    score -= overview.anomaliesDetected * 2;
    
    return Math.max(score, 0);
  }

  /**
   * Helper methods for anomaly detection
   */
  private calculateStatisticalParameters(events: SecurityEvent[]): any {
    const frequencies = this.calculateEventFrequencies(events);
    const timings = this.calculateEventTimings(events);
    
    return {
      meanFrequency: this.mean(frequencies),
      stdDevFrequency: this.standardDeviation(frequencies),
      meanTiming: this.mean(timings),
      stdDevTiming: this.standardDeviation(timings)
    };
  }

  private calculateEventFrequency(deviceId: string, eventType: SecurityEventType): number {
    const deviceEvents = this.events.filter(e => e.deviceId === deviceId && e.eventType === eventType);
    const hours = 24; // Calculate frequency over last 24 hours
    return deviceEvents.length / hours;
  }

  private getTimingSinceLastEvent(deviceId: string, eventType: SecurityEventType): number {
    const deviceEvents = this.events
      .filter(e => e.deviceId === deviceId && e.eventType === eventType)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    if (deviceEvents.length < 2) return 0;
    
    return deviceEvents[0].timestamp.getTime() - deviceEvents[1].timestamp.getTime();
  }

  private extractFeatures(event: SecurityEvent): number[] {
    // Extract numerical features for ML
    return [
      event.timestamp.getHours(), // Hour of day
      event.timestamp.getDay(), // Day of week
      event.tags.length, // Number of tags
      event.description.length, // Description length
      event.sourceIP ? this.ipToNumber(event.sourceIP) : 0
    ];
  }

  private calculateEuclideanDistance(features1: number[], features2: number[]): number {
    let sum = 0;
    for (let i = 0; i < features1.length; i++) {
      sum += Math.pow(features1[i] - features2[i], 2);
    }
    return Math.sqrt(sum);
  }

  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
  }

  private mean(numbers: number[]): number {
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private standardDeviation(numbers: number[]): number {
    const avg = this.mean(numbers);
    const squareDiffs = numbers.map(n => Math.pow(n - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  // Automated response methods (simplified implementations)
  private async isolateDevice(deviceId: string): Promise<void> {
    console.log(`Isolating device from network: ${deviceId}`);
    // Implementation would involve network isolation
  }

  private async collectForensicData(deviceId: string): Promise<void> {
    console.log(`Collecting forensic data from device: ${deviceId}`);
    // Implementation would involve data collection for forensic analysis
  }

  private async increaseMonitoring(deviceId: string): Promise<void> {
    console.log(`Increasing monitoring for device: ${deviceId}`);
    // Implementation would involve increasing log levels and monitoring frequency
  }

  private async requireReAuthentication(deviceId: string): Promise<void> {
    console.log(`Requiring re-authentication for device: ${deviceId}`);
    // Implementation would involve forcing device re-authentication
  }

  private async enhanceLogging(deviceId: string): Promise<void> {
    console.log(`Enhancing logging for device: ${deviceId}`);
    // Implementation would involve detailed logging configuration
  }

  // System management methods
  private initializeMetrics(): SecurityMetrics {
    return {
      totalEvents: 0,
      criticalEvents: 0,
      anomaliesDetected: 0,
      falsePositives: 0,
      averageResponseTime: 0,
      threatsBlocked: 0,
      systemHealth: 'HEALTHY'
    };
  }

  private updateMetrics(event: SecurityEvent): void {
    this.metrics.totalEvents++;
    if (event.severity === 'CRITICAL') {
      this.metrics.criticalEvents++;
    }
    if (event.tags.includes('ANOMALY')) {
      this.metrics.anomaliesDetected++;
    }
  }

  private setupCorrelationRules(): void {
    this.correlationRules = [
      {
        name: 'Brute Force Attack',
        events: ['AUTHENTICATION_FAILURE'],
        timeWindow: 300000, // 5 minutes
        minEvents: 5,
        severity: 'HIGH',
        alertTitle: 'Potential Brute Force Attack',
        description: 'Multiple authentication failures detected',
        automatedResponse: true
      },
      {
        name: 'Data Exfiltration',
        events: ['UNAUTHORIZED_ACCESS', 'DATA_EXFILTRATION'],
        timeWindow: 600000, // 10 minutes
        minEvents: 2,
        severity: 'CRITICAL',
        alertTitle: 'Potential Data Exfiltration',
        description: 'Unauthorized access followed by data exfiltration',
        automatedResponse: true
      }
    ];
  }

  // Additional helper methods would be implemented here...
  private async findCorrelatedEvents(event: SecurityEvent, rule: CorrelationRule): Promise<SecurityEvent[]> {
    // Implementation for finding correlated events
    return [];
  }

  private evaluateRule(event: SecurityEvent, rule: any): boolean {
    // Implementation for rule evaluation
    return false;
  }

  private calculateEventFrequencies(events: SecurityEvent[]): number[] {
    // Implementation for calculating event frequencies
    return [];
  }

  private calculateEventTimings(events: SecurityEvent[]): number[] {
    // Implementation for calculating event timings
    return [];
  }

  private async analyzeEvent(event: SecurityEvent): Promise<void> {
    // Implementation for real-time event analysis
  }

  private async loadHistoricalData(): Promise<void> {
    // Implementation for loading historical security data
  }

  private startEventProcessing(): void {
    // Implementation for starting continuous event processing
  }

  private getAnomalyChart(): any {
    // Implementation for anomaly detection chart data
    return {};
  }

  private getIncidentTimeline(): any {
    // Implementation for incident timeline data
    return {};
  }
}

// Supporting interfaces
interface CorrelationRule {
  name: string;
  events: SecurityEventType[];
  timeWindow: number;
  minEvents: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  alertTitle: string;
  description: string;
  automatedResponse: boolean;
}

// Example usage and testing
export class SecurityMonitoringTester {
  static async runTests(): Promise<void> {
    console.log('=== Security Monitoring System Tests ===');
    
    const siem = new SecurityMonitoringSystem('./test-security-monitoring');
    
    // Set up event listeners
    siem.on('securityEvent', (event) => {
      console.log(`✓ Security event processed: ${event.eventType}`);
    });
    
    siem.on('securityAlert', (alert) => {
      console.log(`✓ Security alert created: ${alert.title} (${alert.severity})`);
    });

    try {
      // Test 1: Ingest various security events
      console.log('\n1. Testing security event ingestion...');
      
      const testEvents = [
        {
          source: 'auth-service',
          deviceId: 'device-001',
          eventType: 'AUTHENTICATION_FAILURE' as SecurityEventType,
          severity: 'MEDIUM' as const,
          description: 'Failed login attempt',
          sourceIP: '192.168.1.100',
          tags: ['authentication', 'failed-login']
        },
        {
          source: 'network-monitor',
          deviceId: 'device-002',
          eventType: 'SUSPICIOUS_ACTIVITY' as SecurityEventType,
          severity: 'HIGH' as const,
          description: 'Unusual network traffic pattern',
          sourceIP: '10.0.0.50',
          tags: ['network', 'anomaly']
        },
        {
          source: 'data-monitor',
          deviceId: 'device-001',
          eventType: 'DATA_EXFILTRATION' as SecurityEventType,
          severity: 'CRITICAL' as const,
          description: 'Large data transfer detected',
          tags: ['data', 'exfiltration']
        }
      ];
      
      for (const event of testEvents) {
        await siem.ingestEvent(event);
      }
      
      console.log('✓ Security events ingested successfully');
      
      // Test 2: Train anomaly detection model
      console.log('\n2. Testing anomaly detection...');
      // Generate training data
      const trainingEvents: SecurityEvent[] = [];
      for (let i = 0; i < 100; i++) {
        trainingEvents.push({
          id: crypto.randomUUID(),
          timestamp: new Date(Date.now() - i * 60000),
          source: 'test-source',
          deviceId: 'device-001',
          eventType: 'AUTHENTICATION_SUCCESS',
          severity: 'LOW',
          description: 'Normal login',
          tags: ['normal']
        });
      }
      
      await siem.trainAnomalyModel('device-001', trainingEvents);
      console.log('✓ Anomaly detection model trained');
      
      // Test 3: Detect anomalies
      const testEventsWithIds: SecurityEvent[] = testEvents.map(event => ({
        ...event,
        id: crypto.randomUUID(),
        timestamp: new Date()
      }));
      
      const anomalies = await siem.detectAnomalies('device-001', testEventsWithIds);
      console.log(`✓ Anomaly detection completed. Found ${anomalies.length} anomalies`);
      
      // Test 4: Dashboard data
      console.log('\n3. Testing dashboard functionality...');
      const overview = (siem as any).getSecurityOverview();
      console.log('✓ Security overview generated:', overview);
      
      const score = (siem as any).calculateSecurityScore();
      console.log(`✓ Security score calculated: ${score}`);
      
    } catch (error) {
      console.error('Security Monitoring test failed:', error);
    }
  }
}
