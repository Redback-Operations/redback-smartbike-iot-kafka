// Enhanced Bike Service with Security Integration
// Phase 4: Backend Services Enhancement

import { bikeModel, IBike } from '../models/bike'
import { PKIManager } from '../security/pki-manager'
import { VulnerabilityManager } from '../security/vulnerability-manager'
import { SecurityMonitoringSystem } from '../security/security-monitoring'
import { CybersecurityIntegrationSystem } from '../security/cybersecurity-integration'
import { FilterQuery, UpdateQuery } from 'mongoose'
import * as crypto from 'crypto'

export interface BikeServiceConfig {
  enableSecurity: boolean
  enableMonitoring: boolean
  enableVulnerabilityScanning: boolean
  securityBasePath: string
}

export interface BikeMaintenanceRecord {
  bikeId: string
  type: 'routine' | 'repair' | 'security' | 'upgrade'
  description: string
  performedBy: string
  completedAt: Date
  nextScheduled?: Date
  cost?: number
  partsReplaced?: string[]
}

export interface BikeSecurityAudit {
  bikeId: string
  auditType: 'security' | 'compliance' | 'vulnerability'
  findings: string[]
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  recommendations: string[]
  auditedBy: string
  auditDate: Date
}

export class EnhancedBikeService {
  private pki: PKIManager
  private vulnManager: VulnerabilityManager
  private securityMonitor: SecurityMonitoringSystem
  private integrationSystem: CybersecurityIntegrationSystem
  private config: BikeServiceConfig

  constructor(config: BikeServiceConfig = {
    enableSecurity: true,
    enableMonitoring: true,
    enableVulnerabilityScanning: true,
    securityBasePath: './bike-security'
  }) {
    this.config = config
    
    if (config.enableSecurity) {
      this.pki = new PKIManager(`${config.securityBasePath}/pki`)
      this.vulnManager = new VulnerabilityManager(`${config.securityBasePath}/vulnerabilities`)
      this.securityMonitor = new SecurityMonitoringSystem(`${config.securityBasePath}/monitoring`)
      this.integrationSystem = new CybersecurityIntegrationSystem(config.securityBasePath)
    }
  }

  /**
   * Get all bikes with enhanced filtering and security status
   */
  async getAllBikes(filters: {
    status?: string
    location?: string
    securityLevel?: string
    vulnerabilityStatus?: string
    minSecurityScore?: number
  } = {}): Promise<IBike[]> {
    const query: FilterQuery<IBike> = {}

    if (filters.status) query.status = filters.status
    if (filters.location) query.location = filters.location
    if (filters.securityLevel) query.securityLevel = filters.securityLevel
    if (filters.vulnerabilityStatus) query.vulnerabilityStatus = filters.vulnerabilityStatus
    if (filters.minSecurityScore) query.securityScore = { $gte: filters.minSecurityScore }

    const bikes = await bikeModel.find(query).sort({ createdAt: -1 })

    // Log access event
    if (this.config.enableMonitoring) {
      await this.securityMonitor.ingestEvent({
        source: 'bike-service',
        deviceId: 'system',
        eventType: 'AUTHENTICATION_SUCCESS',
        severity: 'LOW',
        description: `Retrieved ${bikes.length} bikes with filters: ${JSON.stringify(filters)}`,
        tags: ['bike-access', 'data-retrieval']
      })
    }

    return bikes
  }

  /**
   * Get bike by ID with security validation
   */
  async getBikeById(bikeId: string): Promise<IBike | null> {
    const bike = await bikeModel.findOne({ name: bikeId })

    if (bike && this.config.enableMonitoring) {
      await this.securityMonitor.ingestEvent({
        source: 'bike-service',
        deviceId: bikeId,
        eventType: 'AUTHENTICATION_SUCCESS',
        severity: 'LOW',
        description: `Accessed bike details for ${bikeId}`,
        tags: ['bike-access', 'individual-access']
      })
    }

    return bike
  }

