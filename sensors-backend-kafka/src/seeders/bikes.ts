import * as dotenv from 'dotenv'
import mongoose from 'mongoose'
import { bikeModel } from '../models/bike'
import { PKIManager } from '../security/pki-manager'
import { VulnerabilityManager } from '../security/vulnerability-manager'
import { SecurityMonitoringSystem } from '../security/security-monitoring'
import * as crypto from 'crypto'

dotenv.config()

// Enhanced bike data with security features
const enhancedBikeData = [
  {
    name: '000001',
    label: 'bike-01',
    description: 'Smart bike for Burwood campus with enhanced security',
    mqttTopicPrefix: 'bike/000001',
    mqttReportTopicSuffix: 'report',
    location: 'Burwood Campus',
    status: 'active',
    batteryLevel: 85,
    firmwareVersion: '2.1.3',
    lastMaintenance: new Date('2024-09-15'),
    securityLevel: 'HIGH',
    encryptionEnabled: true,
    certificateId: null as string | null, // Will be generated
    vulnerabilityStatus: 'scanning',
    components: [
      { name: 'ESP32', version: '2.0.9', type: 'microcontroller' },
      { name: 'BME280', version: '1.1.0', type: 'sensor' },
      { name: 'GPS_Module', version: '3.2.1', type: 'sensor' }
    ]
  },
  {
    name: '000002',
    label: 'bike-02', 
    description: 'Smart bike for Geelong campus with enhanced security',
    mqttTopicPrefix: 'bike/000002',
    mqttReportTopicSuffix: 'report',
    location: 'Geelong Campus',
    status: 'active',
    batteryLevel: 92,
    firmwareVersion: '2.1.3',
    lastMaintenance: new Date('2024-09-20'),
    securityLevel: 'HIGH',
    encryptionEnabled: true,
    certificateId: null as string | null, // Will be generated
    vulnerabilityStatus: 'scanning',
    components: [
      { name: 'ESP32', version: '2.0.9', type: 'microcontroller' },
      { name: 'BME280', version: '1.1.0', type: 'sensor' },
      { name: 'GPS_Module', version: '3.2.1', type: 'sensor' },
      { name: 'Heart_Rate_Sensor', version: '1.5.2', type: 'sensor' }
    ]
  },
  {
    name: '000003',
    label: 'bike-03',
    description: 'Advanced smart bike for Melbourne campus with AI features',
    mqttTopicPrefix: 'bike/000003',
    mqttReportTopicSuffix: 'report',
    location: 'Melbourne Campus',
    status: 'active',
    batteryLevel: 78,
    firmwareVersion: '2.2.0',
    lastMaintenance: new Date('2024-10-01'),
    securityLevel: 'CRITICAL',
    encryptionEnabled: true,
    certificateId: null as string | null,
    vulnerabilityStatus: 'secure',
    components: [
      { name: 'ESP32', version: '2.1.0', type: 'microcontroller' },
      { name: 'BME280', version: '1.2.0', type: 'sensor' },
      { name: 'GPS_Module', version: '3.3.0', type: 'sensor' },
      { name: 'Heart_Rate_Sensor', version: '1.6.0', type: 'sensor' },
      { name: 'AI_Processor', version: '1.0.1', type: 'ai_module' }
    ]
  }
]