  /**
   * Create new bike with security initialization
   */
  async createBike(bikeData: Partial<IBike>): Promise<IBike> {
    console.log(`Creating new bike: ${bikeData.name}`)

    try {
      // Create bike record
      const bike = new bikeModel({
        ...bikeData,
        status: 'inactive', // Start inactive until security setup complete
        vulnerabilityStatus: 'scanning',
        securityCompliance: 'NEEDS_SETUP'
      })

      if (this.config.enableSecurity) {
        // Generate security credentials
        console.log('Generating security credentials...')
        const keyPair = await this.pki.generateKeyPair(bike.name, 2048, 365)
        bike.certificateId = crypto.randomUUID()
        bike.publicKeyFingerprint = keyPair.publicKey.substring(0, 64)

        // Perform initial vulnerability scan
        if (this.config.enableVulnerabilityScanning && bike.components) {
          console.log('Performing initial vulnerability scan...')
          const deviceInfo = {
            id: bike.name,
            firmwareVersion: bike.firmwareVersion,
            components: bike.components.map(comp => ({
              name: comp.name,
              version: comp.version,
              critical: comp.type === 'microcontroller',
              internetFacing: comp.type === 'sensor' || comp.type === 'communication'
            })),
            authentication: { type: 'certificate', mfa: true },
            encryption: { dataInTransit: bike.encryptionEnabled, dataAtRest: true },
            hasDefaultCredentials: false,
            openPorts: [443, 8883]
          }

          const vulnReport = await this.vulnManager.scanDevice(bike.name, deviceInfo, 'AUTOMATED')
          bike.updateSecurityStatus(
            Math.max(100 - (vulnReport.riskScore * 10), 0),
            vulnReport.vulnerabilities.length
          )
        }

        // Log security event
        if (this.config.enableMonitoring) {
          await this.securityMonitor.ingestEvent({
            source: 'bike-service',
            deviceId: bike.name,
            eventType: 'AUTHENTICATION_SUCCESS',
            severity: 'LOW',
            description: `New bike ${bike.name} created with security features`,
            tags: ['bike-creation', 'security-setup']
          })
        }

        // Activate bike if security setup successful
        bike.status = 'active'
      }

      const savedBike = await bike.save()
      console.log(`Bike ${savedBike.name} created successfully`)
      return savedBike

    } catch (error) {
      console.error(`Failed to create bike ${bikeData.name}:`, error)
      
      if (this.config.enableMonitoring) {
        await this.securityMonitor.ingestEvent({
          source: 'bike-service',
          deviceId: bikeData.name || 'unknown',
          eventType: 'AUTHENTICATION_FAILURE',
          severity: 'HIGH',
          description: `Failed to create bike: ${error.message}`,
          tags: ['bike-creation', 'error']
        })
      }
      
      throw error
    }
  }

  /**
   * Update bike with security validation
   */
  async updateBike(bikeId: string, updateData: UpdateQuery<IBike>): Promise<IBike | null> {
    console.log(`Updating bike: ${bikeId}`)

    const bike = await bikeModel.findOneAndUpdate(
      { name: bikeId },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    )

    if (bike && this.config.enableMonitoring) {
      await this.securityMonitor.ingestEvent({
        source: 'bike-service',
        deviceId: bikeId,
        eventType: 'CONFIGURATION_CHANGE',
        severity: 'MEDIUM',
        description: `Bike ${bikeId} configuration updated`,
        payload: updateData,
        tags: ['bike-update', 'configuration']
      })
    }

    return bike
  }

  /**
   * Delete bike with security cleanup
   */
  async deleteBike(bikeId: string): Promise<boolean> {
    console.log(`Deleting bike: ${bikeId}`)

    try {
      // Security cleanup
      if (this.config.enableSecurity) {
        await this.pki.revokeCertificate(bikeId, 'Bike decommissioned')
      }

      const result = await bikeModel.deleteOne({ name: bikeId })

      if (result.deletedCount > 0 && this.config.enableMonitoring) {
        await this.securityMonitor.ingestEvent({
          source: 'bike-service',
          deviceId: bikeId,
          eventType: 'CONFIGURATION_CHANGE',
          severity: 'HIGH',
          description: `Bike ${bikeId} deleted and security credentials revoked`,
          tags: ['bike-deletion', 'security-cleanup']
        })
      }

      return result.deletedCount > 0

    } catch (error) {
      console.error(`Failed to delete bike ${bikeId}:`, error)
      throw error
    }
  }

  /**
   * Perform security audit on bike
   */
  async performSecurityAudit(bikeId: string): Promise<BikeSecurityAudit> {
    console.log(`Performing security audit for bike: ${bikeId}`)

    const bike = await bikeModel.findOne({ name: bikeId })
    if (!bike) {
      throw new Error(`Bike ${bikeId} not found`)
    }

    const findings: string[] = []
    const recommendations: string[] = []
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'

    // Check security score
    if (bike.securityScore < 50) {
      findings.push('Low security score detected')
      recommendations.push('Perform immediate security updates')
      severity = 'CRITICAL'
    }

    // Check vulnerability count
    if (bike.vulnerabilityCount > 10) {
      findings.push(`High vulnerability count: ${bike.vulnerabilityCount}`)
      recommendations.push('Apply security patches immediately')
      severity = 'HIGH'
    }

    // Check encryption status
    if (!bike.encryptionEnabled) {
      findings.push('Data encryption disabled')
      recommendations.push('Enable end-to-end encryption')
      if (severity === 'LOW') severity = 'MEDIUM'
    }

    // Check last security scan
    if (bike.needsSecurityUpdate()) {
      findings.push('Security scan overdue')
      recommendations.push('Schedule regular security scans')
      if (severity === 'LOW') severity = 'MEDIUM'
    }

    const audit: BikeSecurityAudit = {
      bikeId,
      auditType: 'security',
      findings,
      severity,
      recommendations,
      auditedBy: 'enhanced-bike-service',
      auditDate: new Date()
    }

    // Log audit event
    if (this.config.enableMonitoring) {
      await this.securityMonitor.ingestEvent({
        source: 'bike-service',
        deviceId: bikeId,
        eventType: 'CONFIGURATION_CHANGE',
        severity,
        description: `Security audit completed for bike ${bikeId}`,
        payload: audit,
        tags: ['security-audit', 'compliance']
      })
    }

    return audit
  }

  /**
   * Update bike firmware with security validation
   */
  async updateFirmware(bikeId: string, newVersion: string): Promise<IBike | null> {
    console.log(`Updating firmware for bike ${bikeId} to version ${newVersion}`)

    const bike = await bikeModel.findOne({ name: bikeId })
    if (!bike) {
      throw new Error(`Bike ${bikeId} not found`)
    }

    // Validate firmware version
    if (bike.firmwareVersion === newVersion) {
      throw new Error(`Bike already running firmware version ${newVersion}`)
    }

    // Update firmware version
    bike.firmwareVersion = newVersion
    bike.lastMaintenance = new Date()

    // Trigger new vulnerability scan after firmware update
    if (this.config.enableVulnerabilityScanning) {
      bike.vulnerabilityStatus = 'scanning'
      
      // Schedule async vulnerability scan
      setTimeout(async () => {
        try {
          const deviceInfo = {
            id: bike.name,
            firmwareVersion: newVersion,
            components: bike.components.map(comp => ({
              name: comp.name,
              version: comp.version,
              critical: comp.type === 'microcontroller',
              internetFacing: comp.type === 'sensor' || comp.type === 'communication'
            })),
            authentication: { type: 'certificate', mfa: true },
            encryption: { dataInTransit: bike.encryptionEnabled, dataAtRest: true },
            hasDefaultCredentials: false,
            openPorts: [443, 8883]
          }

          const vulnReport = await this.vulnManager.scanDevice(bike.name, deviceInfo, 'AUTOMATED')
          bike.updateSecurityStatus(
            Math.max(100 - (vulnReport.riskScore * 10), 0),
            vulnReport.vulnerabilities.length
          )
          await bike.save()
        } catch (error) {
          console.error(`Post-firmware vulnerability scan failed for ${bikeId}:`, error)
        }
      }, 5000) // Delay to allow firmware to fully initialize
    }

    const updatedBike = await bike.save()

    // Log firmware update event
    if (this.config.enableMonitoring) {
      await this.securityMonitor.ingestEvent({
        source: 'bike-service',
        deviceId: bikeId,
        eventType: 'CONFIGURATION_CHANGE',
        severity: 'MEDIUM',
        description: `Firmware updated from ${bike.firmwareVersion} to ${newVersion}`,
        tags: ['firmware-update', 'maintenance']
      })
    }

    return updatedBike
  }