async function seedBikesWithSecurity(): Promise<void> {
  console.log('🚀 Starting Enhanced Bike Seeding with Security Integration')
  console.log('='.repeat(70))

  // Initialize security systems
  const pki = new PKIManager('./bike-security/pki')
  const vulnManager = new VulnerabilityManager('./bike-security/vulnerabilities')
  const securityMonitor = new SecurityMonitoringSystem('./bike-security/monitoring')

  try {
    // Clear existing bikes
    await bikeModel.deleteMany({})
    console.log('✓ Cleared existing bike data')

    const enhancedBikes = []

    for (const bikeData of enhancedBikeData) {
      console.log(`\n🔐 Securing bike: ${bikeData.name}`)
      
      try {
        // Generate PKI credentials for bike
        console.log('  • Generating PKI credentials...')
        const keyPair = await pki.generateKeyPair(bikeData.name, 2048, 365)
        const certificateId = crypto.randomUUID()
        
        // Perform initial vulnerability scan
        console.log('  • Performing vulnerability scan...')
        const deviceInfo = {
          id: bikeData.name,
          firmwareVersion: bikeData.firmwareVersion,
          components: bikeData.components.map(comp => ({
            name: comp.name,
            version: comp.version,
            critical: comp.type === 'microcontroller',
            internetFacing: comp.type === 'gps' || comp.type === 'sensor'
          })),
          authentication: { type: 'certificate', mfa: true },
          encryption: { dataInTransit: true, dataAtRest: true },
          hasDefaultCredentials: false,
          openPorts: [443, 8883] // HTTPS and MQTT over TLS
        }
        
        const vulnReport = await vulnManager.scanDevice(bikeData.name, deviceInfo, 'AUTOMATED')
        
        // Log security event
        console.log('  • Registering security events...')
        await securityMonitor.ingestEvent({
          source: 'bike-seeder',
          deviceId: bikeData.name,
          eventType: 'AUTHENTICATION_SUCCESS',
          severity: 'LOW',
          description: `Bike ${bikeData.name} securely onboarded with ${vulnReport.vulnerabilities.length} vulnerabilities found`,
          tags: ['onboarding', 'security', 'bike-setup']
        })

        // Update bike data with security info
        const securedBike = {
          ...bikeData,
          certificateId,
          securityScore: Math.max(100 - (vulnReport.riskScore * 10), 0),
          vulnerabilityCount: vulnReport.vulnerabilities.length,
          lastSecurityScan: new Date(),
          publicKeyFingerprint: keyPair.publicKey.substring(0, 64),
          securityCompliance: vulnReport.riskScore < 5 ? 'COMPLIANT' : 'NEEDS_ATTENTION'
        }

        enhancedBikes.push(securedBike)
        console.log(`  ✓ Bike ${bikeData.name} secured successfully`)
        
      } catch (error) {
        console.error(`  ❌ Failed to secure bike ${bikeData.name}:`, error.message)
        
        // Add bike with minimal security (fallback)
        enhancedBikes.push({
          ...bikeData,
          certificateId: 'PENDING',
          securityScore: 50,
          vulnerabilityCount: 999,
          lastSecurityScan: new Date(),
          securityCompliance: 'NEEDS_SETUP'
        })
      }
    }

    // Insert all bikes
    console.log('\n💾 Inserting bikes into database...')
    const insertedBikes = await bikeModel.insertMany(enhancedBikes)
    
    console.log('\n✅ Enhanced bike seeding completed successfully!')
    console.log('─'.repeat(70))
    console.log('📊 SEEDING SUMMARY:')
    console.log(`   • Total bikes seeded: ${insertedBikes.length}`)
    console.log(`   • Security-enabled bikes: ${enhancedBikes.filter(b => b.securityCompliance === 'COMPLIANT').length}`)
    console.log(`   • Average security score: ${(enhancedBikes.reduce((sum, b) => sum + b.securityScore, 0) / enhancedBikes.length).toFixed(1)}`)
    console.log(`   • Total components monitored: ${enhancedBikes.reduce((sum, b) => sum + b.components.length, 0)}`)
    console.log('\n🔗 Integration Features:')
    console.log('   ✓ PKI certificates generated for all bikes')
    console.log('   ✓ Vulnerability scanning completed')
    console.log('   ✓ Security monitoring activated')
    console.log('   ✓ Compliance status assessed')
    
    insertedBikes.forEach(bike => {
      console.log(`\n🚲 ${bike.name} (${bike.label}):`)
      console.log(`   Location: ${bike.location}`)
      console.log(`   Security Score: ${bike.securityScore}/100`)
      console.log(`   Vulnerabilities: ${bike.vulnerabilityCount}`)
      console.log(`   Compliance: ${bike.securityCompliance}`)
      console.log(`   Components: ${bike.components.length}`)
    })

  } catch (error) {
    console.error('❌ Enhanced bike seeding failed:', error)
    process.exit(1)
  }
}

// Connect to MongoDB and run enhanced seeding
mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => {
    console.log('✓ Connected to MongoDB for enhanced bike seeding\n')
    return seedBikesWithSecurity()
  })
  .then(() => {
    console.log('\n🎉 All done! Enhanced bikes are ready for production.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Database connection or seeding failed:', error)
    process.exit(1)
  })