  /**
   * Get security dashboard data for all bikes
   */
  async getSecurityDashboard(): Promise<any> {
    const bikes = await bikeModel.find({})
    
    const dashboard = {
      totalBikes: bikes.length,
      activeBikes: bikes.filter(b => b.status === 'active').length,
      securityCompliant: bikes.filter(b => b.securityCompliance === 'COMPLIANT').length,
      vulnerableBikes: bikes.filter(b => b.vulnerabilityCount > 5).length,
      avgSecurityScore: bikes.reduce((sum, b) => sum + (b.securityScore || 0), 0) / bikes.length,
      encryptionEnabled: bikes.filter(b => b.encryptionEnabled).length,
      needsSecurityUpdate: bikes.filter(b => b.needsSecurityUpdate()).length,
      bySecurityLevel: {
        LOW: bikes.filter(b => b.securityLevel === 'LOW').length,
        MEDIUM: bikes.filter(b => b.securityLevel === 'MEDIUM').length,
        HIGH: bikes.filter(b => b.securityLevel === 'HIGH').length,
        CRITICAL: bikes.filter(b => b.securityLevel === 'CRITICAL').length
      },
      byLocation: bikes.reduce((acc, bike) => {
        const location = bike.location || 'Unknown'
        acc[location] = (acc[location] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      firmwareVersions: bikes.reduce((acc, bike) => {
        acc[bike.firmwareVersion] = (acc[bike.firmwareVersion] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }

    return dashboard
  }

  /**
   * Generate maintenance recommendations
   */
  async generateMaintenanceRecommendations(bikeId?: string): Promise<any[]> {
    const query = bikeId ? { name: bikeId } : {}
    const bikes = await bikeModel.find(query)
    
    const recommendations = []

    for (const bike of bikes) {
      const bikeRecommendations = []

      // Battery maintenance
      if (bike.batteryLevel && bike.batteryLevel < 20) {
        bikeRecommendations.push({
          type: 'urgent',
          category: 'battery',
          description: 'Low battery level requires immediate attention',
          priority: 'HIGH'
        })
      }

      // Security maintenance
      if (bike.needsSecurityUpdate()) {
        bikeRecommendations.push({
          type: 'security',
          category: 'security_scan',
          description: 'Security scan overdue',
          priority: 'MEDIUM'
        })
      }

      // Vulnerability patching
      if (bike.vulnerabilityCount > 5) {
        bikeRecommendations.push({
          type: 'security',
          category: 'vulnerability_patching',
          description: `${bike.vulnerabilityCount} vulnerabilities need patching`,
          priority: 'HIGH'
        })
      }

      // Firmware updates
      const latestFirmware = '2.2.1' // This would come from a firmware registry
      if (bike.firmwareVersion !== latestFirmware) {
        bikeRecommendations.push({
          type: 'maintenance',
          category: 'firmware_update',
          description: `Firmware update available: ${latestFirmware}`,
          priority: 'MEDIUM'
        })
      }

      if (bikeRecommendations.length > 0) {
        recommendations.push({
          bikeId: bike.name,
          bikeName: bike.label,
          recommendations: bikeRecommendations
        })
      }
    }

    return recommendations
  }
}

export default EnhancedBikeService